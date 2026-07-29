"""
Fits the PokéValue pricing model — as THREE parallel variants of one log-linear
(== multiplicative in price space) ridge regression, differing only in how
finely they slice the comparison group for a card:

  broad     price = anchor x pokemon x rarity x illustrator x set x cardType
                    x cardName
            "compared with broadly similar cards" — no year interactions, no
            artwork, no tier exponent. The widest comparison circle: blunt,
            but immune to one weird set or year polluting a narrow bucket.

  standard  broad + rarity x year + cardType x year + artwork
            + the Pokémon tier exponent. The balanced default.

  local     standard + rarity x set. The tightest circle: a card is compared
            against its direct neighbours (same rarity, same set). Most
            accurate per card — and, by construction, least able to call a
            whole (set, rarity) group collectively mispriced, because that
            group average IS its factor.

WHY THREE
---------
The variants answer genuinely different questions. "Undervalued" under broad
means "cheap for this kind of card anywhere"; under local it means "cheap next
to its own neighbours". Both are legitimate, neither is the truth, and any
single choice silently decides the question for the visitor. Measured symptoms
of that (see the session that led here): with only coarse terms, Black Bolt's
expensive Illustration Rares polluted the 2025 rarity-year bucket and made
every ordinary 2025 IR read as a fake bargain; with rarity x set, only 5 of
147 (set, rarity) groups could still be flagged as collectively off, versus 34
without it.

THE SHIPPED NUMBER is the MEDIAN of the three fair prices — "the middle of the
three estimates". It is evaluated out of fold below exactly like the variants
themselves. Agreement between the three is shipped alongside and shown as a
design element (three dots on the verdict chip), deliberately NOT folded into
the number.

WHAT THIS IS TUNED FOR
----------------------
Median absolute percentage error against `trend` (the price the site shows),
on cards from the displayed sets, cross-validated so no card is scored by a
model that saw it. Per price band, because one median over a EUR0.02-EUR400
range hides exactly the errors that matter (53% of cards trade under EUR0.10,
where Cardmarket's 1-cent steps floor the achievable error). R² flattered a
badly-biased model before and is kept only as a footnote. Fitting `avg30`
while the site judges by `trend` was an earlier bug of the same kind.
analysis/tune_model.py is the bake-off harness these choices came out of.

SHARED MACHINERY (all variants)
-------------------------------
- "cardName" is the Trainer/Energy analogue of "pokemon": Pokémon cards land
  in a shared "n/a" bucket, Trainer/Energy cards get a factor per printed name.
- The Pokémon premium is not a constant multiplier: fitted, it applies ~1.2x
  as strongly on mid-tier and ~1.8x on chase cards as on bulk. Carried as a
  varying coefficient (pokemonTierExponent), two parameters — the full
  pokemon x tier interaction was tested and lost (1026 Pokémon x 3 tiers is
  far too sparse). Applied in standard and local; broad stays deliberately
  simple.
- rarity x year / cardType x year: what a rarity tier or card mechanic is
  worth has been redefined repeatedly (median Rare/Common ratio 32.6x pre-2003
  vs 2.3x now; old "EX" median EUR64.62 vs new "ex" EUR1.88). Year buckets, not
  eras: one "SV+" era spanning 2023-2026 proved far too coarse.
- artwork: hand-rated illustration quality (src/data/artwork-ratings.json).
  Grades 10/9/worse map to top/strong/weak; the 8s are DISCARDED — the
  reviewer flagged them as "acceptable or couldn't judge", and measured, an 8
  sits at 1.00 vs the model, indistinguishable from unrated (0.98).
- Every category is centred to a card-weighted geometric mean of exactly 1x
  (the split of the price level between categories is not identified by the
  data — it's presentation — and folding it all into "set" used to make set
  look as important as rarity when rarity spans ~100x and set ~20x). The
  anchor is then "what a typical card is worth".
- Training rows from sets not displayed on the site (the ~150 historical sets)
  are down-weighted to TRAINING_ONLY_WEIGHT — they stabilize sparse Pokémon /
  illustrator levels without outvoting the displayed sets.
- Data caveat: a few cards carry a Cardmarket price mapped to the wrong
  product on TCGdex's end; not statistically detectable. Hand-reviewed via
  /admin/price-audit (wrong / verified / corrected — see priceReview.js).

Reads:  scripts/training-data.json   (~19,000 English cards with a real price)
        src/data/generated/sets.json (which sets are actually displayed)
Writes: analysis/factors.json        (standard top-level for compatibility;
                                      broad/local under "variants")
        analysis/model_report.json   (per-variant + combined quality)

Usage: python analysis/fit_factors.py
"""

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold

