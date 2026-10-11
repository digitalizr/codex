# Hearth

A calmer way to manage the groceries in your home. Hearth keeps a shared picture of what you have, what you used, and what you need next.

## Docker Desktop on your laptop

Start Docker Desktop. Open [the GitHub repository](https://github.com/digitalizr/codex), choose **Code → Download ZIP**, and extract it (the folder is typically named `codex-main`). Alternatively, clone the repository with `git clone https://github.com/digitalizr/codex.git`. Open a terminal in the extracted or cloned project folder containing `compose.yaml`, then run:

```sh
docker compose up -d --build --wait
```

Open **http://localhost:3000**. Docker builds the app and creates its dedicated SQLite database in a persistent volume. No Node.js or database installation is needed on your laptop.

See [the Docker installation guide](docs/docker.md) for stopping/restarting, backups, updates, port changes, and sharing with your partner on home Wi-Fi.

## Release to a Hetzner VPS

Use your laptop as the development environment and a Hetzner CAX11 as production. GitHub validates changes automatically; **Actions → Release Hearth → Run workflow** builds the selected commit for ARM64 and deploys it over SSH. Production has its own persistent database, a backup before each update, and health checks with an attempt to restore the previous app if startup fails.

Follow [the production setup guide](docs/production.md) once to configure Ubuntu, the deployment SSH key, and GitHub's encrypted repository secrets. Access can stay private through SSH or use a Cloudflare DNS subdomain with Caddy HTTPS and one shared household password.

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

The first run creates a clearly labelled sample household. Open **Household settings → Data → Start fresh** to remove sample inventory, shopping trips, and activity while keeping the starting locations, categories, stores, and profile. This action asks for confirmation and is unavailable after the reset.

1. **Set up your spaces.** Create locations such as Fridge, Pantry, Freezer, or Utility cupboard. Create your own grocery categories and stores, including REWE and PENNY.
2. **Check in groceries.** Add an item with its unit, minimum stock level, store preference, quantity, location, and optional best-before date. Later purchases create separate batches, preserving dates and locations.
3. **Record what changes.** Use an amount when you consume it, or mark it as gone when you discard it. The earliest-dated batch is used first unless you choose a particular location. Correct individual batches in **Edit item & stock**.
4. **Choose a restock.** Suggestions appear at or below your minimum level and subtract quantities already on active shopping lists. Select the suggestions you actually want to buy.
5. **Plan a shopping trip.** Schedule a list, assign a household member, and choose a store for each item. The list groups purchases by store. Check items as you buy them.
6. **Bring the shopping home.** Check in purchased items to inventory and complete the trip. Only checked items transfer; unpurchased entries remain clearly marked in the trip history. Received items initially share the location and optional date you choose; edit batches individually afterward.

Add a partner in **Household settings → Household**. The profile selector identifies who records stock movements and lets each person claim a trip. Profiles are names for collaboration, without passwords or identity management. Other open clients refresh shared data every 15 seconds and when they regain focus. Both partners need to reach the same running server to share the database.

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
