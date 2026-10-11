#!/usr/bin/env bash
# Deploy an already built, verified ARM64 release. This script never builds the app.
set -Eeuo pipefail
umask 077

log() { printf '[hearth] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
valid_image() { [[ "$1" =~ ^hearth:[a-f0-9]{40}$ ]]; }

[[ $# -eq 2 ]] || die 'Usage: deploy.sh STAGING_DIRECTORY hearth:FULL_40_CHARACTER_COMMIT_SHA'
[[ $(uname -s) == Linux && $(uname -m) == aarch64 ]] || die 'This release requires a Linux ARM64 (aarch64) server.'
for command in docker flock sha256sum gzip python3 realpath df mktemp; do
  command -v "$command" >/dev/null || die "Required command is missing: $command"
done
image=$2
valid_image "$image" || die 'Use an immutable image tag: hearth:<40 lowercase hexadecimal commit characters>.'
stage=$(realpath -e -- "$1")
[[ -d "$stage" ]] || die 'The staging directory does not exist.'
install_dir=${HEARTH_INSTALL_DIR:-/opt/hearth}
[[ "$install_dir" == /* && "$install_dir" != / && "$install_dir" != *','* ]] || die 'HEARTH_INSTALL_DIR must be an absolute directory path without commas.'
mkdir -p -- "$install_dir"
install_dir=$(realpath -e -- "$install_dir")
[[ "$stage" != "$install_dir" ]] || die 'Use a separate staging directory.'
env_file=$install_dir/production.env
compose_file=$install_dir/compose.production.yaml
caddy_file=$install_dir/Caddyfile
marker=$install_dir/current-image.env
[[ -f "$env_file" && ! -L "$env_file" ]] || die 'Create a private production.env in the installation directory before deploying.'

exec 9>"$install_dir/deploy.lock"
flock -n 9 || die 'Another deployment holds the server deployment lock. Retry when it finishes.'
docker compose version >/dev/null

# Reject extra manifest paths, duplicate entries, and symlinked release artifacts.
for filename in SHA256SUMS image.tar.gz compose.production.yaml Caddyfile deploy.sh; do
  [[ -f "$stage/$filename" && ! -L "$stage/$filename" ]] || die "Missing or symlinked release artifact: $filename"
done
python3 - "$stage/SHA256SUMS" <<'PY'
import re, sys
expected = {'image.tar.gz', 'compose.production.yaml', 'Caddyfile', 'deploy.sh'}
try:
    lines = open(sys.argv[1], encoding='utf-8').read().splitlines()
    names = []
    for line in lines:
        match = re.fullmatch(r'[a-fA-F0-9]{64}  ([A-Za-z0-9_.-]+)', line)
        if not match:
            raise ValueError()
        names.append(match[1])
    if len(names) != 4 or set(names) != expected:
        raise ValueError()
except (OSError, ValueError, UnicodeError):
    print('[hearth] ERROR: SHA256SUMS must contain exactly the four release artifacts.', file=sys.stderr)
    sys.exit(1)
PY
(cd -- "$stage" && sha256sum --check --strict SHA256SUMS) || die 'Release checksums failed; no application was stopped.'

# Read only the one non-secret switch; do not source arbitrary dotenv contents.
edge=$(python3 - "$env_file" <<'PY'
import re, sys
value = 'false'
for raw in open(sys.argv[1], encoding='utf-8'):
    match = re.match(r'^\s*HEARTH_EDGE_ENABLED\s*=\s*(.*?)\s*$', raw)
    if match:
        value = match[1]
        if len(value) >= 2 and value[0] in "'\"" and value[-1] == value[0]:
            value = value[1:-1]
        if value not in ('true', 'false'):
            print('[hearth] ERROR: HEARTH_EDGE_ENABLED must be the literal true or false.', file=sys.stderr)
            sys.exit(1)
print(value)
PY
)

compose() {
  local image_tag=$1 config_path=$2 edge_enabled=$3
  shift 3
  local flags=(--env-file "$env_file" --file "$config_path" --project-name hearth-production)
  [[ "$edge_enabled" == true ]] && flags+=(--profile edge)
  HEARTH_IMAGE="$image_tag" docker compose "${flags[@]}" "$@"
}

release_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
scratch=$(mktemp -d "$install_dir/.deploy.XXXXXX")
snapshot=$install_dir/releases/$release_id
backup_dir=$install_dir/backups
old_image=''
old_running=false
old_edge=false
old_stopped=false
configs_installed=false
candidate_attempted=false
success=false
rollback_failed=false

atomic_copy() {
  local source=$1 destination=$2
  cp -- "$source" "$destination.tmp.$release_id" || return 1
  chmod 600 -- "$destination.tmp.$release_id" || return 1
  mv -f -- "$destination.tmp.$release_id" "$destination"
}
restore_file() {
  local filename=$1 destination=$2
  if [[ -f "$snapshot/$filename" ]]; then
    atomic_copy "$snapshot/$filename" "$destination"
  else
    rm -f -- "$destination"
  fi
}
rollback() {
  log 'Deployment failed; restoring the previous application and configuration. Database files will not be restored or removed.'
  if [[ "$candidate_attempted" == true && -f "$compose_file" ]]; then
    if ! compose "$image" "$compose_file" true stop --timeout 30 hearth caddy; then
      log 'Could not stop every candidate service; check Docker service status.' >&2
      rollback_failed=true
    fi
    if [[ -z "$old_image" ]]; then
      # Remove only failed first-release containers. Named volumes are retained.
      compose "$image" "$compose_file" true rm --force hearth caddy || rollback_failed=true
    fi
  fi
  if [[ "$configs_installed" == true ]]; then
    restore_file compose.production.yaml "$compose_file" || rollback_failed=true
    restore_file Caddyfile "$caddy_file" || rollback_failed=true
    restore_file current-image.env "$marker" || rollback_failed=true
  fi
  if [[ -n "$old_image" && -f "$compose_file" ]]; then
    if ! compose "$old_image" "$compose_file" "$old_edge" up -d --no-build --wait --wait-timeout 90 hearth; then
      log 'Previous application did not become healthy. Preserve the database and use a forward fix; schema compatibility is not guaranteed.' >&2
      rollback_failed=true
    fi
    if [[ "$old_edge" == true && "$candidate_attempted" == true ]]; then
      compose "$old_image" "$compose_file" true up -d --no-build --force-recreate --wait --wait-timeout 90 caddy || rollback_failed=true
    fi
  fi
  if [[ "$rollback_failed" == true ]]; then
    log "Automatic recovery needs attention. Previous configuration: $snapshot; backups: $backup_dir" >&2
  else
    log 'Previous application restored, or the failed first deployment stopped. Household data was preserved.'
  fi
}
on_exit() {
  local status=$1
  trap - EXIT INT TERM HUP
  set +e
  if [[ "$success" != true && ( "$old_stopped" == true || "$configs_installed" == true ) ]]; then
    rollback
  fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap 'on_exit $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Parse Compose into a private temporary file, never print environment values.
compose "$image" "$stage/compose.production.yaml" "$edge" config --format json >"$scratch/compose.json"
python3 - "$scratch/compose.json" "$edge" "$image" "$scratch/caddy.env" <<'PY'
import json, sys
try:
    config = json.load(open(sys.argv[1], encoding='utf-8'))
    if config['services']['hearth']['image'] != sys.argv[3]:
        raise ValueError('The application image must match the verified release tag.')
    if sys.argv[2] == 'true':
        settings = config['services']['caddy']['environment']
        if any(not str(settings.get(key) or '').strip() for key in ('APP_DOMAIN', 'BASIC_AUTH_USER', 'BASIC_AUTH_HASH')):
            raise ValueError('Edge mode requires APP_DOMAIN, BASIC_AUTH_USER, and BASIC_AUTH_HASH in production.env.')
        with open(sys.argv[4], 'w', encoding='utf-8') as environment:
            for key in ('APP_DOMAIN', 'BASIC_AUTH_USER', 'BASIC_AUTH_HASH'):
                # Compose's serialized model escapes dollars for another parse;
                # Docker's --env-file accepts the final literal value directly.
                value = str(settings[key]).replace('$$', '$')
                if '\n' in value or '\r' in value:
                    raise ValueError('Edge settings must each fit on one line.')
                environment.write(f'{key}={value}\n')
except (KeyError, ValueError, OSError, TypeError):
    print('[hearth] ERROR: Invalid Compose configuration or missing edge access settings.', file=sys.stderr)
    sys.exit(1)
PY
if [[ "$edge" == true ]]; then
  log 'Validating the edge access configuration before stopping the application.'
  # Validation output can contain configuration values, so keep it private.
  if ! docker run --rm --network none --read-only --entrypoint caddy \
    --env-file "$scratch/caddy.env" \
    --mount "type=bind,src=$stage/Caddyfile,dst=/etc/caddy/Caddyfile,readonly" \
    --tmpfs /data:rw,noexec,nosuid,size=16777216 \
    --tmpfs /config:rw,noexec,nosuid,size=16777216 \
    caddy:2-alpine validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    >"$scratch/caddy-validation.log" 2>&1; then
    die 'Edge configuration validation failed. Check the Caddyfile, domain, and bcrypt hash before deploying.'
  fi
fi

if [[ -f "$marker" ]]; then
  IFS= read -r marker_line <"$marker" || true
  [[ "$marker_line" =~ ^HEARTH_IMAGE=(hearth:[a-f0-9]{40})$ ]] || die 'The current-image.env marker is invalid; investigate before deploying.'
  old_image=${BASH_REMATCH[1]}
fi
containers=$(docker ps -aq --filter label=com.docker.compose.project=hearth-production --filter label=com.docker.compose.service=hearth)
if [[ -n "$containers" ]]; then
  [[ "$containers" != *$'\n'* ]] || die 'Multiple production application containers were found; resolve them before deploying.'
  actual_image=$(docker inspect --format '{{.Config.Image}}' "$containers")
  valid_image "$actual_image" || die 'The existing application does not use an immutable Hearth release image.'
  [[ -z "$old_image" || "$old_image" == "$actual_image" ]] || die 'The running image differs from current-image.env; investigate before deploying.'
  old_image=$actual_image
  state=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$containers")
  if [[ "$state" == running\|healthy ]]; then
    old_running=true
  elif [[ "$state" == running\|* || "$state" == restarting\|* ]]; then
    die 'The previous application is not healthy; fix its current state before deploying.'
  fi
fi
if [[ -n "$old_image" ]]; then
  [[ -f "$compose_file" && -f "$caddy_file" ]] || die 'Previous production configuration is missing; preserve the database and investigate.'
  docker image inspect "$old_image" >/dev/null || die 'The previous image is unavailable locally; deployment cannot safely roll back.'
fi
edge_containers=$(docker ps -aq --filter label=com.docker.compose.project=hearth-production --filter label=com.docker.compose.service=caddy)
if [[ -n "$edge_containers" ]]; then
  [[ "$edge_containers" != *$'\n'* ]] || die 'Multiple production edge containers were found.'
  edge_state=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$edge_containers")
  [[ "$edge_state" == running\|* ]] && old_edge=true
fi

# Conservative headroom for importing the compressed image and making a backup.
archive_bytes=$(wc -c <"$stage/image.tar.gz")
available_kib=$(df -Pk "$install_dir" | awk 'END {print $4}')
required_kib=$((archive_bytes * 2 / 1024 + 262144))
[[ "$available_kib" =~ ^[0-9]+$ && "$available_kib" -ge "$required_kib" ]] || die 'Insufficient disk headroom for the image import and a database backup.'
docker_root=$(docker info --format '{{.DockerRootDir}}')
[[ "$docker_root" == /* && -d "$docker_root" ]] || die 'Docker did not report an accessible local storage directory.'
docker_available_kib=$(df -Pk "$docker_root" | awk 'END {print $4}')
[[ "$docker_available_kib" =~ ^[0-9]+$ && "$docker_available_kib" -ge "$required_kib" ]] || die 'Insufficient Docker storage headroom; the current application has not been stopped.'
existing_image_id=$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || true)
if [[ -n "$existing_image_id" ]]; then
  log 'Reusing the original immutable release image already stored for this commit.'
else
  log 'Loading the verified ARM64 image archive.'
  gzip -dc -- "$stage/image.tar.gz" | docker load
fi
loaded_platform=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")
[[ "$loaded_platform" == linux/arm64 ]] || die 'The release image is not Linux ARM64; no application was stopped.'

mkdir -p -- "$snapshot" "$backup_dir"
for filename in compose.production.yaml Caddyfile current-image.env; do
  [[ ! -f "$install_dir/$filename" ]] || cp -- "$install_dir/$filename" "$snapshot/$filename"
done
if [[ "$old_running" == true ]]; then
  log 'Stopping the previous application for a consistent SQLite backup.'
  # Set the recovery flag first: a partial stop failure still needs a restart.
  old_stopped=true
  compose "$old_image" "$compose_file" "$old_edge" stop --timeout 30 hearth
fi
if docker volume inspect hearth-production-data >/dev/null 2>&1; then
  volume_writers=$(docker ps -q --filter volume=hearth-production-data)
  [[ -z "$volume_writers" ]] || die 'Another running container still uses the household data volume; a consistent backup cannot be made.'
  backup_image=${old_image:-$image}
  backup_name=predeploy-$release_id.tar.gz
  log 'Backing up the complete stopped SQLite data volume, including any WAL files.'
  docker run --rm --user 0:0 --network none --read-only --entrypoint /bin/sh \
    --mount type=volume,src=hearth-production-data,dst=/data,readonly \
    --mount "type=bind,src=$backup_dir,dst=/backup" \
    "$backup_image" -c 'tar -czf "/backup/$1" -C /data .' sh "$backup_name.partial"
  [[ -s "$backup_dir/$backup_name.partial" ]] || die 'The SQLite volume backup is empty.'
  gzip -t -- "$backup_dir/$backup_name.partial"
  mv -- "$backup_dir/$backup_name.partial" "$backup_dir/$backup_name"
  log "Predeployment backup saved: $backup_dir/$backup_name"
elif [[ -n "$old_image" ]]; then
  die 'The previous data volume is missing; do not start a replacement empty household.'
fi

# Mark before the first replacement so partial copy failures restore both files.
configs_installed=true
atomic_copy "$stage/compose.production.yaml" "$compose_file"
atomic_copy "$stage/Caddyfile" "$caddy_file"
candidate_attempted=true
log 'Starting the application and waiting for its SQLite health check.'
compose "$image" "$compose_file" "$edge" up -d --no-build --wait --wait-timeout 90 hearth
if [[ "$edge" == true ]]; then
  # Recreate so an atomically replaced bind-mounted Caddyfile is reopened.
  compose "$image" "$compose_file" true up -d --no-build --force-recreate --wait --wait-timeout 90 caddy
elif [[ "$old_edge" == true ]]; then
  compose "$image" "$compose_file" true stop --timeout 30 caddy
fi
printf 'HEARTH_IMAGE=%s\n' "$image" >"$scratch/current-image.env"
atomic_copy "$scratch/current-image.env" "$marker"
success=true
if ! rm -f -- "$stage/image.tar.gz"; then
  log 'The application is healthy, but the uploaded image archive could not be removed from this staging directory.' >&2
fi
log "Deployment healthy: $image"
log "Previous configuration retained: $snapshot"
log 'No database volumes, previous release images, or shared Docker caches were removed.'