HERE = Path(__file__).resolve().parent
TRAINING_DATA = HERE.parent / "scripts" / "training-data.json"
DISPLAYED_SETS = HERE.parent / "src" / "data" / "generated" / "sets.json"
FACTORS_OUT = HERE / "factors.json"
REPORT_OUT = HERE / "model_report.json"

BROAD_CATEGORIES = ["pokemon", "rarity", "illustrator", "set", "cardType", "cardName"]
STANDARD_CATEGORIES = BROAD_CATEGORIES + ["rarityYear", "cardTypeYear", "artwork"]
LOCAL_CATEGORIES = STANDARD_CATEGORIES + ["raritySet"]
ALL_CATEGORIES = LOCAL_CATEGORIES

# Mirrors VARIANT_CATEGORIES in scripts/lib/factors.mjs — keep both in sync.
VARIANTS = {
    "broad": {"categories": BROAD_CATEGORIES, "tier_exponent": False},
    "standard": {"categories": STANDARD_CATEGORIES, "tier_exponent": True},
    "local": {"categories": LOCAL_CATEGORIES, "tier_exponent": True},
}

N_BOOTSTRAP = 60
RNG_SEED = 42
N_FOLDS = 5
ALPHA_GRID = [0.32, 1.0, 1.78, 3.16, 5.62, 10.0]

DISPLAYED_SET_WEIGHT = 1.0
TRAINING_ONLY_WEIGHT = 0.2
TIERS = ["bulk", "mid", "chase"]
VARYING_TIERS = ["mid", "chase"]  # bulk is the reference (exponent fixed at 1)

PRICE_BANDS = [(0, 0.30), (0.30, 3), (3, 30), (30, float("inf"))]
VERDICT_THRESHOLD = 0.20  # site's over/under threshold, for the agreement stats


def release_year(release_date):
    """Mirrors scripts/lib/cardMapping.mjs::releaseYear — keep both in sync."""
    if not release_date:
        return "Unknown"
    year = str(release_date)[:4]
    return year if year.isdigit() else "Unknown"


# Price tiers are DERIVED, not hand-listed. They used to be two literal sets of
# rarity names — one here, one mirrored in JS — and that broke exactly the way
# hand-maintained lists do: Black Bolt introduced "Black White Rare" (median
# EUR380) and Mega Evolution "Mega Hyper Rare" (EUR170), neither was in the
# list, so both silently fell through to "bulk" and their Pokémon premium was
# never amplified. "Shiny Ultra Rare" had the same problem more mildly.
#
# So the tier now comes from what a rarity actually SELLS for. The two
# thresholds below reproduce every previously-correct classification exactly
# while fixing the three broken ones, and any rarity a future set invents is
# placed automatically. The resulting map ships in factors.json, so the JS side
# looks it up instead of keeping a second copy that can drift.
TIER_THRESHOLDS = [(0.30, "bulk"), (3.00, "mid")]  # above the last threshold: "chase"


def tier_for_median_price(median_price):
    for limit, tier in TIER_THRESHOLDS:
        if median_price < limit:
            return tier
    return "chase"


# ---------------------------------------------------------------- load data

print("Loading training data …")
raw = json.loads(TRAINING_DATA.read_text(encoding="utf-8"))
df = pd.DataFrame(raw)
print(f"  {len(df)} priced cards")

