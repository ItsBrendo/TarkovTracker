# Tarkov Field Log

A static, single-page Tarkov item tracker. It loads an item catalog from the Tarkov.dev REST API, selects one item for the UTC day, and stores found, kill, death, and raid-survived counts in the visitor's browser.

## Files

```text
.
├── .github/
│   └── workflows/
│       └── static.yml
├── app.js
├── index.html
├── knightbg.png
├── styles.css
└── README.md
```

The page uses `knightbg.png` as a blurred, darkened ambient scene with restrained pointer parallax, canvas particles, and low-contrast Unheard/Goons insignia. The item artwork uses a subtle dual-scale inventory grid; ambient animation respects the reduced-motion setting.

The Pages workflow downloads `https://json.tarkov.dev/regular/items`, trims the response into `items.json`, and publishes both with GitHub Pages. The browser only fetches this same-origin static file, so it does not make a cross-origin request to Tarkov.dev. No server or runtime dependency is required.

## Data source

The build uses the documented REST endpoint `GET https://json.tarkov.dev/regular/items`. It returns the item catalog keyed by ID; the workflow converts it to the compact array expected by the page. The API currently supplies ID-based placeholders for translated names, so the page formats `normalizedName` into a readable fallback and accepts either display names or normalized slugs in `ITEM_NAMES`.

The browser chooses one random item from the generated catalog and remembers that selection for the UTC date. The **New item** button rerolls and saves a different selection for the rest of that day.

## Configure an item list

When you have item names to use, add them to `ITEM_NAMES` near the top of `app.js`:

```js
const ITEM_NAMES = ['Salewa', 'Graphics card', 'LEDX Skin Transilluminator'];
```

Leave the array empty to select from the full returned catalog. Matching ignores spaces and punctuation across each item's name, short name, and normalized name.

## Run locally

The Pages workflow creates `items.json` during deployment. To preview the site locally, serve the repository root after generating that file from the REST endpoint. The browser displays loading, catalog error, and retry states when the file is missing or unavailable.

GitHub Actions fetches a fresh catalog on pushes to `main`, manual workflow runs, and once daily. If the REST endpoint is unavailable during deployment, the workflow fails rather than publishing a broken or fabricated catalog; rerun it when the API is back.

Tracker counts and the selected daily item are stored in `localStorage` on the current device and browser. Clearing browser storage removes them.

## Deploy to GitHub Pages

1. Push the repository to GitHub, using the `main` branch.
2. In **Settings → Pages**, select **GitHub Actions** as the build and deployment source.
3. Push to `main` or run **Deploy static content to Pages** from the Actions tab.

The included `.github/workflows/static.yml` fetches and compacts the catalog, then uploads the root directory to Pages. The browser request is same-origin, so Tarkov.dev's browser CORS policy no longer blocks the app.