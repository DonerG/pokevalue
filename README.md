# PokéValue – Card Value Calculator

A website that calculates a fair price for Pokémon cards using a transparent formula and compares it against the current Cardmarket price — preset per card, expandable set by set.

## Features

- **Card database:** Browse sets, see every card with image, fair price, Cardmarket trend price, and a verdict ("over-/under-/fairly valued"). Search and sort (e.g. undervalued first).
- **Card page:** Rarity, era, popularity, and supply are preset from the card data; you only pick condition, language, and edition for your copy — out comes a concrete price.
- **Free calculator:** Rate any card without a database entry.
- **Expert mode:** Every multiplier, the anchor, and the thresholds are adjustable (saved in the browser).

## The formula

```
Base value = anchor × rarity × era × popularity × supply     (fixed per card)
Fair price = base value × condition × language × edition      (your copy)
Score      = logarithmic position of the base value on a 0–100 scale
```

Multiplicative, because card prices span orders of magnitude. Verdict: deviation of the market price from the fair price above/below the thresholds (default ±20%).

## Development

```bash
npm install
npm run dev              # dev server at http://localhost:5173
npm run build             # production build to dist/
npm run ingest me05 me04  # import/refresh set(s) from TCGdex
```

Stack: React 19 + TypeScript + Vite, no further runtime dependencies. Card data and Cardmarket prices come from the free [TCGdex API](https://tcgdex.dev) (set IDs like `me05`; list: https://api.tcgdex.net/v2/en/sets). The import writes JSON to `src/data/generated/` — new sets automatically show up in the app, just commit them.

## Deployment (GitHub + Vercel)

1. Create a GitHub repository and push to it.
2. On [vercel.com](https://vercel.com), "Add New Project" → select the GitHub repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. From then on, every push deploys automatically. To refresh prices, run `npm run ingest …` and commit (can later be automated with a scheduled GitHub Action).

## Project structure

```
scripts/ingest.mjs        Import from TCGdex (cards, prices, factor presets)
src/
  data/defaults.ts        Factors, options, default multipliers
  data/cards.ts           Access to imported sets/cards
  data/generated/         imported card data (JSON, commit these!)
  logic/pricing.ts        Pricing formula, score, verdict, formatting
  logic/storage.ts        localStorage persistence of the configuration
  components/             Factor groups, result panel, expert mode, chips
  pages/                  Home page, set page, card page, free calculator
  router.ts               Hash router (#/set/…, #/card/…, #/calculator)
```

## Notes

Unofficial fan project — not endorsed by Nintendo, Game Freak, or The Pokémon Company. Pokémon names and card images belong to their rights holders. Not financial advice; the formula is an adjustable model, not a market oracle.