# `trend` is the target because it is the number the site shows and judges by.
df = df[df["trend"].notna() & (df["trend"] > 0)].copy().reset_index(drop=True)
print(f"  {len(df)} with a usable trend price")

displayed_set_ids = {s["id"] for s in json.loads(DISPLAYED_SETS.read_text(encoding="utf-8"))}
df["displayed"] = df["setId"].isin(displayed_set_ids)
sample_weight = np.where(df["displayed"], DISPLAYED_SET_WEIGHT, TRAINING_ONLY_WEIGHT)
print(
    f"  {int(df['displayed'].sum())} rows in displayed sets (weight {DISPLAYED_SET_WEIGHT}), "
    f"{int((~df['displayed']).sum())} training-only (weight {TRAINING_ONLY_WEIGHT})"
)

df["pokemon"] = df["dexIds"].apply(lambda ids: str(ids[0]) if ids else "none")
df["rarity"] = df["rarity"].fillna("None")
df["illustrator"] = df["illustrator"].fillna("Unknown")
df["set"] = df["setId"].fillna("unknown")
df["cardType"] = df["cardType"].fillna("Standard")
df["cardName"] = df.apply(lambda row: "n/a" if row["dexIds"] else row["name"], axis=1)
df["year"] = df["releaseDate"].apply(release_year)
# Median trend price per rarity level -> tier. Computed on displayed-set cards:
# those are what the tiers are used to price, and historical sets drag the
# medians around (a 1999 "Rare" is nothing like a 2026 one).
_tier_basis = df[df["displayed"]].groupby("rarity")["trend"].median()
rarity_tiers = {r: tier_for_median_price(p) for r, p in _tier_basis.items()}
df["tier"] = df["rarity"].map(rarity_tiers).fillna("bulk")
print("  price tiers: " + ", ".join(
    f"{t}={sum(1 for v in rarity_tiers.values() if v == t)}" for t in TIERS))
df["rarityYear"] = df["rarity"] + " | " + df["year"]
df["cardTypeYear"] = df["cardType"] + " | " + df["year"]
df["raritySet"] = df["rarity"] + " | " + df["set"]
df["artwork"] = df["artwork"].fillna("none")
df["logPrice"] = np.log(df["trend"].astype(float))

for c in ALL_CATEGORIES:
    print(f"  {c}: {df[c].nunique()} distinct values")

# ---------------------------------------------------- build the design matrix

# One matrix for the union of all categories; each variant selects its columns.
# Full one-hot per category (every level, no dropped reference) — with an
# unpenalized intercept, ridge pushes the shared grand-mean level into the
# intercept and leaves each category's coefficients as genuine deviations.
print("\nBuilding one-hot design matrix …")
category_values: dict[str, list[str]] = {}
blocks = []
col_category = []
col_level = []

for c in ALL_CATEGORIES:
    dummies = pd.get_dummies(df[c], prefix="", prefix_sep="", sparse=True)
    levels = list(dummies.columns)
    category_values[c] = levels
    blocks.append(sparse.csr_matrix(dummies.sparse.to_coo()))
    col_category.extend([c] * len(levels))
    col_level.extend(levels)

X_all = sparse.hstack(blocks, format="csr").tocsc()
col_category = np.array(col_category)
col_level = np.array(col_level)

y = df["logPrice"].to_numpy()
trend = df["trend"].to_numpy().astype(float)
displayed = df["displayed"].to_numpy()
tier = df["tier"].to_numpy()
n_samples = X_all.shape[0]
print(f"  X (union): {n_samples} rows x {X_all.shape[1]} columns (sparse)")

disp_idx = np.flatnonzero(displayed)
other_idx = np.flatnonzero(~displayed)
kf = KFold(n_splits=N_FOLDS, shuffle=True, random_state=RNG_SEED)
folds = list(kf.split(disp_idx))

sample_counts = {c: df[c].value_counts().to_dict() for c in ALL_CATEGORIES}


