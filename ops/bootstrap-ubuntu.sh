#!/usr/bin/env bash
# One-time Ubuntu ARM64 preparation. No application or private SSH key is copied.
set -Eeuo pipefail
umask 077
die() { printf '[hearth] ERROR: %s\n' "$*" >&2; exit 1; }

check_only=false
if [[ ${1:-} == --check-key ]]; then check_only=true; shift; fi
[[ $# -ge 1 && $# -le 2 ]] || die "Usage: bootstrap-ubuntu.sh DOMAIN ['ssh-ed25519 PUBLIC_KEY comment']"
[[ "$check_only" != true || $# -eq 2 ]] || die '--check-key requires a public-key argument.'
domain=${1,,}
public_key=${2:-}
domain_pattern='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
[[ ${#domain} -le 253 && "$domain" =~ $domain_pattern ]] || die 'Use a bare domain without a scheme, path, or port.'
if [[ $# -eq 2 ]]; then
  [[ ${#public_key} -le 8192 && "$public_key" != *$'\n'* && "$public_key" != *$'\r'* ]] || die 'Provide exactly one public-key line.'
  [[ "$public_key" =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/]+={0,2}([[:space:]].*)?$ ]] || die 'Provide an Ed25519 public key; never pass a private key or a password.'
  command -v ssh-keygen >/dev/null || die 'ssh-keygen is required to validate the public key before installation.'
  scratch=$(mktemp -d)
  trap 'rm -rf -- "$scratch"' EXIT
  printf '%s\n' "$public_key" >"$scratch/deployment.pub"
  ssh-keygen -lf "$scratch/deployment.pub" >/dev/null 2>&1 || die 'The deployment public key is invalid.'
fi
if [[ "$check_only" == true ]]; then printf '[hearth] Deployment public key and domain are valid.\n'; exit 0; fi

[[ $EUID -eq 0 ]] || die 'Run provisioning as root through your trusted SSH session.'
[[ $(uname -s) == Linux && $(uname -m) == aarch64 ]] || die 'This installer requires Linux ARM64.'
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == ubuntu && ( ${VERSION_ID:-} == 24.04 || ${VERSION_ID:-} == 26.04 ) ]] || die 'Supported operating systems: Ubuntu 24.04 or 26.04 LTS.'
[[ $(dpkg --print-architecture) == arm64 ]] || die 'Ubuntu must use the arm64 package architecture.'
if id deploy >/dev/null 2>&1; then
  [[ $(id -u deploy) != 0 && $(getent passwd deploy | cut -d: -f6) == /home/deploy ]] || die 'Existing deploy account has an unexpected UID or home directory.'
fi

# Ubuntu's existing repositories verify signed package metadata; no curl-to-shell
# installer, additional repository, or disabled signature/TLS verification is used.
export DEBIAN_FRONTEND=noninteractive
apt-get update
packages=(ca-certificates curl openssh-server openssh-client python3 util-linux gzip coreutils)
if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  packages+=(docker.io docker-compose-v2)
fi
apt-get -o Dpkg::Options::=--force-confold install -y "${packages[@]}"
ssh-keygen -A
systemctl enable --now docker ssh
compose_version=$(docker compose version --short)
python3 - "$compose_version" <<'PY'
import re, sys
version = re.match(r'^v?(\d+)\.(\d+)', sys.argv[1])
if not version or tuple(map(int, version.groups())) < (2, 24):
    print('[hearth] ERROR: Docker Compose 2.24 or newer is required.', file=sys.stderr)
    sys.exit(1)
PY
docker info >/dev/null
if ! id deploy >/dev/null 2>&1; then useradd --create-home --user-group --shell /bin/bash deploy; fi
usermod -aG docker deploy
deploy_group=$(id -gn deploy)
[[ ! -L /home/deploy/.ssh && ! -L /opt/hearth && ! -L /opt/hearth/backups ]] || die 'Setup directories must not be symbolic links.'
install -d -m 0700 -o deploy -g "$deploy_group" /home/deploy/.ssh /opt/hearth /opt/hearth/backups
if [[ -n "$public_key" ]]; then
  authorized_keys=/home/deploy/.ssh/authorized_keys
  [[ ! -L "$authorized_keys" ]] || die 'authorized_keys must not be a symbolic link.'
  touch "$authorized_keys"
  read -r _ public_material _ <<<"$public_key"
  if ! awk -v material="$public_material" '$1=="ssh-ed25519" && $2==material {found=1} END {exit !found}' "$authorized_keys"; then
    printf '\n%s\n' "$public_key" >>"$authorized_keys"
  fi
  chown deploy:"$deploy_group" "$authorized_keys"
  chmod 0600 "$authorized_keys"
fi
[[ ! -L /opt/hearth/production.env ]] || die 'production.env must not be a symbolic link.'
if [[ ! -e /opt/hearth/production.env ]]; then
  printf 'HEARTH_PORT=3000\nHEARTH_EDGE_ENABLED=false\nAPP_DOMAIN=%s\nBASIC_AUTH_USER=household\n' "$domain" > /opt/hearth/production.env
fi
chown deploy:"$deploy_group" /opt/hearth/production.env
chmod 0600 /opt/hearth/production.env

printf '\n[hearth] Server prerequisites prepared.\n'
if [[ -n "$public_key" ]]; then
  printf '[hearth] Open a new deploy SSH session for Docker group membership.\n'
else
  printf '[hearth] No deployment public key was supplied. Deploy SSH access still needs configuration; authorized_keys was left unchanged.\n'
fi
printf '[hearth] App access stays private until a bcrypt hash is configured and edge mode enabled.\n'
printf '[hearth] Existing root SSH authentication and firewall rules were left unchanged.\n'
printf '[hearth] Allow SSH (normally TCP 22) for trusted clients/releases; TCP 80/443 only for public HTTPS. Do not expose 3000.\n'
printf '\n[hearth] Verify this public server host-key fingerprint from your trusted session:\n'
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
bootstrap_host=$domain
bootstrap_port=22
if [[ -n ${SSH_CONNECTION:-} ]]; then
  read -ra bootstrap_connection <<<"$SSH_CONNECTION"
  if [[ ${#bootstrap_connection[@]} -eq 4 ]]; then
    bootstrap_host=${bootstrap_connection[2]}
    bootstrap_port=${bootstrap_connection[3]}
  fi
fi
read -r host_type host_material _ < /etc/ssh/ssh_host_ed25519_key.pub
if [[ "$bootstrap_port" != 22 ]]; then bootstrap_host="[$bootstrap_host]:$bootstrap_port"; fi
printf '\n[hearth] Public known_hosts line for the matching GitHub SSH_HOST/SSH_PORT:\n%s %s %s\n' "$bootstrap_host" "$host_type" "$host_material"
