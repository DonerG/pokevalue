"""
Fits the PokéValue pricing model: a log-linear (== multiplicative in price
space) ridge regression that explains a card's Cardmarket price purely from
card identity:

    price = anchor x factor(pokemon)^tierExponent x factor(rarity)
            x factor(illustrator) x factor(set) x factor(card type)
            x factor(card name) x factor(rarity x era) x factor(card type x era)
            x factor(rarity x set) x factor(card type x set)

`anchor` is fixed at EUR1 by construction (see the rescale step below) — the
ridge fit's raw intercept is meaningless on its own, so it's folded entirely
into the "set" factors instead, which is where the same information reads
most naturally: every card starts at EUR1, its set tells you the ballpark.

WHAT THIS MODEL IS TUNED FOR
----------------------------
Everything below is chosen to minimize MEDIAN ABSOLUTE PERCENTAGE ERROR against
`trend`, on cards from the 24 sets the site actually displays. That is a
deliberate change from an earlier version tuned on log-space R² against
`avg30`, which flattered itself badly:

  - R² in log space stayed ~0.93 while whole rarity tiers were off by 2x,
    because that error is small on a log scale next to the EUR0.02-to-EUR400
    spread it is measured over.
  - Fitting `avg30` while the site shows and judges by `trend` meant the model
    was accurate at predicting a number no visitor ever sees.
  - Even median APE over ALL cards is misleading: 53% of cards trade under
    EUR0.10, where Cardmarket's EUR0.01 quantization alone dominates the error.
    Accuracy is therefore tracked per price band, not as one number.

analysis/tune_model.py is the bake-off harness these choices came out of; rerun
it after any data refresh to check they still hold.

THE FACTORS
-----------
"cardName" is the Trainer/Energy analogue of "pokemon": Pokémon cards get "n/a"
here (their identity is already fully captured by "pokemon"), while
Trainer/Energy cards — which otherwise all share "pokemon" = "none" and so were
indistinguishable from each other — get their own factor per exact printed name
(e.g. "Iono" vs a generic Item). Most Trainer/Energy names are one-off reprints
with too little data to say anything, but ridge shrinkage pulls low-n levels to
neutral automatically.

Pokémon premium varies by tier. A Pokémon's popularity is NOT a constant
multiplier: fitted on the data, the premium is ~2x stronger on chase cards than
on bulk ones (exact numbers printed at the end of a run and shipped as
`pokemonTierExponent`). A single global factor averages the two, which
systematically overpriced Illustration Rares of unloved Pokémon and underpriced
chase Special Illustration Rares — the exact complaint that prompted this
rewrite. Expressed as a varying coefficient (two extra parameters, one per
non-bulk tier) rather than a pokemon x tier interaction: the full interaction
was tested and lost, being far too sparse at 1026 Pokémon x 3 tiers.

Interaction terms, each layered ON TOP of its plain factor rather than
replacing it:

  - rarity x era / card type x era: a rarity tier or card mechanic means
    something very different depending on when the card was printed. Median
    Rare/Common price ratio is 32.6x for WOTC-era cards vs. 2.3x for SV+ cards;
    old "EX" cards have a median price of EUR64.62 vs. EUR1.88 for new "ex".
  - rarity x set / card type x set: the same drift happens WITHIN the SV+ era
    bucket, which spans 2023-2026 and is far too coarse for it. Measured before
    these terms existed: Illustration Rare fair prices ran 1.4-2.1x high on
    2025-26 sets while Special Illustration Rares ran 0.53-0.92x low, with older
    SV sets showing the reverse. Neither the Set factor (it moves a whole set
    together, it cannot change the ratio *between* rarities inside it) nor the
    era terms can express that.

`raritySet` additionally gets HALF the shrinkage of everything else
(RARITY_SET_SCALE below): it encodes a real, sharply-varying effect measured on
10-70 cards per level, and pulling it toward neutral as hard as the sparse
one-off categories left the bias it exists to remove. Implemented by scaling
those columns, which is an exact reparameterization — scaling a block by c
divides its effective ridge penalty by c².

Era buckets: WOTC (pre-2003), EX/DP (2003-2010), BW/XY (2011-2016), SM/SWSH
(2017-2022), SV+ (2023+) — see scripts/lib/cardMapping.mjs::eraBucket.
Price tiers: bulk / mid / chase — see cardMapping.mjs::rarityTier. Both have a
JS mirror used at ingest/display time; keep them in sync.

DISPLAYED VS. TRAINING-ONLY SETS
--------------------------------
The site shows only the Scarlet & Violet + Mega Evolution sets
(src/data/generated/sets.json), but this fits on every English card TCGdex has
(~170 sets back to 1999). The older sets are there purely to give categories
like "pokemon" or "illustrator" enough data to fit a confident factor — a card
appearing in 2 displayed-set rows but 40 historical ones would otherwise get a
near-meaningless estimate. They are down-weighted to TRAINING_ONLY_WEIGHT (swept:
dropping them entirely scores worse, and so does counting them fully), and both
alpha selection and every reported number are computed ONLY on displayed-set
cards.

DATA CAVEATS
------------
A small number of cards have a Cardmarket price mapped to the wrong (but
otherwise unremarkable-looking) product on TCGdex's end — confirmed by hand for
one report (a Chaos Rising Delphox showing ~EUR1.89 instead of its real ~EUR0.07).
Because the wrong number still looks like an ordinary price for its rarity tier,
this class of error isn't statistically detectable and isn't filtered here.
build-training-data.mjs does drop the one sub-case that *is* detectable: cards
whose Cardmarket product ID is literally shared with a different Pokémon.

Reads:  scripts/training-data.json   (~19,000 English cards with a real price)
        src/data/generated/sets.json (which sets are actually displayed)
Writes: analysis/factors.json        (every factor + sample size + 95% CI)
        analysis/model_report.json   (fit quality, per price band)

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

CATEGORIES = [
    "pokemon", "rarity", "illustrator", "set", "cardType", "cardName",
    "rarityEra", "cardTypeEra", "raritySet", "cardTypeSet",
]
N_BOOTSTRAP = 60
RNG_SEED = 42
N_FOLDS = 5

DISPLAYED_SET_WEIGHT = 1.0
TRAINING_ONLY_WEIGHT = 0.2
# Column scale for raritySet -> a quarter of the effective ridge penalty. See
# the docstring; swept in analysis/tune_model.py.
RARITY_SET_SCALE = 2.0
TIERS = ["bulk", "mid", "chase"]
VARYING_TIERS = ["mid", "chase"]  # bulk is the reference (exponent fixed at 1)

PRICE_BANDS = [(0, 0.30), (0.30, 3), (3, 30), (30, float("inf"))]


def era_bucket(release_date):
    """Mirrors scripts/lib/cardMapping.mjs::eraBucket — keep both in sync."""
    if not release_date:
        return "Unknown"
    try:
        year = int(str(release_date)[:4])
    except ValueError:
        return "Unknown"
    if year < 2003:
        return "WOTC"
    if year < 2011:
        return "EX/DP"
    if year < 2017:
        return "BW/XY"
    if year < 2023:
        return "SM/SWSH"
    return "SV+"


CHASE_RARITIES = {"illustration rare", "special illustration rare", "hyper rare", "shiny rare"}
MID_RARITIES = {"double rare", "ultra rare", "promo", "ace spec rare"}


def rarity_tier(rarity):
    """Mirrors scripts/lib/cardMapping.mjs::rarityTier — keep both in sync."""
    key = (rarity or "").lower()
    if key in CHASE_RARITIES:
        return "chase"
    if key in MID_RARITIES:
        return "mid"
    return "bulk"


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
df["era"] = df["releaseDate"].apply(era_bucket)
df["tier"] = df["rarity"].apply(rarity_tier)
df["rarityEra"] = df["rarity"] + " | " + df["era"]
df["cardTypeEra"] = df["cardType"] + " | " + df["era"]
df["raritySet"] = df["rarity"] + " | " + df["set"]
df["cardTypeSet"] = df["cardType"] + " | " + df["set"]
df["logPrice"] = np.log(df["trend"].astype(float))

for c in CATEGORIES:
    print(f"  {c}: {df[c].nunique()} distinct values")

# ---------------------------------------------------- build the design matrix

# Full one-hot per category (every level, no dropped reference) — with an
# unpenalized intercept, ridge naturally pushes the shared grand-mean level
# into the intercept and leaves each category's (penalized) coefficients as
# genuine deviations from that baseline.
print("\nBuilding one-hot design matrix …")
category_values: dict[str, list[str]] = {}
blocks = []
col_category = []
col_level = []

for c in CATEGORIES:
    dummies = pd.get_dummies(df[c], prefix="", prefix_sep="", sparse=True)
    levels = list(dummies.columns)
    category_values[c] = levels
    blocks.append(sparse.csr_matrix(dummies.sparse.to_coo()))
    col_category.extend([c] * len(levels))
    col_level.extend(levels)

X_raw = sparse.hstack(blocks, format="csr")
col_category = np.array(col_category)

# Per-category shrinkage via column scaling (exact reparameterization: the
# fitted coefficient comes back divided by the same scale, see unscale below).
col_scale = np.ones(X_raw.shape[1])
col_scale[col_category == "raritySet"] = RARITY_SET_SCALE
X = (X_raw @ sparse.diags(col_scale)).tocsr()

y = df["logPrice"].to_numpy()
trend = df["trend"].to_numpy().astype(float)
displayed = df["displayed"].to_numpy()
tier = df["tier"].to_numpy()
n_samples, n_features = X.shape
print(f"  X: {n_samples} rows x {n_features} columns (sparse)")

pokemon_mask = col_category == "pokemon"


def tier_columns(pokemon_contrib):
    """The varying-coefficient block: each row's fitted Pokémon log-contribution,
    switched on only for its tier, so the fit can rescale that premium per tier."""
    return sparse.csr_matrix(
        np.column_stack([pokemon_contrib * (tier == t) for t in VARYING_TIERS])
    )


def fit_two_stage(train_idx, alpha):
    """Stage 1 fits the plain model; stage 2 adds the tier-varying Pokémon term
    (which needs stage 1's Pokémon coefficients to exist at all)."""
    m1 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
    m1.fit(X[train_idx], y[train_idx], sample_weight=sample_weight[train_idx])
    contrib = np.asarray(X[:, pokemon_mask] @ m1.coef_[pokemon_mask]).ravel()
    X2 = sparse.hstack([X, tier_columns(contrib)], format="csr")
    m2 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
    m2.fit(X2[train_idx], y[train_idx], sample_weight=sample_weight[train_idx])
    return m2, X2


# ------------------------------------------------------- pick regularization

print(f"\nSelecting alpha by median APE vs trend on displayed sets ({N_FOLDS}-fold CV) …")
disp_idx = np.flatnonzero(displayed)
other_idx = np.flatnonzero(~displayed)
kf = KFold(n_splits=N_FOLDS, shuffle=True, random_state=RNG_SEED)
folds = list(kf.split(disp_idx))


def cv_ape(alpha):
    """Out-of-fold absolute percentage error for every displayed card."""
    apes = np.empty(len(disp_idx))
    for train_part, test_part in folds:
        train_idx = np.concatenate([other_idx, disp_idx[train_part]])
        model, X2 = fit_two_stage(train_idx, alpha)
        test_idx = disp_idx[test_part]
        pred = np.exp(model.predict(X2[test_idx]))
        apes[test_part] = np.abs(pred - trend[test_idx]) / trend[test_idx]
    return apes


cv_scores = {}
for alpha in [0.32, 1.0, 1.78, 3.16, 5.62, 10.0, 17.78]:
    apes = cv_ape(alpha)
    cv_scores[alpha] = float(np.median(apes))
    print(f"  alpha={alpha:6.2f}  median APE={cv_scores[alpha]*100:5.1f}%  within 20%={np.mean(apes <= 0.2)*100:4.1f}%")

best_alpha = min(cv_scores, key=cv_scores.get)
print(f"Best alpha: {best_alpha:.2f} (median APE={cv_scores[best_alpha]*100:.1f}%)")

# ------------------------------------------------------------- honest scoring

# Same CV predictions at the chosen alpha — every displayed card scored by a
# model that never saw it. Reported per price band because one median over a
# four-orders-of-magnitude range hides exactly the errors that matter.
apes = cv_ape(best_alpha)
band_stats = {}
for lo, hi in PRICE_BANDS:
    sel = (trend[disp_idx] >= lo) & (trend[disp_idx] < hi)
    if sel.sum() < 10:
        continue
    label = f"{lo:g}-{hi:g}" if np.isfinite(hi) else f"{lo:g}+"
    band_stats[label] = {
        "n": int(sel.sum()),
        "medianAPE": float(np.median(apes[sel])),
        "within20": float(np.mean(apes[sel] <= 0.2)),
    }

displayed_median_ape = float(np.median(apes))
displayed_within20 = float(np.mean(apes <= 0.2))
print(f"\nOut-of-fold on {len(disp_idx)} displayed cards: median APE={displayed_median_ape*100:.1f}%  within 20%={displayed_within20*100:.0f}%")
for label, s in band_stats.items():
    print(f"  EUR{label:<8} n={s['n']:>5}  median APE={s['medianAPE']*100:5.1f}%  within 20%={s['within20']*100:3.0f}%")

# Log-space R² on the same held-out predictions, kept only for continuity with
# the older reports — see the docstring for why it is not the headline.
oof_pred_log = np.empty(len(disp_idx))
for train_part, test_part in folds:
    train_idx = np.concatenate([other_idx, disp_idx[train_part]])
    model, X2 = fit_two_stage(train_idx, best_alpha)
    oof_pred_log[test_part] = model.predict(X2[disp_idx[test_part]])
sse = np.sum((y[disp_idx] - oof_pred_log) ** 2)
sst = np.sum((y[disp_idx] - y[disp_idx].mean()) ** 2)
displayed_r2 = float(1 - sse / sst)
print(f"  (log-space R² on the same predictions: {displayed_r2:.4f})")

# --------------------------------------------------------------- final fit

print("\nFitting final model on all data …")
full_model, X2_full = fit_two_stage(np.arange(n_samples), best_alpha)
point_coefs = full_model.coef_[:n_features].copy()
tier_coefs = full_model.coef_[n_features:].copy()
intercept = float(full_model.intercept_)
# Undo the column scaling so the stored factors refer to the original one-hots.
point_coefs *= col_scale

pokemon_tier_exponent = {"bulk": 1.0}
for t, c in zip(VARYING_TIERS, tier_coefs):
    pokemon_tier_exponent[t] = float(1.0 + c)
print(
    "  Pokémon premium by tier (exponent on the Pokémon factor): "
    + ", ".join(f"{t}={pokemon_tier_exponent[t]:.2f}x" for t in TIERS)
)

# ------------------------------------------------------------------ bootstrap

print(f"\nBootstrapping ({N_BOOTSTRAP} resamples) for confidence intervals …")
t0 = time.time()
boot_coefs = np.zeros((N_BOOTSTRAP, n_features))
boot_rng = np.random.default_rng(RNG_SEED + 1)
for b in range(N_BOOTSTRAP):
    sample_idx = boot_rng.integers(0, n_samples, n_samples)
    m = Ridge(alpha=best_alpha, fit_intercept=True, solver="sparse_cg")
    m.fit(X[sample_idx], y[sample_idx], sample_weight=sample_weight[sample_idx])
    boot_coefs[b] = m.coef_ * col_scale
    if (b + 1) % 20 == 0:
        print(f"  … {b + 1}/{N_BOOTSTRAP}  ({time.time() - t0:.0f}s elapsed)")

boot_std = boot_coefs.std(axis=0)
boot_lo = np.percentile(boot_coefs, 2.5, axis=0)
boot_hi = np.percentile(boot_coefs, 97.5, axis=0)
print(f"Bootstrap done in {time.time() - t0:.0f}s.")

# ------------------------------------------------------------------- outputs

sample_counts = {c: df[c].value_counts().to_dict() for c in CATEGORIES}

# Rescale the anchor to EUR1: pure reparameterization of
# price = anchor x f_pokemon x ... x f_set x ..., shifting a constant between
# the (otherwise meaningless) intercept and the "set" coefficients. Folded into
# "set" specifically because every card has exactly one home set, so "every card
# starts at EUR1, its set tells you the ballpark" reads better than an arbitrary
# EUR5.26 with no real-world meaning.
set_mask = col_category == "set"
point_coefs[set_mask] += intercept
boot_lo[set_mask] += intercept
boot_hi[set_mask] += intercept
print(f"\nRescaled: anchor EUR{np.exp(intercept):.2f} -> EUR1.00, folded into the 'set' factors.")
intercept = 0.0

factors: dict[str, dict] = {c: {} for c in CATEGORIES}
for i, (cat, level) in enumerate(zip(col_category, col_level)):
    n = int(sample_counts[cat].get(level, 0))
    factors[cat][level] = {
        "factor": round(float(np.exp(point_coefs[i])), 4),
        "n": n,
        "ciLow": round(float(np.exp(boot_lo[i])), 4),
        "ciHigh": round(float(np.exp(boot_hi[i])), 4),
        "relativeUncertainty": round(float(boot_std[i]), 4),
    }

FACTORS_OUT.write_text(
    json.dumps(
        {
            "trainedAt": pd.Timestamp.utcnow().isoformat(),
            "target": "trend",
            "anchor": round(float(np.exp(intercept)), 4),
            "alpha": best_alpha,
            "nRows": int(n_samples),
            "nBootstrap": N_BOOTSTRAP,
            "pokemonTierExponent": {t: round(pokemon_tier_exponent[t], 4) for t in TIERS},
            "factors": factors,
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
            "raritySetScale": RARITY_SET_SCALE,
            "alpha": best_alpha,
            "cvMedianAPEByAlpha": cv_scores,
            "pokemonTierExponent": {t: round(pokemon_tier_exponent[t], 4) for t in TIERS},
            # Headline: out-of-fold, against the price the site displays,
            # on the cards the site displays.
            "displayedMedianAPE": displayed_median_ape,
            "displayedWithin20": displayed_within20,
            "displayedTestR2": displayed_r2,
            "byPriceBand": band_stats,
            "categoryCardinality": {c: int(df[c].nunique()) for c in CATEGORIES},
        },
        indent=1,
    ),
    encoding="utf-8",
)
print(f"Wrote {REPORT_OUT}")