class Variant:
    """One fitted model variant over a column subset of the shared matrix."""

    def __init__(self, name, categories, tier_exponent):
        self.name = name
        self.categories = categories
        self.use_tier = tier_exponent
        self.col_mask = np.isin(col_category, categories)
        self.X = X_all[:, self.col_mask].tocsr()
        self.cats = col_category[self.col_mask]
        self.levels = col_level[self.col_mask]
        self.pokemon_mask = self.cats == "pokemon"
        self.alpha = None

    def _tier_columns(self, contrib):
        return sparse.csr_matrix(np.column_stack([contrib * (tier == t) for t in VARYING_TIERS]))

    def fit(self, train_idx, alpha):
        """Two-stage: plain fit, then (if enabled) add the tier-varying Pokémon term."""
        m1 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        m1.fit(self.X[train_idx], y[train_idx], sample_weight=sample_weight[train_idx])
        if not self.use_tier:
            return m1, self.X
        contrib = np.asarray(self.X[:, self.pokemon_mask] @ m1.coef_[self.pokemon_mask]).ravel()
        X2 = sparse.hstack([self.X, self._tier_columns(contrib)], format="csr")
        m2 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        m2.fit(X2[train_idx], y[train_idx], sample_weight=sample_weight[train_idx])
        return m2, X2

    def oof_predictions(self, alpha):
        """Out-of-fold price prediction for every displayed card."""
        pred = np.empty(len(disp_idx))
        for train_part, test_part in folds:
            train_idx = np.concatenate([other_idx, disp_idx[train_part]])
            model, X2 = self.fit(train_idx, alpha)
            pred[test_part] = np.exp(model.predict(X2[disp_idx[test_part]]))
        return pred

    def select_alpha(self):
        print(f"\n[{self.name}] selecting alpha ({len(self.categories)} categories) …")
        scores = {}
        for alpha in ALPHA_GRID:
            pred = self.oof_predictions(alpha)
            ape = np.abs(pred - trend[disp_idx]) / trend[disp_idx]
            scores[alpha] = float(np.median(ape))
            print(f"  alpha={alpha:6.2f}  median APE={scores[alpha]*100:5.1f}%")
        self.alpha = min(scores, key=scores.get)
        print(f"  -> alpha={self.alpha:.2f}")
        return scores


def ape_stats(pred):
    ape = np.abs(pred - trend[disp_idx]) / trend[disp_idx]
    return {"medianAPE": float(np.median(ape)), "within20": float(np.mean(ape <= 0.2))}


variants = {name: Variant(name, spec["categories"], spec["tier_exponent"]) for name, spec in VARIANTS.items()}
cv_scores = {name: v.select_alpha() for name, v in variants.items()}

# ------------------------------------------------------------- honest scoring

# All three out-of-fold prediction sets at their chosen alphas, plus the
# combination the site actually ships: the per-card MEDIAN of the three.
oof = {name: v.oof_predictions(v.alpha) for name, v in variants.items()}
oof_combined = np.median(np.column_stack([oof[n] for n in VARIANTS]), axis=1)

print("\nOut-of-fold on displayed cards:")
per_variant_stats = {}
for name in VARIANTS:
    s = ape_stats(oof[name])
    per_variant_stats[name] = {**s, "alpha": variants[name].alpha}
    print(f"  {name:<9} median APE={s['medianAPE']*100:5.1f}%  within 20%={s['within20']*100:3.0f}%")
combined_stats = ape_stats(oof_combined)
print(f"  {'combined':<9} median APE={combined_stats['medianAPE']*100:5.1f}%  within 20%={combined_stats['within20']*100:3.0f}%   <- shipped")

band_stats = {}
apes_combined = np.abs(oof_combined - trend[disp_idx]) / trend[disp_idx]
for lo, hi in PRICE_BANDS:
    sel = (trend[disp_idx] >= lo) & (trend[disp_idx] < hi)
    if sel.sum() < 10:
        continue
    label = f"{lo:g}-{hi:g}" if np.isfinite(hi) else f"{lo:g}+"
    band_stats[label] = {
        "n": int(sel.sum()),
        "medianAPE": float(np.median(apes_combined[sel])),
        "within20": float(np.mean(apes_combined[sel] <= 0.2)),
    }
