"""
Fits the PokéValue pricing model: a log-linear (== multiplicative in price
space) ridge regression that explains Cardmarket price purely from card
identity — Pokémon, rarity, illustrator, set, card mechanic type, (for
Trainer/Energy cards specifically) the card's own name, and two deliberate
interaction terms (rarity x era, card type x era) — exactly matching:

    price = anchor x factor(pokemon) x factor(rarity) x factor(illustrator)
            x factor(set) x factor(card type) x factor(card name)
            x factor(rarity x era) x factor(card type x era)

`anchor` is fixed at EUR1 by construction (see the rescale step below) — the
ridge fit's raw intercept is meaningless on its own, so it's folded entirely
into the "set" factors instead, which is where the same information reads
most naturally: every card starts at EUR1, its set tells you the ballpark.

"cardName" is the Trainer/Energy analogue of "pokemon": Pokémon cards get
"n/a" here (their identity is already fully captured by "pokemon"), while
Trainer/Energy cards — which otherwise all share "pokemon" = "none" and so
were indistinguishable from each other — get their own factor per exact
printed name (e.g. "Iono" vs a generic Item). Most Trainer/Energy names are
one-off reprints with too little data to say anything (median: 1 card), but
ridge shrinkage handles that the same way it handles rare Pokémon/
illustrators: low-n levels get pulled to neutral automatically, so this only
meaningfully affects the ~20% of names with real reprint history.

"rarityEra" ("Rarity (era)" in the UI) is the one deliberate interaction
term, layered ON TOP of the plain "rarity" factor rather than replacing it —
a rarity tier means something very different depending on when the card was
printed (the game has stacked tier after tier above "Rare" over 25 years:
Double Rare, Ultra Rare, Illustration Rare, ...), and a single global rarity
factor can't represent that, nor can the Set factor (it only moves a whole
set up/down, it can't change the ratio *between* rarities within it).
Checked by hand: median Rare/Common price ratio is 32.6x for WOTC-era cards
vs. 2.3x for SV+ cards, while the model's single global rarity factor sits
at 5.4x — systematically too high for modern Rares, too low for vintage
ones.

"cardTypeEra" is the same fix applied to "cardType": TCGdex's `suffix`
casing for "ex"/"EX" doesn't reliably separate the old (2003-2010) EX era
from the modern (2023+) ex era (see cardMapping.mjs::mapCardType), so both
get normalized into one "EX" bucket — but they're priced very differently
(median EUR64.62 for old "EX" cards vs. EUR1.88 for new "ex" cards, checked
by hand), the same kind of gap rarity had. Layered on top of "cardType" the
same way "rarityEra" is layered on top of "rarity".

Era buckets (shared by both interaction terms): WOTC (pre-2003), EX/DP
(2003-2010), BW/XY (2011-2016), SM/SWSH (2017-2022), SV+ (2023+) — see
scripts/lib/cardMapping.mjs::eraBucket for the JS mirror used at
ingest/display time.

Every level of every category gets its own factor, shrunk toward 1x (neutral)
by L2 regularization in proportion to how little data supports it — a
Pokémon with 300 cards gets a confident factor, one with 2 cards gets pulled
close to the average and flagged as low-confidence in the report.

Known data-quality caveat: a small number of cards have a Cardmarket price
mapped to the wrong (but otherwise unremarkable-looking) product on TCGdex's
end — confirmed by hand for one report (a Chaos Rising Delphox showing
~EUR1.89 instead of its real ~EUR0.07). Because the wrong number still looks
like an ordinary price for its rarity tier, this class of error isn't
statistically detectable and isn't filtered here. build-training-data.mjs
does drop the one sub-case that *is* detectable: cards whose Cardmarket
product ID is literally shared with a different Pokémon.

Regression target: `avg30`, except for cards younger than `avg30`'s own
30-day window, where `trend` is used instead. The site displays and computes
its over-/undervalued verdict from `card.market.trend` everywhere (see
scripts/ingest.mjs, src/pages/SetPage.tsx, src/pages/CardPage.tsx), so in
principle training should match that. In practice the two only disagree in two
situations, and only one of them is a reason to prefer `trend`:

  - A set fresh off release: `avg30` is a rolling 30-day average, so for a
    set 8 days old it's mostly averaging those same 8 (hype-inflated,
    settling) days — it hasn't had 30 real days to exist yet, and lags what
    `trend` already shows. Checked: median avg30/trend ratio is 0.95-1.02
    across every set older than ~30 days, but was 1.67 for Pitch Black at 8
    days old — alone enough to make most of that set's cards look wildly
    undervalued against a stale reference.
  - Cheap bulk cards generally: `trend` reacts fast to individual recent
    listings, which is exactly what makes it *unreliable* at the low end — a
    single lowball listing on an otherwise ~EUR0.15 card can drag `trend` to
    EUR0.02 (checked by hand across several sets, old and new alike).
    `avg30`'s smoothing is a feature there, not a lag.

So: `trend` only substitutes for `avg30` when the card's set is younger than
the 30-day window `avg30` needs to mean anything; everywhere else `avg30`
stays the more reliable target. Both fields have identical coverage
(19,436/19,440 cached cards have either both or neither), so this loses no
training data either way.

Displayed vs. training-only sets: the site currently shows only the Scarlet &
Violet + Mega Evolution sets (src/data/generated/sets.json), but this script
trains on every English card TCGdex has (~170 sets back to 1999) — the older
sets exist purely to give categories like "pokemon" or "illustrator" enough
data to fit a confident factor; a card that's only ever appeared in 2 displayed
-set rows but 40 historical ones would otherwise get a near-meaningless
estimate. Two things follow from that split:

  1. DISPLAYED_SET_WEIGHT down-weights (not drops) training-only rows in the
     loss the ridge regression actually minimizes, so a tension between "fit
     the vast historical corpus" and "fit the 24 sets someone can actually
     look up on the site" resolves in the site's favor, while non-displayed
     rows still stabilize sparse categories. The weight is a judgment call,
     not a derived optimum — 0.4 means a training-only row counts for 40% of
     a displayed-set row; tune it if displayedTestR2 below moves the wrong way.
  2. Model selection (alpha) and the headline accuracy number are evaluated
     ONLY on displayed-set rows in the held-out test split (see
     `displayedTestR2`/`displayedTestMedianAPE` in model_report.json) — CV'd
     or reported against the full mixed corpus, alpha would be tuned mostly
     for 1999-2022 cards (76% of rows) with different price-noise
     characteristics (see the condition/grading discussion in README), not for
     what's actually on the site.

Reads:  scripts/training-data.json  (~19,400 English cards, real Cardmarket price)
        src/data/generated/sets.json (which sets are actually displayed)
Writes: analysis/factors.json       (every factor + sample size + 95% CI)
        analysis/model_report.json  (overall fit quality, for the PDF)

Usage: python analysis/fit_factors.py
"""

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.model_selection import KFold

