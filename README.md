# PokéValue – Card Value Calculator

A website that estimates a fair price for Pokémon cards with a pricing model trained on real Cardmarket data, and compares it against the current market price — preset per card, expandable set by set.

## Features

- **Card database:** Browse sets, see every card with image, fair price, Cardmarket trend price, and a verdict ("over-/under-/fairly valued"). Search and sort (e.g. undervalued first).
- **Card page:** Rarity, era, and popularity are preset from the card data; you only pick condition, language, and edition for your copy — out comes a concrete price, plus a "why this price" breakdown.
- **Free calculator:** Rate any card without a database entry.
- **Artwork rating (hidden, `#/admin/artwork`):** Rate illustration quality (1–10) on chase cards — a real feature the pricing model learns from, not a cosmetic tag. Export/import as JSON to carry ratings across sessions and into training.

## The pricing model

`scripts/train-model.mjs` trains a small neural network (learned embeddings for Pokémon species, rarity, and card category, plus continuous features for card age and artwork quality) on `scripts/training-data.json` — ~19,000 English-language cards with a real Cardmarket price. See `scripts/lib/model.mjs` for the architecture and `scripts/lib/cardMapping.mjs` for the rarity/era/popularity buckets still used as the display-layer presets in `ingest.mjs`.

```bash
node scripts/fetch-all-cards.mjs         # bulk-pull every English card (cached, resumable)
node scripts/fetch-all-sets.mjs          # set release dates (needed for the "age" feature)
node scripts/build-training-data.mjs     # distill the cache into training-data.json
node scripts/build-artwork-candidates.mjs # chase-card list for the rating admin page
node scripts/train-model.mjs             # train, evaluate, write scripts/model.json
```

Current validation results: R² ≈ 0.84, median absolute error ≈ 44% (weaker on vintage sets, where per-print variance is high). Not yet wired into the live per-card prices — the plan is to retrain once enough artwork ratings exist and then switch the display layer over.

## Development

```bash
npm install
npm run dev              # dev server at http://localhost:5173
npm run build             # production build to dist/
npm run ingest me05 me04  # import/refresh set(s) from TCGdex for display
```

Stack: React 19 + TypeScript + Vite, no ML framework dependency — the model is a from-scratch small neural net in plain JS. Card data and Cardmarket prices come from the free [TCGdex API](https://tcgdex.dev) (set IDs like `me05`; list: https://api.tcgdex.net/v2/en/sets).

## Deployment (GitHub + Vercel)

1. Create a GitHub repository and push to it.
2. On [vercel.com](https://vercel.com), "Add New Project" → select the GitHub repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. From then on, every push deploys automatically. To refresh prices, run `npm run ingest …` and commit (can later be automated with a scheduled GitHub Action).

## Project structure

```
scripts/
  ingest.mjs                     Import a set from TCGdex for display (cards, prices, presets)
  fetch-all-cards.mjs             Bulk pull of every card (training data source, cached)
  fetch-all-sets.mjs              Bulk pull of set release dates
  build-training-data.mjs         Cache → compact training-data.json
  build-artwork-candidates.mjs    Cache → lean candidate list for the rating admin page
  train-model.mjs                 Trains the pricing model, writes model.json
  lib/cardMapping.mjs             Shared rarity/era/popularity bucket logic
  lib/model.mjs                   Neural net forward pass (shared by training + future inference)
src/
  data/defaults.ts        Factors, options, default multipliers (display-layer presets)
  data/cards.ts           Access to imported sets/cards + card image/Cardmarket URL helpers
  data/artwork-ratings.json  Committed artwork ratings (exported from the admin page)
  data/generated/         Imported card data + artwork-candidates.json (JSON, commit these!)
  logic/pricing.ts        Pricing formula, score, verdict, formatting
  logic/artworkRatings.ts localStorage persistence for the rating admin page
  components/             Factor groups, result panel, price breakdown, chips
  pages/                  Home, set, card, free calculator, artwork-rating admin (lazy-loaded)
  router.ts               Hash router (#/set/…, #/card/…, #/calculator, #/admin/artwork)
```

## Notes

Unofficial fan project — not endorsed by Nintendo, Game Freak, or The Pokémon Company. Pokémon names and card images belong to their rights holders. Not financial advice; the pricing model is a data-driven estimate, not a market oracle.
