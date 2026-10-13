# Release Hearth to Hetzner

Develop changes, merge them into GitHub, release locally for testing, then promote the tested commit manually. Git pushes and pull requests validate the app; they do not deploy it.

| GitHub Actions workflow                                 | Result                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Release Local](../.github/workflows/local-release.yml) | Builds and installs on your Windows runner, or prepares a downloadable bundle. |
| [Release Production](../.github/workflows/release.yml)  | Builds the selected commit for ARM64 and deploys it over SSH to the CAX11.     |

No application image registry is required. Automatic local deployment uses a Windows runner on your laptop; the download target works without one. GitHub builds both releases on hosted runners.

Your **Hetzner CAX11 runs Ubuntu 26.04.1 LTS on ARM64**. The installation commands below use Ubuntu's signed package repositories and also apply to Ubuntu 24.04 ARM64. They assume a working administrator login. Replace `YOUR_HOST` with the server IP or SSH hostname throughout. These are setup instructions, not a claim that the server has already been configured or deployed.

Windows users can complete [deployment key setup in Command Prompt](#windows-command-prompt). Other multiline laptop examples use Bash: macOS/Linux Terminal or Git Bash/WSL on Windows. For those examples, open **Git Bash** from [Git for Windows](https://git-scm.com/downloads/win), or enable WSL integration in Docker Desktop. Do not paste Bash backslashes or heredocs into Command Prompt or PowerShell. Server commands run in the Ubuntu shell after you connect.

## Test the commit locally

1. Complete the [one-time Windows runner setup](docker.md#automatic-windows-releases), then open **GitHub → Actions → Release Local → Run workflow** and select **`main`**.
2. Leave `commit` blank for that version of `main`, or enter a full 40-character lowercase SHA included in it. Select **`linux/amd64`** for a typical Windows laptop or **`linux/arm64`** for an ARM64 Docker engine.
3. Keep **`target: laptop`**, with your runner online and Docker Desktop running. After the deployment succeeds, open **http://localhost:3000**.
4. Without a laptop runner, choose **`target: download`** instead, download **`hearth-local-<first seven SHA characters>`** from that run's **Artifacts** section, extract the whole ZIP, and double-click **`Start-Hearth.cmd`** with Docker Desktop running.
5. Test the household workflow, then use the footer's copy button beside **Local · version · commit** to copy the full running SHA.

Paste that SHA into the **`commit`** field of **Release Production** after completing the server setup below. The production footer identifies **Production**, its package version, and the deployed commit. Your laptop's `hearth_hearth-data` volume and the server's `hearth-production-data` volume remain independent; no household database is transferred. See [the local Docker guide](docker.md) for updates and backups.

## Develop locally

Install Git and Docker Desktop, then:

```sh
git clone https://github.com/digitalizr/codex.git
cd codex
git switch -c my-change
docker compose up -d --build --wait
```

Open <http://localhost:3000>. After editing, rerun the build command to test the updated app. For live development without rebuilding the container, use Node.js 24 or newer and the [README development commands](../README.md#run-it-without-docker). Stop the Docker app first if both would use port 3000.

Commit and push your changes, open a pull request, and merge it after the validation workflow succeeds. Pull `main` and test the merged version locally before releasing it:

```sh
git switch main
git pull --ff-only
docker compose up -d --build --wait
git rev-parse HEAD
```

Keep that full commit SHA if you want to release the exact version you tested. An ordinary source-based Compose build does not set its commit metadata automatically; the footer's commit stays unknown unless you explicitly supply `HEARTH_COMMIT` at build time. The prepared download sets and verifies it for you. The laptop and server use separate Docker volumes. Releases transfer application code only; **never copy the development database into production**.

## Prepare the server once

### Fast setup

Review [the Ubuntu bootstrap script](../ops/bootstrap-ubuntu.sh), then run these commands in your trusted **root SSH session on the fresh VPS**. Save the installer as a file before running it:

```sh
curl -fsSL https://raw.githubusercontent.com/digitalizr/codex/main/ops/bootstrap-ubuntu.sh -o /root/hearth-setup.sh
bash /root/hearth-setup.sh groceries.gempakhub.com
```

The script installs Docker and Compose from Ubuntu's signed repositories, creates the `deploy` account and private directories, and creates a private `production.env` while preserving any existing one. It keeps root SSH authentication as configured. It accepts an optional deployment **public** key as its second argument; never pass a private key or password as an installer argument.

Continue with [deployment key setup](#add-and-verify-the-deployment-ssh-key), GitHub secrets, and the manual release below. This step prepares the server; it does not deploy the app. Skip the manual package/account steps and preserve the `production.env` the script created.

<details>
<summary>Manual setup alternative</summary>

Run these checks and installation commands through the Hetzner console or an already trusted administrator SSH session:

```sh
cat /etc/os-release
dpkg --print-architecture
```

Confirm Ubuntu 24.04 or 26.04 and `arm64`, then install Docker and Compose v2 from the configured Ubuntu repositories:

```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 curl ca-certificates python3 util-linux gzip coreutils
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
docker compose up --help
```

Confirm Compose reports version v2 and that its `up` help includes `--wait` and `--wait-timeout`. If logged in as `root`, you can omit `sudo`. Keep apt's package signature verification enabled. If Docker is already installed on another machine, inspect its source and version before changing packages.

Create a dedicated release account and private installation directory:

```sh
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
sudo install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
sudo install -d -m 0700 -o deploy -g deploy /opt/hearth /opt/hearth/backups
```

If `deploy` already exists, reuse it instead of recreating it.

</details>

Membership in the Docker group grants administrative power over the host; store its release key in this repository's Actions secrets and keep repository write access limited to trusted people. A new SSH login is required for the group membership to take effect.

### Add and verify the deployment SSH key

#### Windows Command Prompt

In **Command Prompt on your laptop**, ensure the SSH folder exists:

```bat
if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"
```

Run this command on its own. At **Enter passphrase**, press Enter; at **Enter same passphrase again**, press Enter again. Wait until the normal Command Prompt returns before running another command. If the key already exists and it asks to overwrite it, answer **`n`** and stop; reuse the dedicated key or choose another filename.

```bat
ssh-keygen -t ed25519 -C hearth-github-production -f "%USERPROFILE%\.ssh\hearth_github_production"
```

Upload only the **public** `.pub` file, using the same `YOUR_HOST` as your existing, verified root SSH connection. Run this in **Command Prompt on your laptop** and complete any root login prompt:

```bat
scp "%USERPROFILE%\.ssh\hearth_github_production.pub" root@YOUR_HOST:/root/hearth_github_production.pub
```

In your **existing Ubuntu root terminal on the VPS**, register that public key with the installer you already downloaded. Rerunning it preserves the existing production configuration:

```sh
bash /root/hearth-setup.sh groceries.gempakhub.com "$(tr -d '\r' < /root/hearth_github_production.pub)"
```

The command removes Windows carriage returns from the uploaded public key before registering it. The installer prints a server host-key fingerprint and public `known_hosts` line. Verify that fingerprint through the Hetzner console and save the matching public line for GitHub's `SSH_KNOWN_HOSTS` secret. Use its host string for `SSH_HOST`.

Back in **Command Prompt on your laptop**, verify that the key opens a password-free deployment session:

```bat
ssh -i "%USERPROFILE%\.ssh\hearth_github_production" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes deploy@YOUR_HOST "docker --version; docker compose version"
```

This should print both Docker versions. When filling the `SSH_PRIVATE_KEY` secret in GitHub, copy the private key directly to your clipboard with this **Command Prompt** command:

```bat
clip < "%USERPROFILE%\.ssh\hearth_github_production"
```

Paste it only into GitHub's encrypted `SSH_PRIVATE_KEY` secret form. Never send the private key through chat or commit it. Continue with [production configuration](#configure-production) and [GitHub setup](#configure-github-once).

#### macOS, Linux, or Git Bash

On your laptop, create a dedicated, unencrypted key for GitHub Actions:

```sh
mkdir -p ~/.ssh
chmod 0700 ~/.ssh
ssh-keygen -t ed25519 -N '' -C 'hearth-github-production' -f ~/.ssh/hearth_github_production
```

Choose another filename if that key already exists. On the server, replace the public-key placeholder below with the complete single line from your laptop's `~/.ssh/hearth_github_production.pub`. Run this through the Hetzner console or the trusted administrator session; it appends without replacing existing keys:

```sh
sudo tee -a /home/deploy/.ssh/authorized_keys >/dev/null <<'EOF'
ssh-ed25519 PASTE_PUBLIC_KEY_MATERIAL_HERE hearth-github-production
EOF
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 0600 /home/deploy/.ssh/authorized_keys
```

Keep the private key on your laptop and in GitHub's encrypted secret storage. Never commit it, include it in configuration files, or send it through chat.

Pin the server's host key before configuring GitHub. In the independent Hetzner console or your already verified administrator session, read its fingerprint:

```sh
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

On your laptop, record the host key and compare the displayed SHA256 fingerprint with that trusted result:

```sh
ssh-keyscan -p 22 -t ed25519 YOUR_HOST > ~/.ssh/hearth_production_known_hosts
ssh-keygen -lf ~/.ssh/hearth_production_known_hosts
```

`ssh-keyscan` records a key; it does not authenticate the server. Continue only after the fingerprints match. Use the same host string for this scan and the `SSH_HOST` secret. For a nonstandard SSH port, substitute it here and everywhere below.

Test the verified connection:

```sh
ssh -p 22 -i ~/.ssh/hearth_github_production \
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/hearth_production_known_hosts" \
  deploy@YOUR_HOST 'id; docker version; docker compose version; dpkg --print-architecture'
```

### Configure production

The bootstrap script already creates `/opt/hearth/production.env`; preserve and edit that file. If you used the manual setup and the file does not exist yet, copy [ops/production.env.example](../ops/production.env.example) from the repository folder on your laptop over the verified connection:

```sh
scp -P 22 -i ~/.ssh/hearth_github_production \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/hearth_production_known_hosts" \
  ops/production.env.example deploy@YOUR_HOST:/opt/hearth/production.env
ssh -p 22 -i ~/.ssh/hearth_github_production \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/hearth_production_known_hosts" \
  deploy@YOUR_HOST 'chmod 0600 /opt/hearth/production.env'
```

Keep the default private access setting for the first release. The file belongs to `deploy` and must have mode `0600`; the installation and backups directories must remain `0700`.

The shipped workflow installs to `/opt/hearth`.

In the Hetzner Cloud firewall, allow inbound SSH on your chosen port. Restrict it to your laptop's public IP where possible, while allowing the GitHub-hosted release runner to reach it when you release. GitHub runner IP ranges change; a laptop-only rule will block the workflow. Keep port 3000 closed for private SSH or Caddy access; the explicit direct-binding option below publishes the app port separately. Allow ports 80 and 443 only if you enable the domain option below, and retain outbound access needed for Docker pulls, DNS, and certificate issuance.

## Configure GitHub once

Open **Repository settings → Secrets and variables → Actions**. Add these **repository secrets**, entering their values directly in GitHub's secure forms:

| Secret            | Value                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `SSH_HOST`        | Server IP or SSH hostname, matching the verified known-hosts entry.                                                             |
| `SSH_USER`        | `deploy`.                                                                                                                       |
| `SSH_PRIVATE_KEY` | Complete dedicated private key file from your laptop.                                                                           |
| `SSH_KNOWN_HOSTS` | Verified public `known_hosts` line from the bootstrap output, or contents of the verified `hearth_production_known_hosts` file. |

Optionally add the repository **variable** `SSH_PORT` if SSH uses another port; the default is `22`. Do not reuse your personal administrator key. This default setup works with a private repository on GitHub Free: the workflow can release only from `main`, runs only when manually dispatched, and serializes production releases.

If your GitHub plan supports environments for this repository, you can optionally create `production`, restrict it to `main`, and add required reviewers. To use it, add `environment: production` to the release job and move these secrets and the optional variable into that environment. This extra approval gate is not required by the shipped workflow.

## Release manually

1. Open **GitHub → Actions → Release Production → Run workflow**.
2. Select branch **`main`**.
3. Paste the full 40-character lowercase SHA copied from your tested Local release into `commit`. Leaving it blank releases the workflow's `main` commit. The requested commit must be an ancestor of that workflow's `main` commit, or the same commit.
4. Press **Run workflow**.
5. Wait for the workflow and production health check to succeed before using the update.

The workflow validates the selected source, builds an ARM64 image with QEMU, compresses it, and uploads it over the pinned SSH connection. The server checks the release, backs up the existing database, loads or reuses the selected image, and starts the production Compose service. Building happens in GitHub Actions rather than on the small VPS. Only manual releases change production.

A successful container health check does not enable public HTTPS. Bootstrap starts with `HEARTH_EDGE_ENABLED=false`; use the SSH tunnel below, or complete the domain, bcrypt password, and `edge` configuration before expecting **`groceries.gempakhub.com`** to open publicly.

The production SQLite database stays in the named volume **`hearth-production-data`** across releases and container recreation. Its first launch contains the sample household; open **Household settings → Data → Start fresh** before entering real groceries. Subsequent releases preserve the household. Never run `docker compose down --volumes` against this installation.

## Open the private app

The default production port binds to `127.0.0.1:3000` on the server. Keep this tunnel running on your laptop:

```sh
ssh -p 22 -i ~/.ssh/hearth_github_production \
  -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/hearth_production_known_hosts" \
  -L 127.0.0.1:3001:127.0.0.1:3000 -N deploy@YOUR_HOST
```

Open <http://localhost:3001>. Close the SSH session to close the tunnel. Household profiles inside Hearth have no passwords; private SSH access supplies the boundary for this mode.

## Configure the app port's host binding

Set `HEARTH_BIND` in `/opt/hearth/production.env` to control which host interfaces publish the app port. The default is `127.0.0.1`; setting `HEARTH_BIND=0.0.0.0` publishes it on all IPv4 interfaces. `HEARTH_PORT` remains `3000` unless you change it. Run **Release Production** after editing the setting; future releases preserve the server's environment file and reuse this binding. Do not edit only the deployed Compose file, since a release replaces that file.

With `HEARTH_BIND=0.0.0.0`, direct access is `http://YOUR_SERVER_IP:3000` if the firewall permits it. Direct access to this port bypasses Caddy's shared password and Cloudflare Access, and Hearth's profiles are not login accounts. `0.0.0.0` is a listening address, not the address to enter in a browser or a Cloudflare Tunnel service URL.

A bridge-network `cloudflared` container can reach a host address when this port is bound to all interfaces. It can also share the `hearth-production_default` Docker network and use the stable service address `http://hearth:3000` while retaining the loopback host binding. A host-installed or host-network tunnel can use `http://127.0.0.1:3000`. Configure the tunnel's hostname and Access policy separately; changing the host binding does not configure the domain route.

## Optional: a domain with HTTPS

For your registered domain `gempakhub.com`, you can use **`groceries.gempakhub.com`** for Hearth. A subdomain is an address under the domain you already own; it does not require another domain purchase.

In **Cloudflare → gempakhub.com → DNS**, add an **A** record with **Name: `groceries`**, **Content: your server's IPv4 address**, and **Proxy status: DNS only** for the initial setup. This makes `groceries.gempakhub.com` point to the VPS. Add an **AAAA** record only if the server's IPv6 address is configured and reachable. Allow inbound 80/443 in the Hetzner firewall.

Generate a bcrypt password hash with Caddy's interactive prompt; the cleartext password does not appear in the command:

```sh
docker run --rm -it caddy:2-alpine caddy hash-password --algorithm bcrypt
```

Edit the server's `/opt/hearth/production.env`:

```dotenv
HEARTH_BIND=127.0.0.1
HEARTH_EDGE_ENABLED=true
APP_DOMAIN=groceries.gempakhub.com
BASIC_AUTH_USER=household
BASIC_AUTH_HASH='$2a$14$REPLACE_WITH_THE_GENERATED_HASH'
```

Use your own subdomain and the complete **60-character bcrypt hash**. Deployment rejects an incomplete hash before stopping the app. Single quotes preserve the hash's dollar signs in Compose. Keep the file mode `0600`. Run **Release Production** to enable the `edge` Caddy profile, then check your `https://` domain in a browser and sign in with the shared credentials. Caddy obtains and renews a publicly trusted certificate automatically and checks basic authentication for all forwarded routes before sending them to Hearth; the app's port stays private.

After the origin's HTTPS certificate works, you may enable Cloudflare's orange-cloud proxy. Set **SSL/TLS → encryption mode** to **Full (strict)**. Do not choose Flexible: it sends HTTP to the HTTPS origin and can cause redirect loops. Shared basic authentication remains required. No Cloudflare API token or integration is needed for this setup.

## Backups and recovery

Each release backs up an existing production database before replacing the app. Archives are stored under `/opt/hearth/backups/predeploy-<UTC>-<unique>.tar.gz`; previous application configurations are kept under `/opt/hearth/releases/`. Keep those backups, and also arrange daily backups and a copy away from the VPS; deployment backups alone do not protect against disk or server loss. Backup scheduling and external storage are not configured by this workflow.

To make an additional backup, log in as `deploy`, then run this Bash block. It takes the same lock as a release and briefly stops Hearth while copying its complete database directory:

```sh
cd /opt/hearth
(
  set -e
  exec 9>deploy.lock
  flock -n 9 || { echo 'A release or backup is running; retry later.' >&2; exit 1; }
  umask 077
  backup_dir=$(mktemp -d "backups/manual-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
  production_compose() {
    docker compose --env-file production.env --env-file current-image.env \
      -f compose.production.yaml -p hearth-production "$@"
  }
  trap 'production_compose up -d --no-build --wait --wait-timeout 90 hearth' EXIT
  production_compose stop hearth
  production_compose cp hearth:/app/data/. "$backup_dir"
  printf 'Backup saved to %s\n' "$backup_dir"
)
```

The exit trap attempts to restart Hearth even if copying fails. Check that restart succeeds before leaving the server. Preserve the complete directory, including any SQLite WAL files, and copy it to secure storage away from the server. Do not copy only the live `.sqlite` file.

If a release fails its health check, the script attempts to restart the previous application image and configuration. Inspect the workflow output before retrying. On the server, inspect the active image and logs with:

```sh
cd /opt/hearth
cat current-image.env
docker compose --env-file production.env --env-file current-image.env \
  -f compose.production.yaml -p hearth-production ps
docker compose --env-file production.env --env-file current-image.env \
  -f compose.production.yaml -p hearth-production logs --tail=100 hearth
curl --fail http://127.0.0.1:3000/api/health
```

`current-image.env` contains the image tag, including the deployed commit SHA. The usual recovery is to merge a corrective commit into `main` and run a new manual release.

To release a known working earlier commit, run **Release Production** on branch `main` with its full SHA in the `commit` input. Choose a commit that includes this deployment setup. If that commit's original ARM64 image is still stored on the VPS, deployment reuses that binary rather than replacing its immutable tag with a rebuilt artifact. An older image must support the current database schema; if it does not, use a forward fix.

Application rollback must preserve the current database. The deploy script does not automatically restore an older database backup: doing so would discard household changes recorded since that backup. Restore data only as a deliberate recovery operation, after preserving the current data and understanding what would be lost.

## Keep disk space available

A CAX11's 40 GB disk also holds Ubuntu, Docker images, household data, and backups. A successful release removes its uploaded compressed image archive, while retaining application images, backups, and configuration metadata; an archive cleanup failure is logged. Check available space and retained application images periodically:

```sh
docker info --format '{{.DockerRootDir}}'
df -h /opt/hearth /var/lib/docker
docker image ls hearth
```

If Docker reports another root directory, use that path in the `df` command. Keep the current image from `current-image.env` and at least the previous known working image for rollback. To remove one manually selected, unused older tag, replace the placeholder with its full commit SHA:

```sh
old_sha=REPLACE_WITH_UNUSED_OLD_40_CHARACTER_SHA
docker image rm "hearth:$old_sha"
```

Do not force image removal or run `docker system prune` or `docker volume prune` for this installation. Preserve the named data volume and backup files. Copy older backups to secure storage away from the VPS before removing individual local copies; this workflow does not configure backup retention or external storage.