HERE = Path(__file__).resolve().parent
TRAINING_DATA = HERE.parent / "scripts" / "training-data.json"
DISPLAYED_SETS = HERE.parent / "src" / "data" / "generated" / "sets.json"
FACTORS_OUT = HERE / "factors.json"
REPORT_OUT = HERE / "model_report.json"

CATEGORIES = ["pokemon", "rarity", "illustrator", "set", "cardType", "cardName", "rarityEra", "cardTypeEra"]
N_BOOTSTRAP = 60
RNG_SEED = 42
# See the module docstring's "Displayed vs. training-only sets" section.
DISPLAYED_SET_WEIGHT = 1.0
TRAINING_ONLY_WEIGHT = 0.4


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


# ---------------------------------------------------------------- load data

print("Loading training data …")
raw = json.loads(TRAINING_DATA.read_text(encoding="utf-8"))
df = pd.DataFrame(raw)
print(f"  {len(df)} priced cards")

displayed_set_ids = {s["id"] for s in json.loads(DISPLAYED_SETS.read_text(encoding="utf-8"))}
df["displayed"] = df["setId"].isin(displayed_set_ids)
sample_weight = np.where(df["displayed"], DISPLAYED_SET_WEIGHT, TRAINING_ONLY_WEIGHT)
print(
    f"  {df['displayed'].sum()} rows in displayed sets (weight {DISPLAYED_SET_WEIGHT}), "
    f"{(~df['displayed']).sum()} training-only (weight {TRAINING_ONLY_WEIGHT})"
)

