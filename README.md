# Goons from Gumtree

A secure Escape from Tarkov daily item log with a local raid tracker. Item data is generated from Tarkov.dev; user accounts and sessions run through Cloudflare Pages Functions and Cloudflare D1.

## Authentication

The login page asks for a username first, then a password. `KillaFromKmart` is bootstrapped as the first administrator using the server-only `ADMIN_PASSWORD` secret. On the first successful admin login, the password is salted and hashed into D1; future logins use the stored hash. Keep the bootstrap secret out of source control and use at least 12 characters. Regular users created without a custom password receive `PasswordFromPrapor`.

Sessions use random, HttpOnly, SameSite cookies and expire after seven days. Passwords are stored as PBKDF2-SHA-256 hashes, not plaintext. Login attempts are rate-limited. The Pages middleware protects the tracker and generated item catalog; only the login page and its required assets are public.

## Add or update users

Sign in as an administrator and use **Manage users** below the tracker. Add a username and role. Leave the initial password blank for a standard account to assign `PasswordFromPrapor`; administrator accounts require a custom password of at least 12 characters. Promoting a standard user also requires setting a new administrator password. Existing usernames and roles can be edited, and a password can be replaced by entering a new one. Leaving the password field empty keeps the current password. Password changes and account removal revoke the affected user's sessions. The active administrator and the last administrator cannot be removed or demoted.

Only administrators should share the standard password with designated users. Anyone holding it can sign in if an admin has added their username. For stronger per-person credentials, set a unique password while creating or updating the account.

## Deploy to Cloudflare

The previous GitHub Pages workflow cannot run authentication functions or protect the catalog. Deployment now targets Cloudflare Pages and requires a Cloudflare account.

### Fix `wrangler deploy` build failures

The Cloudflare build log shows a Pages project running `npx wrangler deploy`. That command deploys a Worker and expects a Worker entry point; this repository is a Pages project (`pages_build_output_dir` is set in `wrangler.toml`) and has no Worker entry point. The resulting “Missing entry-point to Worker script or to assets directory” error is expected.

Use the repository's GitHub Actions workflow as the single deployment path: it generates the required `items.json`, applies D1 migrations, and runs `npx wrangler@4 pages deploy . --project-name goons-from-gumtree --branch main`. In Cloudflare, remove/disable the separate build command that runs `npx wrangler deploy` (or disconnect the duplicate automatic Git build). Do not replace it with a bare Pages deploy unless that build also generates `items.json` and applies migrations. GitHub Pages hosting itself cannot run these authentication functions; the deployed site must be Cloudflare Pages.

1. Install Wrangler or use `npx wrangler@4`, then authenticate with `npx wrangler login`.
2. Create the Pages project with `npx wrangler pages project create goons-from-gumtree`.
3. Create the database with `npx wrangler d1 create goons-from-gumtree-users`. Copy its database ID into `database_id` in `wrangler.toml`.
4. Set the bootstrap secret with `npx wrangler pages secret put ADMIN_PASSWORD --project-name goons-from-gumtree`. Use a unique secret of at least 12 characters. Do not commit it.
5. Add GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The API token needs Cloudflare Pages edit and D1 edit permissions.
6. Push to `main` or run the deployment workflow. It generates `items.json`, applies pending D1 migrations, then deploys the Pages assets and Functions.

The scheduled workflow refreshes the Tarkov.dev item catalog daily. Account and user administration remain available through D1 and the admin panel.

## Local development

Create a local `.dev.vars` file with an `ADMIN_PASSWORD` value (at least 12 characters). It is git-ignored. Apply the local migration and start Pages with Wrangler:

```sh
npx wrangler d1 migrations apply goons-from-gumtree-users --local
npx wrangler pages dev .
```

For a local item preview, generate `items.json` using the same catalog query in `.github/workflows/static.yml`, or deploy and use the generated snapshot. D1 local data is separate from the remote production database.

## Tracker data

Tarkov.dev's public API provides shared game data (items, player-level thresholds, skills, tasks, maps, traders, hideout areas, crafts, and barters); it does not provide an individual player's account, stash, raid history, or character statistics. The profile labels this information as public game data and never presents it as a personal API profile.

The deployment workflow writes item details to `items.json` for the Daily item tab and aggregate endpoint counts to `game-data.json` for the operator profile. Personal finds, kills, deaths, and survived raids remain in that browser's `localStorage`; account identity and role come from the authenticated D1 session.

