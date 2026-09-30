# Tarkov Field Log

A static, single-page Tarkov item tracker. It loads an item catalog from the Tarkov.dev GraphQL API, selects one item for the UTC day, and stores found, kill, death, and raid-survived counts in the visitor's browser.

## Files

```text
.
├── .github/
│   └── workflows/
│       └── static.yml
├── app.js
├── index.html
├── styles.css
└── README.md
```

The existing Pages workflow deploys the repository root as a static site. No build step, package manager, backend, or runtime dependencies are required.

## GraphQL query

The query is defined as `GRAPHQL_QUERY` in `app.js`:

```graphql
query DailyItemCatalog {
  items(limit: 2000) {
    id
    name
    shortName
    normalizedName
    iconLink
    imageLink
    wikiLink
    types
    width
    height
    weight
    basePrice
    avg24hPrice
    lastLowPrice
  }
}
```

The browser chooses one random item from the returned catalog and remembers that selection for the UTC date. The **New item** button rerolls and saves a different selection for the rest of that day.

## Configure an item list

When you have item names to use, add them to `ITEM_NAMES` near the top of `app.js`:

```js
const ITEM_NAMES = ['Salewa', 'Graphics card', 'LEDX Skin Transilluminator'];
```

Leave the array empty to select from the full returned catalog. Matching is case-insensitive against each item's name, short name, and normalized name.

## Run locally

Open `index.html` in a browser, or serve the repository root with any static file server. The app posts the query directly to `https://api.tarkov.dev/graphql` and shows loading, API error, and retry states.

**Browser access note:** GitHub Pages cannot proxy API requests. Live item loading therefore depends on Tarkov.dev allowing cross-origin requests from the browser (CORS) and the API being available. If either condition is not met, the app explains the problem instead of substituting made-up data. A backend or proxy would be needed to work around an upstream CORS restriction, and this project intentionally does not include one.

Tracker counts and the selected daily item are stored in `localStorage` on the current device and browser. Clearing browser storage removes them.

## Deploy to GitHub Pages

1. Push the repository to GitHub, using the `main` branch.
2. In **Settings → Pages**, select **GitHub Actions** as the build and deployment source.
3. Push to `main` or run **Deploy static content to Pages** from the Actions tab.

The included `.github/workflows/static.yml` uploads the root directory directly; there is no build command to configure.