df["pokemon"] = df["dexIds"].apply(lambda ids: str(ids[0]) if ids else "none")
df["rarity"] = df["rarity"].fillna("None")
df["illustrator"] = df["illustrator"].fillna("Unknown")
df["set"] = df["setId"].fillna("unknown")
df["cardType"] = df["cardType"].fillna("Standard")
df["cardName"] = df.apply(lambda row: "n/a" if row["dexIds"] else row["name"], axis=1)
df["rarityEra"] = df["rarity"] + " | " + df["releaseDate"].apply(era_bucket)
df["cardTypeEra"] = df["cardType"] + " | " + df["releaseDate"].apply(era_bucket)
# See "Regression target" in the module docstring: avg30 is unreliable for a
# set that hasn't existed for 30 days yet, so those rows use trend instead.
AVG30_WINDOW_DAYS = 30
release_dt = pd.to_datetime(df["releaseDate"], errors="coerce", utc=True)
age_days = (pd.Timestamp.now(tz="UTC") - release_dt).dt.days
too_young = age_days.notna() & (age_days < AVG30_WINDOW_DAYS)
df["price"] = np.where(too_young, df["trend"], df["avg30"]).astype(float)
df["logPrice"] = np.log(df["price"])
print(f"  {int(too_young.sum())} rows younger than {AVG30_WINDOW_DAYS} days: trained on trend, not avg30")

for c in CATEGORIES:
    print(f"  {c}: {df[c].nunique()} distinct values")

# ---------------------------------------------------- build the design matrix

# Full one-hot per category (every level, no dropped reference) — with an
# unpenalized intercept, ridge naturally pushes the shared grand-mean level
# into the intercept and leaves each category's (penalized) coefficients as
# genuine deviations from that baseline. See module docstring for the model.
print("\nBuilding one-hot design matrix …")
category_values: dict[str, list[str]] = {}
blocks = []
col_category = []  # which category each design-matrix column belongs to
col_level = []  # which level within that category

for c in CATEGORIES:
    dummies = pd.get_dummies(df[c], prefix="", prefix_sep="", sparse=True)
    levels = list(dummies.columns)
    category_values[c] = levels
    blocks.append(sparse.csr_matrix(dummies.sparse.to_coo()))
    col_category.extend([c] * len(levels))
    col_level.extend(levels)

X = sparse.hstack(blocks, format="csr")
y = df["logPrice"].to_numpy()
n_samples, n_features = X.shape
print(f"  X: {n_samples} rows x {n_features} columns (sparse)")

# ------------------------------------------------------- pick regularization

print("\nSelecting ridge alpha via 5-fold cross-validation (scored on displayed-set rows only) …")
alphas = np.logspace(-2, 3, 21)  # 0.01 .. 1000
kf = KFold(n_splits=5, shuffle=True, random_state=RNG_SEED)
displayed_arr = df["displayed"].to_numpy()
cv_scores = {}
for alpha in alphas:
    fold_scores = []
    for train_idx, test_idx in kf.split(X):
        model = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        model.fit(X[train_idx], y[train_idx], sample_weight=sample_weight[train_idx])
        # Fit on everything (training-only rows still down-weighted, not
        # dropped — they're what stabilizes sparse categories), but SCORE only
        # on displayed-set rows: alpha should be picked for what it's actually
        # good at predicting, not for the 76%-vintage mixed corpus.
        eval_idx = test_idx[displayed_arr[test_idx]]
        if len(eval_idx) == 0:
            continue
        pred = model.predict(X[eval_idx])
        sse = np.sum((y[eval_idx] - pred) ** 2)
        sst = np.sum((y[eval_idx] - y[eval_idx].mean()) ** 2)
        fold_scores.append(1 - sse / sst)
    cv_scores[alpha] = float(np.mean(fold_scores))
    print(f"  alpha={alpha:8.2f}  mean CV R² (displayed sets)={cv_scores[alpha]:.4f}")

