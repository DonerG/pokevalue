# PokéValue – Card Value Calculator

Live at [pokevalue.cards](https://pokevalue.cards).

A website that estimates a fair price for Pokémon cards with a regression model trained on real Cardmarket data, and compares it against the current market price — expandable set by set.

## Features

- **Card database:** Browse sets, see every card with image, fair price, Cardmarket trend price, and a verdict ("over-/under-/fairly valued"). Search and sort (e.g. undervalued first). The homepage search bar also matches individual cards by name or number, site-wide, via a lightweight lazy-loaded search index (see `scripts/build-search-index.mjs`) — not just set names.
- **Card page:** Pokémon, rarity, illustrator, set, and card type each get their own computed factor — fixed facts, not adjustable. You only pick condition and language for your specific copy, plus a "why this price?" breakdown showing every factor that went into the number.
- **How it works (`/how-it-works`):** Public explanation of the model — the multiplicative formula, why it's fitted on log prices, what ridge regularization does for thinly-supported cards, why rarity and card type get an era interaction, and what the model can't see. Includes live example factors (top Pokémon, rarities, illustrators, card types, and "Rare" across the eras) pulled from a small generated slice of `factors.json` — see `scripts/build-factor-highlights.mjs`.
- **Artwork rating (hidden, `/admin/artwork`):** Rate illustration quality (10/9/8/worse) on chase cards whose artwork is genuinely their own — illustration, special illustration, secret and full art rares. Double Rares and Ultra Rares are excluded (standard frame, nothing to judge), and so are Promos, which are handled entirely on `/admin/promo-style`. Not yet used by the model — kept to collect enough data to make it a factor. Export/import as JSON.
- **Promo style tagging (hidden, `/admin/promo-style`):** Promo cards all share one "Promo" rarity in the source data, but they aren't one kind of card — some are **alt arts** with a full unique illustration, the rest look like ordinary Commons/Rares (or like glittery ex/V cards that still have no real artwork), and some of those carry an **event stamp** that lifts the price. Nothing in the data separates them. Tag each by eye as `Alt Art 10/9/8`, `Stamped` or `Normal`; export/import as JSON into `src/data/promo-styles.json`. `effectiveRarity()` (`scripts/lib/cardMapping.mjs`) then turns the tag into its own rarity level ("Promo" → "Promo (Alt Art 9)") for both training and display, so the rarity, rarity × era and rarity × set factors pick it up with no other change. Tagged cards drop out of the queue, so the list only ever shows what's still open.

  The alt-art grades are kept apart rather than merged into one "alt art" bucket because they measurably aren't one thing. Fitted, the levels come out cleanly ordered with barely-overlapping confidence intervals:

  | level | factor | n |
  |---|---|---|
  | Promo (Alt Art 10) | ×1.55 | 12 |
  | Promo (Stamped) | ×1.26 | 50 |
  | Promo (Alt Art 9) | ×1.23 | 23 |
  | Promo (Alt Art 8) | ×1.08 | 11 |
  | Promo (Alt Art, weak) | ×1.02 | 10 |
  | Promo (untagged) | ×0.76 | 572 |

  Every group it touches got closer to the market: stamped promos were underpriced 3× before they had their own level (0.32× → 0.94×), grade-10 alt arts were underpriced ~8× (0.12× → 1.15×), and the plain-Promo bucket — which had been inflated by all the valuable cards sitting inside it, overpricing ordinary promos by 1.68× — dropped to ×0.76 and now sits at 1.16×. Promos are deliberately *not* listed on `/admin/artwork`; their artwork grade is part of this one pass.

  Two hand-maintained files feed this: `src/data/promo-styles.json` says *what* a promo is (alt art / stamped / plain), and the artwork ratings say *how good* the illustration is. They're merged at tagging time into a single level per card — an alt art graded "worse" becomes `altart0` rather than being dropped, since it is still an alt art.
- **Price audit (hidden, `/admin/price-audit`):** The 100 cards site-wide with the biggest market-vs-fair gap, in each direction (percentage uses the same "upside relative to market" formula as the site's own verdict chips — see `src/logic/pricing.ts::verdict`). Split into two tabs since undervalued deviation is unbounded (market can approach zero) and overvalued is capped at -100%, so one combined ranking was almost entirely undervalued cases — the highest-leverage place to manually spot-check for a bad Cardmarket price (see "Known data issue" below) without scanning all ~19,000 cards. Three verdicts, all stored in `src/data/price-exclusions.json` and parsed by one shared module (`src/logic/priceReview.js`) so the site and both build scripts agree:

  - **Type the correct trend price** into the box — the best option when the real number can be read off Cardmarket. It replaces the broken one on the site *and* in training, so the card stays in the model instead of being thrown away. Only the trend price is entered, because that's what the site shows and the model is fitted on; a corrected card therefore displays that price **alone**, with no 30-day average beside it (there is no hand-entered average, and showing a stale automatic one next to a hand-fixed trend would mix two different provenances). Stored as `{ "corrected": 0.07 }`, and labelled "corrected by hand" on the card page rather than attributed to the Cardmarket feed.
  - **Wrong** — the price is broken and there's nothing better to put there. Excluded from the next retrain, price hidden on the site.
  - **Verified** — the price is real but the model can't explain it (e.g. hype-driven). Kept in training, just remembered as reviewed so it doesn't need re-checking.

  Export/import as JSON.

## The pricing model

`analysis/fit_factors.py` fits a log-linear ridge regression — in price terms, purely multiplicative — on `scripts/training-data.json` (~19,000 English-language cards with a real Cardmarket price):

```
fair price = base rate (€1) × factor(Pokémon)^tierExponent × factor(rarity) × factor(illustrator)
             × factor(set) × factor(card type) × factor(card name)
             × factor(rarity × era) × factor(card type × era)
             × factor(rarity × set) × factor(card type × set)
```

**What it's tuned for.** Every choice above is made to minimise **median error against the Cardmarket `trend` price** — the number shown on every card page — **on cards from the 24 displayed sets**, cross-validated so no card is scored by a model that saw it. That replaced an earlier setup tuned on log-space R² against `avg30`, which flattered itself badly on both counts: R² stayed ~0.93 while whole rarity tiers were mispriced by 2×, because that error is small on a log scale next to the €0.02-to-€400 spread it's measured over; and fitting `avg30` while the site displays and judges by `trend` made the model accurate at predicting a number no visitor ever sees. `analysis/tune_model.py` is the bake-off harness these choices came out of — rerun it after a data refresh to check they still hold.

Interaction terms are deliberate and few — rarity and card type each get an × era and an × set version (below), plus the Pokémon premium varies by price tier. Everything else stays plainly multiplicative: an illustrator's factor doesn't depend on which set the card is from. Every level of every category gets its own factor, computed from data — not a hand-picked tier. Card type (V/VMAX/GX/EX/Mega EX/…) comes from TCGdex's `suffix` + `stage` fields (see `scripts/lib/cardMapping.mjs::mapCardType`). "Card name" is the Trainer/Energy analogue of "Pokémon" — Pokémon cards get a neutral "n/a" there (their identity is already covered by the Pokémon factor), while every Trainer/Energy card (which otherwise all shared one blended bucket) gets its own factor by exact printed name — e.g. Ultra Ball and a bulk Potion are no longer priced identically.

**Trainer-owned Pokémon** ("Team Rocket's Mewtwo ex", "N's Reshiram", "Erika's Vileplume ex") are filed by TCGdex as category `Pokemon` but with an **empty `dexId`**, which dropped them into the same no-Pokémon bucket as Trainers and Energy — losing the strongest price signal a card has, and a likely cause of large market-vs-fair gaps on exactly those cards. `effectiveDexIds()` (`scripts/lib/cardMapping.mjs`) recovers the species from the card name (strip the possessive, strip any card-type suffix, look up the Pokédex name) so the normal Pokémon factor applies. Guarded to `category === 'Pokemon'` so genuine Trainers with possessive names ("Professor's Research", "Boss's Orders") are never touched — verified: all 54 distinct Trainer-owned names resolve, 66 cards recovered, 0 non-Pokémon cards wrongly assigned a dex ID.

**Rarity × era** and **card type × era**, each layered on top of its plain factor rather than replacing it: a rarity tier or card mechanic means something very different depending on when the card was printed. Rarity: the game has stacked tier after tier above "Rare" over 25 years (Double Rare, Ultra Rare, Illustration Rare, …), diluting what it signals — median Rare/Common price ratio is 32.6× for WOTC-era cards vs. 2.3× for SV+ cards, while a single global rarity factor sits at 5.4× — systematically too high for modern Rares, too low for vintage ones. Card type: TCGdex's `suffix` casing for "ex"/"EX" doesn't reliably separate the old 2003–2010 EX era from the modern 2023+ ex era, so both get normalized into one bucket, but old "EX" cards have a median price of €64.62 vs. €1.88 for new "ex" — the same kind of gap. Neither is fixable by the Set factor (it can only move a whole set up/down, not change the ratio *between* rarities/mechanics within it). Five era buckets: WOTC (pre-2003), EX/DP (2003–2010), BW/XY (2011–2016), SM/SWSH (2017–2022), SV+ (2023+) — see `scripts/lib/cardMapping.mjs::eraBucket`. Chose these two over the alternatives: full rarity × set would be ~1,700 sparse combinations (most rarities appear in only ~10-20 cards per set); combining *every* category pairwise (e.g. Pokémon × illustrator, ~407,000 possible combinations) would be almost entirely one-off noise with no generalizable pattern. Rarity and card type are different in kind from the other categories — both are game-*designed* tier systems that have been formally redefined over the game's history, unlike organic/cultural factors like which Pokémon or illustrator is popular (checked: Charizard's price premium over a typical card has stayed roughly 150–210× across every era, far more stable than rarity's 14× swing — no similar case made for a Pokémon × era interaction).

The base rate is fixed at exactly €1 by construction: the ridge fit's raw intercept is a meaningless number on its own (it happened to land at €11.68 before this rescale), so it's folded entirely into the "set" factors instead — every card starts at €1, its set tells you the ballpark. Pure reparameterization, doesn't change any predicted price.

Regularization strength is picked via 5-fold cross-validation; a 60-resample bootstrap gives every factor a 95% confidence interval, so entries backed by very little data are identifiable rather than silently trusted. On-site, factors with fewer than 5 supporting cards are additionally dampened toward neutral (1×) so a single freak card can't dominate a shown price — see `scripts/lib/factors.mjs`. The full, undamped numbers (every Pokémon, rarity, illustrator, set, card type, card name, rarity × era, and card type × era combination, with sample size and confidence interval) are documented in `analysis/PokeValue-Faktoren.pdf`, generated by `analysis/build_report.py`.

**A Pokémon's premium is not a constant multiplier.** Fitted on the data, a Pokémon's popularity applies **1.47× as strongly on mid-tier cards and 2.02× as strongly on chase cards** (illustration / special illustration / hyper / shiny rares) as it does on bulk cards — shipped as `pokemonTierExponent`, applied as `factor(Pokémon) ^ exponent`. A single global Pokémon factor averages the two, which systematically overpriced Illustration Rares of unloved Pokémon and underpriced chase Special Illustration Rares: before this, a Pitch Black Thievul IR showed as 284% undervalued and Mega Darkrai ex SIRs were far too cheap. Expressed as a *varying coefficient* — two extra parameters, one per non-bulk tier — rather than a Pokémon × tier interaction, which was tested and lost badly (1,026 Pokémon × 3 tiers is far too sparse). Tier definition lives in `scripts/lib/cardMapping.mjs::rarityTier` with a Python mirror in `fit_factors.py`.

**Rarity × set** and **card type × set**, on top of the era versions: the same drift happens *within* the SV+ era bucket, which lumps 2023–2026 together and is far too coarse for it. Measured before these terms existed: Illustration Rare fair prices ran 1.4–2.1× high on 2025–26 sets while Special Illustration Rares ran 0.53–0.92× low, with older SV sets showing the reverse. `raritySet` additionally gets a quarter of the usual ridge penalty (`RARITY_SET_SCALE`, implemented by column scaling — an exact reparameterization): it encodes a sharp real effect measured on 10–70 cards per level, and shrinking it as hard as the sparse one-off categories left the very bias it exists to remove.

**Trained on more sets than are displayed.** The site shows only the Scarlet & Violet + Mega Evolution sets (`src/data/generated/sets.json`), but the model fits on TCGdex's full English catalog — ~170 sets back to 1999. That breadth is deliberate: a Pokémon or illustrator with only 2 appearances across the displayed sets but 40 across history would otherwise get a near-meaningless factor. Rows from non-displayed sets are down-weighted to 0.2× (`TRAINING_ONLY_WEIGHT`) — swept, and both dropping them entirely and counting them fully score worse. Alpha and every reported number come *only* from held-out displayed-set cards.

**Accuracy, measured the way the site is used** — median error vs. the trend price, on the 24 displayed sets, cross-validated: **29.6% median, 34% of cards within 20%**. Broken out by price, because one median over four orders of magnitude hides exactly what matters:

| price band | median error |
|---|---|
| under €0.30 (58% of all cards) | 26% |
| €0.30 – €3 | 33% |
| €3 – €30 | 38% |
| €30+ | 48% |

Over half of all cards trade under €0.30, where Cardmarket's 1-cent price steps alone floor the achievable error — so the headline is dominated by cards nobody looks up, and the expensive end is where this is genuinely hardest. For reference: two *real* price fields for the same card (`avg30` vs `trend`) differ by a median 11.6%, and predicting every card by the median of its own set × rarity group scores 31.7% — so the model is doing real work beyond a lookup table, but a large part of what's left is genuine market noise no card-attribute model can reach.

**Regression target: `trend`.** Earlier versions fitted `avg30`, which only agrees with `trend` once a set has settled — a set fresh off release has `avg30` still averaging its own first, hype-inflated days (Pitch Black at 8 days old: median `avg30`/`trend` ratio 1.67, enough on its own to make the whole set look wildly undervalued). Fitting the field the site actually shows removes that class of bug entirely.

**Known data issue:** TCGdex's Cardmarket price for a small number of cards is mapped to the wrong product — confirmed by hand for one user-reported card (a Chaos Rising Delphox showing ~€1.89 instead of its real ~€0.07 on Cardmarket). Verified this isn't a stale-cache problem (the live TCGdex API serves the same wrong number) and isn't statistically detectable (the wrong price looks like an ordinary price for its rarity tier — no internal inconsistency to catch). `build-training-data.mjs` automatically drops the one sub-case that *is* detectable — a Cardmarket product ID literally shared with a different Pokémon (180 of ~19,400 cards, a confirmed TCGdex bug). Everything else relies on manual spot-checking via `/admin/price-audit` (see above) and `src/data/price-exclusions.json`.

**Not modeled:** reverse holo / 1st Edition / Shadowless pricing (Cardmarket's variant-level data turned out too inconsistent across cards to trust — some of the most famous vintage variants have no separate price at all) and the manual artwork ratings (descoped for this version — see the admin page above). Condition and language remain adjustable on the card page but are explicitly labeled as assumptions, not computed factors: querying TCGdex in different languages for the same physical card returns the identical Cardmarket product ID and price, so there's no real data to derive a language multiplier from, and Cardmarket doesn't track prices by grade either.

### Rebuilding the model

```bash
node scripts/fetch-all-cards.mjs          # bulk-pull every English card (cached, resumable)
node scripts/fetch-all-sets.mjs           # set release dates
node scripts/build-training-data.mjs      # cache + promo-styles.json + price-exclusions.json -> training-data.json
python analysis/fit_factors.py            # fit the model -> analysis/factors.json
python analysis/build_report.py           # -> analysis/PokeValue-Faktoren.pdf
node scripts/ingest.mjs sv01 sv02 …       # bake factors into each displayed set's card JSON
node scripts/build-outlier-candidates.mjs # (after ingest) -> candidate list for /admin/price-audit
node scripts/build-search-index.mjs       # (after ingest) -> homepage card search index
node scripts/build-sitemap.mjs            # (after ingest) -> public/sitemap.xml
node scripts/build-factor-highlights.mjs  # (after fit) -> example factors for /how-it-works
```

Python deps: `pip install pandas scikit-learn scipy statsmodels reportlab pypdf`.

**Sets deliberately not ingested:** pure-Energy sets (e.g. `sve` Scarlet & Violet Energy, `mee` Mega Evolution Energy — every card is a basic Energy, nothing to price) and `mfb` My First Battle (a starter-box reprint set, not worth tracking). Skip these when adding new sets.

## URLs and SEO

Routing uses **real paths** (`/set/sv08.5`, `/card/sv08.5-006`), not the URL fragment it started with. A fragment is never sent to the server, so under the old `#/card/…` scheme every card and set looked like one single URL to a crawler — nothing to index, and a sitemap would have had nothing to point at. Pieces that make the path-based version work:

- **`vercel.json`** sets `cleanUrls` (so `dist/card/x.html` is served at `/card/x`), `trailingSlash: false`, and rewrites any non-asset path to `/`, so a direct hit on a route with no prerendered file (`/admin/…`) still serves the app instead of 404ing. Vercel gives "precedence to the filesystem prior to rewrites being applied", so the prerendered pages below win over that rewrite automatically and the rewrite stays a fallback. The destination must be `/`, not `/index.html`: `cleanUrls` makes every `.html` path redirect to its extensionless form, so `/index.html` stops being a servable target and the fallback 404s instead — which is exactly what happened on the first deploy of this setup.
- **`src/router.ts`** navigates with `history.pushState` and intercepts clicks on internal links from a single document-level listener. Links stay plain `<a href="/card/x">` — crawlers and "open in new tab" see a normal URL, and only ordinary left-clicks get upgraded to a no-reload transition. Modifier-clicks, `target="_blank"`, downloads, and external hosts are deliberately left to the browser.
- **Legacy hash URLs** (`/#/set/sv01`) are rewritten to the real path on load, so old bookmarks and previously shared links keep working.
- **`src/logic/pageMeta.js`** holds every route's `<title>` and meta description as pure functions. It is plain JS, not TS, for one reason: both the browser bundle and the Node build scripts import *this same module*, so the tags a crawler reads can't drift from what the app sets. `src/logic/format.js` and `src/logic/verdict.js` exist for the same reason (prices and the over-/undervalued judgement have to match too); `pricing.ts` re-exports them, so app code imports them from where it always did.
- **`src/logic/documentMeta.ts`** applies those values at runtime — `<title>`, meta description, canonical, OG/Twitter tags, plus the card image as `og:image`. This is what keeps metadata correct across client-side navigations, where no new document is ever fetched.
- **`scripts/prerender.mjs`** bakes the same values into the static HTML at build time, writing one `dist/<route>.html` per URL (~4,700). Chained onto `npm run build`, after `vite build`. Each file gets the real title/description/canonical/OG tags, JSON-LD structured data (`Product` + `AggregateOffer` for cards — emitted only when a real Cardmarket price exists, never invented — `CollectionPage` for sets, `BreadcrumbList` throughout), and a plain-HTML rendering of the page inside `#root` that React replaces on mount.
- **`scripts/build-sitemap.mjs`** writes `public/sitemap.xml` (~4,700 URLs: home + every set + every card), linked from `robots.txt`. Admin pages are excluded there and disallowed in `robots.txt`.

**Why prerender at all, given Google runs JS?** Google does render JavaScript, but on a second pass that can trail the initial crawl by days — and link-preview bots (Discord, WhatsApp, X, Slack, Facebook) never run it at all, so every shared card link used to preview as the generic homepage. Serving the real tags in the first byte fixes both and gives the first crawl actual content instead of an empty `<div id="root">`.

The markup written into `#root` is real, visible content — the site reads with JavaScript disabled — not a hidden crawler-only copy, which search engines treat as cloaking. It is styled (`.prerender-shell` in `index.css`) to match the real layout's width and rhythm so the swap on mount isn't a visible jump.

`index.html` carries `<!--seo-->…<!--/seo-->` markers and an empty `<div id="root">`; `prerender.mjs` replaces both and re-emits the markers, so it can be re-run on an already-prerendered `dist/` without a fresh `vite build`. If you change either seam in `index.html`, the script fails loudly rather than silently producing pages with default metadata.

## Development

```bash
npm install
npm run dev              # dev server at http://localhost:5173
npm run build             # production build to dist/
```

Stack: React 19 + TypeScript + Vite for the site; Python (pandas/scikit-learn) for the offline regression — the browser never loads the raw factors file, only each card's precomputed price. Card data and Cardmarket prices come from the free [TCGdex API](https://tcgdex.dev).

## Deployment (GitHub + Vercel)

1. Create a GitHub repository and push to it.
2. On [vercel.com](https://vercel.com), "Add New Project" → select the GitHub repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. From then on, every push deploys automatically. To refresh prices, rerun the model-rebuild steps above and commit (can later be automated with a scheduled GitHub Action).
4. Custom domain: `pokevalue.cards` is attached in the Vercel dashboard (Project → Settings → Domains). If the domain ever changes, update `https://pokevalue.cards` in `index.html` (canonical/OG tags), `src/logic/pageMeta.js` (`SITE_ORIGIN`), `scripts/build-sitemap.mjs` (`ORIGIN`), `public/robots.txt`, and this README.
5. `vercel.json` is what makes deep links work (see "URLs and SEO") — don't remove it, or `/card/x` will 404 on direct load while still working via in-app clicks, which is an easy failure mode to miss in local testing. Note that `npm run preview` (plain `vite preview`) does *not* reproduce Vercel's `cleanUrls`, so it serves the SPA fallback for `/card/x` and hides the prerendered pages — that's a local-only artifact, not a deployment problem.

## Project structure

```
analysis/
  fit_factors.py            Fits the ridge regression, writes factors.json + model_report.json
  build_report.py            Writes the full factor PDF report
  pokedex_names.json          Dex-number -> species-name lookup (from PokeAPI), for the PDF
scripts/
  ingest.mjs                 Bakes computed factors into each displayed set's card JSON
  fetch-all-cards.mjs         Bulk pull of every card (training data source, cached)
  fetch-all-sets.mjs          Bulk pull of set release dates
  build-training-data.mjs     Cache -> compact training-data.json
  build-artwork-candidates.mjs Cache -> candidate list for the (currently unused) rating admin page
  build-promo-candidates.mjs  Cache -> candidate list (priced Promo-rarity cards) for the style admin page
  build-outlier-candidates.mjs Generated cards-*.json -> top 100 overvalued + top 100 undervalued for the price-audit page
  build-search-index.mjs      Generated cards-*.json -> lightweight name/number index for the homepage search bar
  build-sitemap.mjs           Generated cards-*.json -> public/sitemap.xml (home + every set + every card)
  prerender.mjs               Post-build: one static dist/<route>.html per URL, with real metadata + JSON-LD
  build-factor-highlights.mjs analysis/factors.json -> small example-factor slice for the /how-it-works page
  lib/cardMapping.mjs         Card-type derivation, artwork-candidate rarity filter, effectiveRarity() (promo style), eraBucket()
  lib/factors.mjs             Looks up computed factors for a card, applies low-sample dampening
src/
  data/defaults.ts        Condition/language options — the only user-adjustable factors, and only assumptions
  data/cards.ts            Access to imported sets/cards, pricing-meta (score normalization range)
  data/generated/          Imported card data incl. baked-in factors (JSON, commit these!)
  data/promo-styles.json  Hand-tagged Promo styles: Alt Art 10/9/8, Stamped, Normal (commit this!)
  data/price-exclusions.json Hand-reviewed prices: wrong / verified / {corrected: n} (commit this!)
  logic/pricing.ts         Fair price, score; re-exports verdict + formatting from the shared JS modules
  logic/pageMeta.js        Per-route title/description (shared with scripts/prerender.mjs — see "URLs and SEO")
  logic/format.js          Euro/percent formatting, shared with the build scripts
  logic/verdict.js         Over-/undervalued judgement + default thresholds, shared with the build scripts
  logic/artworkRatings.ts  localStorage persistence for the rating admin page
  logic/promoStyles.ts     localStorage persistence for the promo-style admin page
  logic/priceExclusions.ts localStorage persistence for the price-audit admin page
  components/              Result panel, price breakdown, option groups, chips
  pages/                   Home, set, card, artwork-rating, promo-style, and price-audit admin (lazy-loaded)
  router.ts                History-API router (/set/…, /card/…, /admin/…) + scroll memory
  logic/documentMeta.ts    Per-route <title>, meta description, canonical + OG tags
```

## Notes

Unofficial fan project — not endorsed by Nintendo, Game Freak, or The Pokémon Company. Pokémon names and card images belong to their rights holders. Not financial advice; the pricing model is a data-driven estimate, not a market oracle.
