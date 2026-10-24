# Contributing

1. `npm install`, then `npm test` and `npm run verify:data` must pass before and after your change.
2. **Data lives in profiles.** `data/demo/` is the public showcase and the only profile in this repository. `data/private/` is git-ignored and holds your own data. Change demo data here; keep real tariffs, plans and personal details out.
3. **Data rules:** `verified_published` needs a primary source (`primarySourceId`) and `lastVerified`; anything else stays `research_estimate`. Size and weight limits: `confirmed: true` only when the carrier states them. After a tariff change run `npm run update:snapshot` and `npx tsx scripts/gen-sources.ts`.
4. **Texts:** core UI strings are keys in `src/i18n/en.json`, `sk.json` and `de.json`; texts that belong to a data profile (plan names, notes, package presets) live in that profile's `i18n.<lang>.json` files, one per language in its `config.json`. The i18n test fails on a missing key in either language.
5. Do not commit personal data (names, addresses, tracking numbers, real shipment details).
