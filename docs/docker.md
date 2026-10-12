# Install Hearth with Docker Desktop

On Windows, download a release built by GitHub and start it with the included launcher. Building from source also works on Windows, macOS, and Linux. You do not need to install Node.js, npm, or a separate database.

## First installation

1. Sign in to [digitalizr/codex on GitHub](https://github.com/digitalizr/codex). Open **Actions → Prepare Local Release → Run workflow** and select branch **`main`**.
2. Leave `commit` blank for the workflow's version of `main`, or enter a full 40-character lowercase SHA already included in that version of `main`. Choose **`linux/amd64`** for most Windows laptops, or **`linux/arm64`** if Docker Desktop uses ARM64.
3. Wait for the run to succeed. Open its summary, download **`hearth-local-<first seven SHA characters>`** from **Artifacts**, and use **Extract All** on the downloaded ZIP. Keep every extracted file together. Artifacts are retained for three days; prepare another release if the download has expired.
4. Start Docker Desktop and wait for its **Linux containers** engine to run.
5. Double-click **`Start-Hearth.cmd`** in the extracted folder. It verifies checksums, the Docker architecture, and the image's commit, loads the image, waits for the app, and opens **http://localhost:3000**.
6. Open **Household settings → Data → Start fresh** when you are ready to clear the sample inventory, lists, and history. Set up your real locations, categories, stores, and groceries.

The footer shows **Local**, the package version, and its commit. After testing, use the copy button beside the commit to copy the full SHA. Paste that SHA into **Actions → Release Production → Run workflow → `commit`** to promote the same source version; see [production setup](production.md). The preparation workflow only builds a download on GitHub's hosted runner. It does not install a persistent runner or access your laptop.

The actual SQLite database is saved in the Docker volume **`hearth_hearth-data`**. The launcher keeps the Compose project name `hearth` and reuses this volume, including an existing source-based installation. Your inventory stays there when you start a newer release or recreate its container. Production uses its separate `hearth-production-data` volume; no database is transferred between them.

## Build from source instead

Download [the source ZIP](https://github.com/digitalizr/codex/archive/refs/heads/main.zip), extract it, or clone with `git clone https://github.com/digitalizr/codex.git`. Open a terminal in the folder containing `compose.yaml`, start Docker Desktop, then run:

```sh
docker compose up -d --build --wait
```

Open **http://localhost:3000**. This builds on your laptop and keeps the same local volume. The footer shows **Local** and the package version; its commit is unknown unless you supply `HEARTH_COMMIT` at build time. Use the prepared release when you want a verified commit to promote.

## Everyday use

For a downloaded release, double-click **`Start-Hearth.cmd`** to start it again. Use **Docker Desktop → Containers → hearth** to stop it, inspect its status, or view logs. For a source installation, run these commands from the project folder containing `compose.yaml`:

```sh
# Start again; no rebuild needed.
docker compose up -d --wait

# See whether it is running and healthy.
docker compose ps

# View logs if it does not start.
docker compose logs --tail=100 hearth

# Stop the app and keep its database.
docker compose stop
```

Docker Desktop must be running. The Compose restart policy restarts Hearth when Docker starts again unless you explicitly stopped the container. Closing your browser does not stop the app. Your laptop must remain on to use Hearth.

If port 3000 is already used, create a plain-text file named `.env` beside `compose.yaml` containing `HEARTH_PORT=3001`. For the download, run `Start-Hearth.cmd` again; for source, run `docker compose up -d --wait` again. Open **http://localhost:3001**. Keep the other downloaded files unchanged so their checksums remain valid.

## Back up the real database

Stop Hearth before copying its SQLite files, so the database and WAL are consistent. For a downloaded release, open **PowerShell in its extracted folder** and first set the image from the included release metadata:

```powershell
$env:HEARTH_IMAGE = (Get-Content -Raw .\release.json | ConvertFrom-Json).image
```

Then run these commands in that same window. For a source installation, run them from its project folder without the extra image-setting command:

```sh
docker compose stop hearth
docker compose cp hearth:/app/data ./hearth-backup
docker compose up -d --wait
```

Keep the resulting `hearth-backup` folder somewhere separate and safe. Use a new backup folder name for subsequent copies. The UI's JSON export is also useful for inspecting/exporting your data; there is no JSON import screen.

To restore a database backup into this same Docker installation, stop the app, copy the contents of the backup directory back, restore the database user's ownership, and restart:

```sh
docker compose stop hearth
docker compose cp ./hearth-backup/. hearth:/app/data/
docker compose run --rm --no-deps --user root --entrypoint sh hearth -c "chown -R node:node /app/data"
docker compose up -d --wait
```

Restore only a complete database backup made while Hearth was stopped. Preserve a backup of the current data before restoring an older one. A normal `docker compose down` retains data; **`docker compose down --volumes` deletes it**.

## Share with your partner on home Wi-Fi

The default port is private to your laptop. The downloaded release keeps that binding; the following option uses a **source installation** when you want to share it with another device on the same trusted home network:

1. Add `HEARTH_BIND=0.0.0.0` to the `.env` file beside `compose.yaml`.
2. Run `docker compose up -d --wait` to recreate the container with that binding.
3. Allow the app's port through your laptop firewall for the private home network if needed.
4. On the other device, open `http://YOUR-LAPTOP-LOCAL-IP:3000` (or your chosen port).
5. Add your partner in **Household settings → Household**, then choose their profile using the top-right selector.

Both devices use the same database. This app uses assignment profiles without passwords, so this option is intended for your trusted home network. The laptop and Docker Desktop must stay running.

## Update the app

Keep a database backup. For a downloaded release, prepare the newer commit in **Prepare Local Release**, download and extract its complete artifact, and run its **`Start-Hearth.cmd`**. Copy your optional `.env` into the new folder if you chose another port. The launcher reuses your existing database volume.

For a source installation, replace application files with the newer source version, preserve your `.env`, and run:

```sh
docker compose up -d --build --wait
```

The named volume stays in place. Application updates do not overwrite your existing household with sample data.