for label, s in band_stats.items():
    print(f"    EUR{label:<8} n={s['n']:>5}  median APE={s['medianAPE']*100:5.1f}%  within 20%={s['within20']*100:3.0f}%")

# Agreement between the three variants' verdicts, at the site's threshold —
# shipped to the report so the site can honestly describe how often the three
# views actually differ.
def verdicts(pred):
    gap = (trend[disp_idx] - pred) / pred
    return np.where(gap > VERDICT_THRESHOLD, 1, np.where(gap < -VERDICT_THRESHOLD, -1, 0))

verdict_matrix = np.column_stack([verdicts(oof[n]) for n in VARIANTS])
all_agree = float(np.mean((verdict_matrix == verdict_matrix[:, [0]]).all(axis=1)))
print(f"\n  all three verdicts agree on {all_agree*100:.0f}% of displayed cards")

# Log-space R² of the combined prediction, footnote only.
sse = np.sum((np.log(oof_combined) - y[disp_idx]) ** 2)
sst = np.sum((y[disp_idx] - y[disp_idx].mean()) ** 2)
displayed_r2 = float(1 - sse / sst)

# --------------------------------------------------------------- final fits

def finalize(v: Variant, with_bootstrap: bool):
    """Fit on all data, centre every category on 1x, return the factor tables."""
    print(f"\n[{v.name}] fitting final model on all data …")
    model, X2 = v.fit(np.arange(n_samples), v.alpha)
    n_feat = v.X.shape[1]
    point = model.coef_[:n_feat].copy()
    intercept = float(model.intercept_)

    tier_exponent = {"bulk": 1.0, "mid": 1.0, "chase": 1.0}
    if v.use_tier:
        for t, c in zip(VARYING_TIERS, model.coef_[n_feat:]):
            tier_exponent[t] = float(1.0 + c)
        print("  Pokémon premium by tier: " + ", ".join(f"{t}={tier_exponent[t]:.2f}x" for t in TIERS))

    # ---- per-rarity calibration -------------------------------------------
    # Ridge shrinks a level purely by how MANY cards back it, never by whether
    # those cards agree. "Black White Rare" has 4 cards priced EUR300-450 — a
    # tight cluster whose level is well determined — yet it was pulled toward
    # neutral as hard as a 4-card level scattered over two orders of magnitude,
    # leaving all four ~4x underpriced.
    #
    # So: give each rarity level back the systematic offset its own cards still
    # show, scaled by how far that offset stands out from their scatter
    # (w = m^2 / (m^2 + se^2)) — a consistent offset is applied in full, one
    # indistinguishable from noise is ignored. Validated leave-one-out in
    # analysis/test_calibration.py, so a level is never judged on a card that
    # helped set its own correction: median APE 24.0% -> 23.5%, and only the two
    # levels that need it move at all (Black White Rare 4.12x, Mega Hyper Rare
    # 1.63x; every other level lands within 15% of neutral).
    residual = y - model.predict(X2)
    rarity_by_row = df["rarity"].to_numpy()
    for idx in np.flatnonzero(v.cats == "rarity"):
        rows = displayed & (rarity_by_row == v.levels[idx])
        if rows.sum() < 2:
            continue
        r = residual[rows]
        m = float(np.mean(r))
        se = float(np.std(r, ddof=1) / np.sqrt(rows.sum()))
        weight = m * m / (m * m + se * se) if (m or se) else 0.0
        if abs(m * weight) > 0.01:
            point[idx] += m * weight

    boot_lo = boot_hi = boot_std = None
    if with_bootstrap:
        print(f"  bootstrapping ({N_BOOTSTRAP} resamples) …")
        t0 = time.time()
        boot = np.zeros((N_BOOTSTRAP, n_feat))
        rng = np.random.default_rng(RNG_SEED + 1)
        for b in range(N_BOOTSTRAP):
            idx = rng.integers(0, n_samples, n_samples)
            m = Ridge(alpha=v.alpha, fit_intercept=True, solver="sparse_cg")
            m.fit(v.X[idx], y[idx], sample_weight=sample_weight[idx])
            boot[b] = m.coef_
        boot_std = boot.std(axis=0)
        boot_lo = np.percentile(boot, 2.5, axis=0)
        boot_hi = np.percentile(boot, 97.5, axis=0)
        print(f"  bootstrap done in {time.time() - t0:.0f}s")

    # Centre every category on a card-weighted geometric mean of 1x (see the
    # module docstring); the remainder becomes this variant's anchor.
    for cat in v.categories:
        mask = v.cats == cat
        weights = np.array([sample_counts[cat].get(lvl, 0) for lvl in v.levels[mask]], dtype=float)
        if weights.sum() == 0:
            continue
        offset = float(np.average(point[mask], weights=weights))
        point[mask] -= offset
        if boot_lo is not None:
            boot_lo[mask] -= offset
            boot_hi[mask] -= offset
        intercept += offset
    anchor = float(np.exp(intercept))
    print(f"  anchor EUR{anchor:.2f}")

    factors: dict[str, dict] = {c: {} for c in v.categories}
    for i in range(len(point)):
        cat, level = v.cats[i], v.levels[i]
        n = int(sample_counts[cat].get(level, 0))
        entry = {"factor": round(float(np.exp(point[i])), 4), "n": n}
        if boot_lo is not None:
            entry["ciLow"] = round(float(np.exp(boot_lo[i])), 4)
            entry["ciHigh"] = round(float(np.exp(boot_hi[i])), 4)
            entry["relativeUncertainty"] = round(float(boot_std[i]), 4)
        factors[cat][level] = entry

    return {
        "anchor": round(anchor, 4),
        "alpha": v.alpha,
        "pokemonTierExponent": {t: round(tier_exponent[t], 4) for t in TIERS},
        "factors": factors,
    }


