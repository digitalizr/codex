# Hearth

A calmer way to manage the groceries in your home. Hearth keeps a shared picture of what you have, what you used, and what you need next.

## Docker Desktop on your laptop

On Windows, **Release Local** can install updates directly into Docker Desktop:

1. Complete the [one-time Windows runner setup](docs/docker.md#automatic-windows-releases). Keep that runner and Docker Desktop running.
2. Open **GitHub → Actions → Release Local → Run workflow**. Select `main`, leave `commit` blank for that version of `main`, keep `target` set to **`laptop`**, and choose `linux/amd64` for a typical Windows laptop (`linux/arm64` for an ARM64 Docker engine).
3. After the laptop deployment succeeds, open **http://localhost:3000**.

GitHub builds and tests the image on its hosted runner; the Windows runner downloads the verified bundle and starts the app on your laptop. The footer shows **Local**, the package version, and the running commit; use its copy button to keep the full tested SHA. Existing laptop data remains in `hearth_hearth-data` when you start a newer release. The laptop runner handles only manually requested local releases on `main`; pull-request validation runs on GitHub.

For a release without a laptop runner, choose **`target: download`**, download **`hearth-local-<short SHA>`** from the run's **Artifacts** section, extract the entire ZIP, and double-click **`Start-Hearth.cmd`** with Docker Desktop running.

You can also build from source on Windows, macOS, or Linux: download or clone [the repository](https://github.com/digitalizr/codex), open its folder containing `compose.yaml`, and run:

```sh
docker compose up -d --build --wait
```

Docker builds the app; open it at the same local address, with its persistent database. No separate Node.js or database installation is needed. Source builds show the package version; their commit is unknown unless you supply `HEARTH_COMMIT` when building.

See [the Docker installation guide](docs/docker.md) for stopping/restarting, backups, updates, port changes, and sharing with your partner on home Wi-Fi.

## Release to a Hetzner VPS

The two manual workflows serve separate steps:

| Workflow               | Result                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| **Release Local**      | Builds and installs on your Windows runner, or prepares a download.      |
| **Release Production** | Builds the selected commit for ARM64 and deploys it over SSH to Hetzner. |

After testing locally, open **Actions → Release Production → Run workflow**, select `main`, and paste the full tested SHA into `commit`. The production footer identifies **Production**, its package version, and commit. Local and production databases remain independent; releases do not copy household data between them. Production has a backup before each update and health checks with an attempt to restore the previous app if startup fails.

Follow [the production setup guide](docs/production.md) once to configure Ubuntu, the deployment SSH key, and GitHub's encrypted repository secrets. The default access is private through SSH. To open **`groceries.gempakhub.com`**, configure Cloudflare DNS, Caddy HTTPS, and the shared password before enabling public access; a successful deployment alone does not enable that domain.

## Run it without Docker

Requires **Node.js 24 or newer** and npm.

```sh
# Open the project folder first; the cloud checkout is /workspace/codex.
npm ci
npm run dev
```

The web app and API use port **3000**. The development server reloads frontend changes and restarts when backend files change.

For a production build:

```sh
npm run build
npm start
```

There are no API keys, external services, or login accounts to configure. Fonts and illustrations are served with the app.

## Make it your home

The first run creates a clearly labelled sample household with Mohan and Sunita profiles. Open **Household settings → Data → Start fresh** to remove sample inventory, shopping trips, and activity while keeping the starting locations, categories, stores, and profiles. This action asks for confirmation and is unavailable after the reset.

1. **Set up your spaces.** Create locations such as Fridge, Pantry, Freezer, or Utility cupboard. Create your own grocery categories and stores, including REWE and PENNY.
2. **Check in groceries.** Add an item with its unit, minimum stock level, store preference, quantity, location, and optional best-before date. Later purchases create separate batches, preserving dates and locations.
3. **Record what changes.** Use an amount when you consume it, or mark it as gone when you discard it. The earliest-dated batch is used first unless you choose a particular location. Correct individual batches in **Edit item & stock**.
4. **Choose a restock.** Suggestions appear at or below your minimum level and subtract quantities already on active shopping lists. Select the suggestions you actually want to buy.
5. **Plan a shopping trip.** Schedule a list, assign a household member, and choose a store for each item. The list groups purchases by store. Check items as you buy them. In the weekly planner, drag a trip by its handle onto a new day, or use **Move date**. The shopper and items stay with the trip.
6. **Bring the shopping home.** Check in purchased items to inventory and complete the trip. Only checked items transfer; unpurchased entries remain clearly marked in the trip history. Received items initially share the location and optional date you choose; edit batches individually afterward.

Add a partner in **Household settings → Household**. The prominent **Using as** profile selector identifies who records stock movements and lets each person claim a trip. Shopping trips show their assigned shopper separately; choose **Mine**, a particular person, or **All household** to see the relevant plans. Profiles are names for collaboration, without passwords or identity management. Other open clients refresh shared data every 15 seconds and when they regain focus. Both partners need to reach the same running server to share the database.

For the current local review, follow the [v1.2.0 review checklist](docs/review-v1.2.md).

## Dedicated database

All household data is stored in a real SQLite database at **`data/household.sqlite`**, separate from source code and browser storage. It persists across server restarts. The browser only remembers the selected member profile.

SQLite uses foreign keys, write-ahead logging, transactions, and a versioned schema. Stock updates prevent negative quantities; shopping check-in prevents repeat transfers. Activity keeps item/member/location names even when a catalogue entry changes. Up to six decimal places are supported for fractional quantities.

Configuration is supplied through environment variables:

| Variable          | Default                 | Purpose                                                          |
| ----------------- | ----------------------- | ---------------------------------------------------------------- |
| `PORT`            | `3000`                  | Web and API port                                                 |
| `GROCERY_DB_PATH` | `data/household.sqlite` | Dedicated database file; use an absolute path for another volume |
| `NODE_ENV`        | Development             | `production` serves the built `dist` directory                   |

For example:

```sh
PORT=3001 GROCERY_DB_PATH=/path/to/persistent/household.sqlite npm start
```

Use a persistent disk for long-term hosting. Copying a running SQLite database file alone may miss changes in the WAL: stop the server before copying the database, or use SQLite's backup facility. **Settings → Data → Export household** downloads the full household and activity as JSON for inspection/portability; a JSON import interface is not included. Kitchen activity can also be exported as CSV.

The app is designed for one trusted household. It does not provide authentication or isolate unrelated households. Purchases, consumption, and dates are manually recorded; barcode scanning, receipt recognition, delivery-service integrations, and notifications are not included.

## Validate

```sh
npm run typecheck
npm test
npm run build
```

The integration tests run HTTP requests against an isolated temporary SQLite database. They cover expiry-first consumption, fractional quantities, rejected updates without partial writes, shopping reservations, check-in exactly once, metadata validation, member attribution, demo reset protection, and persistence after reopening.

The browser smoke test requires Python with Playwright and Chromium:

```sh
python3 tests/ui_smoke.py
```

It starts a separate server with a temporary database, exercises the household workflow through desktop and mobile browsers, and leaves your main household data unchanged.

## Project

- `src/`: React + TypeScript interface, responsive styling, and shared API types.
- `server/`: Express API and dedicated SQLite database.
- `tests/`: HTTP integration and browser workflow tests.
- `docs/design.md`: researched design decisions, reference sources, and scope.
- `public/`: locally served illustration and app icon.

Each cloud task already runs in an isolated environment. Use the existing checkout; no additional Git worktree is needed.
