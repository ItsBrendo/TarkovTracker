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

Daily selection and found, kill, death, and raid-survived counts remain in the visitor's browser `localStorage`, preserving the existing tracker behavior. User credentials, roles, and sessions are stored server-side in D1...