best_alpha = max(cv_scores, key=cv_scores.get)
print(f"Best alpha: {best_alpha:.2f} (CV R²={cv_scores[best_alpha]:.4f})")

# ------------------------------------------------------------- final fit + eval

# Held-out test set for an honest, non-cross-validated headline number.
rng = np.random.default_rng(RNG_SEED)
order = rng.permutation(n_samples)
split = int(n_samples * 0.85)
train_idx, test_idx = order[:split], order[split:]

final_model = Ridge(alpha=best_alpha, fit_intercept=True, solver="sparse_cg")
final_model.fit(X[train_idx], y[train_idx], sample_weight=sample_weight[train_idx])

pred_test = final_model.predict(X[test_idx])
actual_test = np.exp(y[test_idx])
pred_test_price = np.exp(pred_test)
ape = np.abs(pred_test_price - actual_test) / actual_test
sse = np.sum((y[test_idx] - pred_test) ** 2)
sst = np.sum((y[test_idx] - y[test_idx].mean()) ** 2)
test_r2 = 1 - sse / sst
test_median_ape = float(np.median(ape))
test_mean_ape = float(np.mean(ape))
print(f"\nHeld-out test, full mixed corpus (n={len(test_idx)}): R²={test_r2:.4f}  medianAPE={test_median_ape*100:.1f}%  meanAPE={test_mean_ape*100:.1f}%")

# The number that actually matters: same held-out split, filtered to rows from
# sets someone can actually look up on the site. This — not the number above —
# is what ships to model_report.json as the headline and what /how-it-works
# shows, since the full-corpus number is 76%-dominated by 1999-2022 cards.
disp_test_idx = test_idx[displayed_arr[test_idx]]
pred_disp = final_model.predict(X[disp_test_idx])
actual_disp = np.exp(y[disp_test_idx])
pred_disp_price = np.exp(pred_disp)
ape_disp = np.abs(pred_disp_price - actual_disp) / actual_disp
sse_disp = np.sum((y[disp_test_idx] - pred_disp) ** 2)
sst_disp = np.sum((y[disp_test_idx] - y[disp_test_idx].mean()) ** 2)
displayed_test_r2 = 1 - sse_disp / sst_disp
displayed_test_median_ape = float(np.median(ape_disp))
displayed_test_mean_ape = float(np.mean(ape_disp))
print(
    f"Held-out test, displayed sets only (n={len(disp_test_idx)}): "
    f"R²={displayed_test_r2:.4f}  medianAPE={displayed_test_median_ape*100:.1f}%  meanAPE={displayed_test_mean_ape*100:.1f}%"
)

# Now refit on ALL data at the chosen alpha for the coefficients we actually ship —
# more data in, more reliable factors out.
print("\nFitting final model on all data …")
full_model = Ridge(alpha=best_alpha, fit_intercept=True, solver="sparse_cg")
full_model.fit(X, y, sample_weight=sample_weight)
point_coefs = full_model.coef_
intercept = float(full_model.intercept_)

# ------------------------------------------------------------------ bootstrap

