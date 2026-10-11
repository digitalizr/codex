# Install Hearth with Docker Desktop

These steps work with Docker Desktop on Windows, macOS, or Linux. You do not need to install Node.js, npm, or a separate database.

## First installation

1. Start Docker Desktop and wait until its engine is running. It must use Linux containers.
2. Open [digitalizr/codex on GitHub](https://github.com/digitalizr/codex), choose **Code → Download ZIP**, and extract it. You can also use [this direct ZIP link](https://github.com/digitalizr/codex/archive/refs/heads/main.zip). GitHub typically names the extracted folder `codex-main`. If the repository is private, sign in to GitHub first. Alternatively, clone the repository with `git clone https://github.com/digitalizr/codex.git`.
3. Open Terminal on macOS/Linux or PowerShell on Windows in the extracted or cloned project folder that contains `compose.yaml`. For example, type `cd ` followed by that folder's path, or use your file manager's **Open in Terminal** action.
4. Run:

   ```sh
   docker compose up -d --build --wait
   ```

   The first run downloads Node and dependencies, builds the app, and starts its database. This can take a few minutes. Later starts reuse the built image.

5. Open **http://localhost:3000** in your laptop's browser.
6. Open **Household settings → Data → Start fresh** when you are ready to clear the sample inventory, lists, and history. Set up your real locations, categories, stores, and groceries.

The actual SQLite database is saved in a Docker volume named `hearth_hearth-data`. Your inventory stays there when you stop, restart, rebuild, or recreate the app container. Keep the same Compose project name (`hearth`, already set in `compose.yaml`).

## Everyday use

Run these commands from the project folder containing `compose.yaml`:

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

If port 3000 is already used, create a file named `.env` beside `compose.yaml` containing `HEARTH_PORT=3001`, run `docker compose up -d --wait` again, and open **http://localhost:3001**.

## Back up the real database

Stop Hearth before copying its SQLite files, so the database and WAL are consistent:

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

The default port is private to your laptop. When you want to use Hearth from another device on the same trusted home network:

1. Add `HEARTH_BIND=0.0.0.0` to the `.env` file beside `compose.yaml`.
2. Run `docker compose up -d --wait` to recreate the container with that binding.
3. Allow the app's port through your laptop firewall for the private home network if needed.
4. On the other device, open `http://YOUR-LAPTOP-LOCAL-IP:3000` (or your chosen port).
5. Add your partner in **Household settings → Household**, then choose their profile using the top-right selector.

Both devices use the same database. This app uses assignment profiles without passwords, so this option is intended for your trusted home network. The laptop and Docker Desktop must stay running.

## Update the app

Keep a database backup. Replace application files with the newer source version, preserve your `.env`, and run:

```sh
docker compose up -d --build --wait
```

The named volume stays in place. Application updates do not overwrite your existing household with sample data.
