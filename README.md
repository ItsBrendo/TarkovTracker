# Tarkov Tracker

This is a very basic static HTML page that displays a few Tarkov market values from the tarkov.dev API.

## Important note about CORS

GitHub Pages only serves static files. The browser cannot call the tarkov.dev GraphQL API directly unless the API responds with the correct CORS headers.

In testing, `https://api.tarkov.dev/graphql` does not return browser-accessible CORS headers, so a CORS proxy or a small serverless proxy is required for a browser-based app.

## How to use

1. Open `index.html` in a browser or host this repo on GitHub Pages.
2. Set `PROXY_URL` in the page script to your working proxy endpoint if needed.
3. Commit and push the repo.
4. In GitHub, go to Settings > Pages and select the branch to deploy.

## Example proxy pattern

If you use a Cloudflare Worker or another proxy, this is the pattern the page expects:

- `PROXY_URL` should be a base URL that proxies to `https://api.tarkov.dev/graphql`
- The page will append `?url=https://api.tarkov.dev/graphql`

If you are not using a proxy, the page will show a friendly error explaining the CORS requirement.

## GitHub Pages deployment

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` for automatic deployment to GitHub Pages.

After pushing to the default branch, GitHub will publish the site.
