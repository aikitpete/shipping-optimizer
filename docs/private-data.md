# Using a private data profile

| | **Demo (public, this repo)** | **Private (yours, never committed)** |
|---|---|---|
| Data | `data/demo/*.json`, fetched in the browser | `data/private/*.json`, git-ignored |
| Plans storage | IndexedDB (Dexie) in your browser | Claude artifact database (`db` capability), synced across devices |
| Build | `npm run build` → static site (GitHub Pages) | `npm run build:claude` → one self-contained HTML file |
| Tests | `npm test` (`tests/`) | `npm run test:private` (`tests-private/`, git-ignored) |

Both backends sit behind one small `PlanStore` interface (`src/lib/persistence/store.ts`); the app picks the backend at start-up, and on first run with a database it imports existing browser plans once.

## Keeping private data private
- `data/private/` and `tests-private/` are in `.gitignore`. CI and the Pages workflow only see `data/demo/`.
- The public build never contains the private profile: it is inlined only by `scripts/build-private.ts`, into `dist-private/` (also ignored).
- To use your own data, copy `data/demo/` to `data/private/`, replace the JSON, and adjust `config.json`. Run `npm run verify:data:private` to validate it, `npm run build:claude` to build.
- Point the demo at any other folder without rebuilding: set `window.SHIPPING_DATA_BASE = 'my-data/'` before the app script loads, or replace the files in `dist/data/demo/`.