print(f"\nBootstrapping ({N_BOOTSTRAP} resamples) for confidence intervals …")
t0 = time.time()
boot_coefs = np.zeros((N_BOOTSTRAP, n_features))
boot_rng = np.random.default_rng(RNG_SEED + 1)
for b in range(N_BOOTSTRAP):
    sample_idx = boot_rng.integers(0, n_samples, n_samples)
    m = Ridge(alpha=best_alpha, fit_intercept=True, solver="sparse_cg")
    m.fit(X[sample_idx], y[sample_idx], sample_weight=sample_weight[sample_idx])
    boot_coefs[b] = m.coef_
    if (b + 1) % 10 == 0:
        print(f"  … {b + 1}/{N_BOOTSTRAP}  ({time.time() - t0:.0f}s elapsed)")

boot_std = boot_coefs.std(axis=0)
boot_lo = np.percentile(boot_coefs, 2.5, axis=0)
boot_hi = np.percentile(boot_coefs, 97.5, axis=0)
print(f"Bootstrap done in {time.time() - t0:.0f}s.")

# ------------------------------------------------------------------- outputs

sample_counts = {c: df[c].value_counts().to_dict() for c in CATEGORIES}

# -------------------------------------------------- rescale anchor to EUR1
# Pure reparameterization of price = anchor x f_pokemon x ... x f_set x ...:
# shifting a constant between the (otherwise meaningless) intercept and one
# category's coefficients changes no predicted price, only which number
# "carries" the baseline. Folded into "set" specifically — every card has
# exactly one home set, so "every card starts at EUR1, its set tells you the
# ballpark" reads better than an arbitrary EUR11.68 with no real-world
# meaning. (boot_std / relativeUncertainty is untouched: adding a constant to
# every bootstrap draw for a column doesn't change that column's std dev.)
set_mask = np.array([cat == "set" for cat in col_category])
point_coefs[set_mask] += intercept
boot_lo[set_mask] += intercept
boot_hi[set_mask] += intercept
print(f"\nRescaled: anchor EUR{np.exp(intercept):.2f} -> EUR1.00, folded into the 'set' factors.")
intercept = 0.0

factors: dict[str, dict] = {c: {} for c in CATEGORIES}
for i, (cat, level) in enumerate(zip(col_category, col_level)):
    n = int(sample_counts[cat].get(level, 0))
    coef = float(point_coefs[i])
    factors[cat][level] = {
        "factor": round(float(np.exp(coef)), 4),
        "n": n,
        "ciLow": round(float(np.exp(boot_lo[i])), 4),
        "ciHigh": round(float(np.exp(boot_hi[i])), 4),
        "relativeUncertainty": round(float(boot_std[i]), 4),  # std of the log-coefficient
    }

FACTORS_OUT.write_text(
    json.dumps(
        {
            "trainedAt": pd.Timestamp.utcnow().isoformat(),
            "anchor": round(float(np.exp(intercept)), 4),
            "alpha": best_alpha,
            "nRows": int(n_samples),
            "nBootstrap": N_BOOTSTRAP,
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
            "nRows": int(n_samples),
            "nDisplayedRows": int(df["displayed"].sum()),
            "nTrain": int(len(train_idx)),
            "nTest": int(len(test_idx)),
            "displayedSetWeight": DISPLAYED_SET_WEIGHT,
            "trainingOnlyWeight": TRAINING_ONLY_WEIGHT,
            "alpha": best_alpha,
            "cvR2ByAlpha": cv_scores,
            # Full-mixed-corpus numbers, kept for comparison/debugging — NOT
            # what the site should show as the headline (see displayedTest*).
            "testR2": float(test_r2),
            "testMedianAPE": test_median_ape,
            "testMeanAPE": test_mean_ape,
            # The honest headline: held-out accuracy on cards someone can
            # actually look up on the site right now.
            "displayedTestR2": float(displayed_test_r2),
            "displayedTestMedianAPE": displayed_test_median_ape,
            "displayedTestMeanAPE": displayed_test_mean_ape,
            "categoryCardinality": {c: int(df[c].nunique()) for c in CATEGORIES},
        },
        indent=1,
    ),
    encoding="utf-8",
)
print(f"Wrote {REPORT_OUT}")