results = {
    name: finalize(v, with_bootstrap=(name == "standard")) for name, v in variants.items()
}

# ------------------------------------------------------------------- outputs

# `standard` stays top-level so build_report.py, build-factor-highlights.mjs
# and anything else reading the old shape keeps working unchanged.
FACTORS_OUT.write_text(
    json.dumps(
        {
            "trainedAt": pd.Timestamp.utcnow().isoformat(),
            "target": "trend",
            "nRows": int(n_samples),
            "nBootstrap": N_BOOTSTRAP,
            # Which price tier each rarity falls in — derived above from what it
            # actually sells for. Shipped so scripts/lib/factors.mjs looks it up
            # instead of keeping a second, drift-prone copy.
            "rarityTiers": rarity_tiers,
            **results["standard"],
            "variants": {name: results[name] for name in ("broad", "local")},
        },
        indent=1,
    ),
    encoding="utf-8",
)
print(f"\nWrote {FACTORS_OUT}")

REPORT_OUT.write_text(
    json.dumps(
        {
            "trainedAt": pd.Timestamp.utcnow().isoformat(),
            "target": "trend",
            "nRows": int(n_samples),
            "nDisplayedRows": int(displayed.sum()),
            "displayedSetWeight": DISPLAYED_SET_WEIGHT,
            "trainingOnlyWeight": TRAINING_ONLY_WEIGHT,
            "alpha": variants["standard"].alpha,
            "pokemonTierExponent": results["standard"]["pokemonTierExponent"],
            # Headline numbers describe the SHIPPED prediction: the per-card
            # median of the three variants, out of fold.
            "displayedMedianAPE": combined_stats["medianAPE"],
            "displayedWithin20": combined_stats["within20"],
            "displayedTestR2": displayed_r2,
            "byPriceBand": band_stats,
            "perVariant": per_variant_stats,
            "verdictAgreement": all_agree,
            "categoryCardinality": {c: int(df[c].nunique()) for c in ALL_CATEGORIES},
        },
        indent=1,
    ),
    encoding="utf-8",
)
print(f"Wrote {REPORT_OUT}")