Manual tracker inputs are currently disabled behind a **Coming soon** notice while an automatic player-stat source is investigated. Existing local tracker values are retained and displayed; no data or controls have been removed from the code.

## TarkovTracker Progress

Each app user can connect a TarkovTracker.org API token from **Settings → TarkovTracker progress**. Create a token with **Game Progress (GP)** read permission and the correct mode (`PVE_`, `PVP_`, or `SZN_`). The app validates the token with `GET /token` and reads `GET /progress` for player level, game edition, PMC faction, task/objective progress, and hideout progress. This API does not include K/D or raid counters.

Before enabling connections, add a server-only Cloudflare Pages secret named `PROFILE_TOKEN_ENCRYPTION_KEY` with at least 32 random characters. Use `npx wrangler pages secret put PROFILE_TOKEN_ENCRYPTION_KEY --project-name goons-from-gumtree` and enter the value at Wrangler's hidden prompt. Never commit or share this key. Locally, put it in the git-ignored `.dev.vars` file.

Tokens are encrypted with AES-GCM and stored per app user in D1; progress is reduced to an allowlisted summary before caching. The API is not polled more often than once per 60 seconds and conditional ETags are used. Users can disconnect at any time to delete their encrypted token and cached profile. Rotate any API token previously pasted into chat before connecting it.

## TarkovTracker Progress Connection

Each signed-in user can connect their own TarkovTracker.org API token from **Settings → TarkovTracker progress**. The token must have **Game Progress (GP)** read permission. The integration reads `/progress`, which supplies player level, faction, edition, quest/objective progress, and hideout progress. It does not return K/D or raid counters.

Tokens are encrypted with AES-GCM before being stored in D1, scoped to the app user, and never returned to the browser after connection. The raw TarkovTracker JSON is not retained; only an allowlisted progress summary is cached. Reads are cached for at least 60 seconds and honor the API's ETag/rate-limit guidance.

Before connecting, set the encryption key as a Cloudflare Pages secret: `npx wrangler pages secret put PROFILE_TOKEN_ENCRYPTION_KEY --project-name goons-from-gumtree`. Enter a randomly generated secret of at least 32 characters at the prompt; keep it private and never commit it. For local development, put the same kind of secret in the git-ignored `.dev.vars` file.

The API token previously pasted into chat should be revoked and replaced before use. Enter the replacement directly in the authenticated Settings form; do not put it in source code, a command, or browser storage. Disconnecting removes that user's encrypted token and cached progress.

## Player JSON upload and the Operator profile

Uploading a player export in **Settings → Upload player JSON** extracts a bounded summary — PMC/scav counters, skills, mastery, achievements, battle pass, seasonal rewards, player level, registration date, quest completion counts, hideout area/level counts, stash item count, and encyclopedia (identified item) count — before sending it to the private hub. The original file never leaves the browser.

The **Operator profile** tab shows these uploaded stats (player level, quests complete, hideout areas/levels, faction, upload time) whenever TarkovTracker API progress isn't connected, since the JSON upload is the active data source. Connecting a live TarkovTracker API token still takes priority when available.

## Discord notifications

Two Discord notifications are available:

- **Upload notification**: posted immediately whenever a user uploads or updates their player JSON.
- **Due-for-upload reminder**: a crew member is reminded once they haven't uploaded in 24+ hours. Since Cloudflare Pages Functions have no native cron trigger, the check runs from the scheduled `.github/workflows/discord-reminders.yml` GitHub Actions workflow (hourly), which calls the protected `POST /api/notify/due` endpoint.

Setup:

1. Create a Discord webhook URL in the target channel (Channel settings → Integrations → Webhooks).
2. Set it as a Cloudflare Pages secret: `npx wrangler pages secret put DISCORD_WEBHOOK_URL --project-name goons-from-gumtree`. Add the same value to the git-ignored `.dev.vars` file for local development.
3. Generate a random secret (32+ characters) and set it as a Cloudflare Pages secret: `npx wrangler pages secret put CRON_SECRET --project-name goons-from-gumtree`. Add it to `.dev.vars` locally too.
4. Add two GitHub Actions repository secrets: `SITE_URL` (the deployed site origin, e.g. `https://goons-from-gumtree.pages.dev`) and `CRON_SECRET` (the same value from step 3).

Without `DISCORD_WEBHOOK_URL` configured, notifications are silently skipped. Without `CRON_SECRET` configured, `/api/notify/due` returns `503` and the scheduled workflow fails loudly instead of running unauthenticated.