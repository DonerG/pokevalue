"""
Fits the PokéValue pricing model: a log-linear (== multiplicative in price
space) ridge regression that explains Cardmarket price purely from card
identity — Pokémon, rarity, illustrator, set, and card mechanic type — with
NO interaction terms, exactly matching:

    price = anchor x factor(pokemon) x factor(rarity) x factor(illustrator)
            x factor(set) x factor(card type)

`anchor` is fixed at EUR1 by construction (see the rescale step below) — the
ridge fit's raw intercept is meaningless on its own, so it's folded entirely
into the "set" factors instead, which is where the same information reads
most naturally: every card starts at EUR1, its set tells you the ballpark.

Every level of every category gets its own factor, shrunk toward 1x (neutral)
by L2 regularization in proportion to how little data supports it — a
Pokémon with 300 cards gets a confident factor, one with 2 cards gets pulled
close to the average and flagged as low-confidence in the report.

Reads:  scripts/training-data.json  (~19,400 English cards, real Cardmarket price)
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
FACTORS_OUT = HERE / "factors.json"
REPORT_OUT = HERE / "model_report.json"

CATEGORIES = ["pokemon", "rarity", "illustrator", "set", "cardType"]
N_BOOTSTRAP = 60
RNG_SEED = 42

# ---------------------------------------------------------------- load data

print("Loading training data …")
raw = json.loads(TRAINING_DATA.read_text(encoding="utf-8"))
df = pd.DataFrame(raw)
print(f"  {len(df)} priced cards")

df["pokemon"] = df["dexIds"].apply(lambda ids: str(ids[0]) if ids else "none")
df["rarity"] = df["rarity"].fillna("None")
df["illustrator"] = df["illustrator"].fillna("Unknown")
df["set"] = df["setId"].fillna("unknown")
df["cardType"] = df["cardType"].fillna("Standard")
df["logPrice"] = np.log(df["avg30"].astype(float))

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

print("\nSelecting ridge alpha via 5-fold cross-validation …")
alphas = np.logspace(-2, 3, 21)  # 0.01 .. 1000
kf = KFold(n_splits=5, shuffle=True, random_state=RNG_SEED)
cv_scores = {}
for alpha in alphas:
    fold_scores = []
    for train_idx, test_idx in kf.split(X):
        model = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        model.fit(X[train_idx], y[train_idx])
        pred = model.predict(X[test_idx])
        sse = np.sum((y[test_idx] - pred) ** 2)
        sst = np.sum((y[test_idx] - y[test_idx].mean()) ** 2)
        fold_scores.append(1 - sse / sst)
    cv_scores[alpha] = float(np.mean(fold_scores))
    print(f"  alpha={alpha:8.2f}  mean CV R²={cv_scores[alpha]:.4f}")

best_alpha = max(cv_scores, key=cv_scores.get)
print(f"Best alpha: {best_alpha:.2f} (CV R²={cv_scores[best_alpha]:.4f})")

# ------------------------------------------------------------- final fit + eval

# Held-out test set for an honest, non-cross-validated headline number.
rng = np.random.default_rng(RNG_SEED)
order = rng.permutation(n_samples)
split = int(n_samples * 0.85)
train_idx, test_idx = order[:split], order[split:]

final_model = Ridge(alpha=best_alpha, fit_intercept=True, solver="sparse_cg")
final_model.fit(X[train_idx], y[train_idx])

pred_test = final_model.predict(X[test_idx])
actual_test = np.exp(y[test_idx])
pred_test_price = np.exp(pred_test)
ape = np.abs(pred_test_price - actual_test) / actual_test
sse = np.sum((y[test_idx] - pred_test) ** 2)
sst = np.sum((y[test_idx] - y[test_idx].mean()) ** 2)
test_r2 = 1 - sse / sst
test_median_ape = float(np.median(ape))
test_mean_ape = float(np.mean(ape))
print(f"\nHeld-out test (n={len(test_idx)}): R²={test_r2:.4f}  medianAPE={test_median_ape*100:.1f}%  meanAPE={test_mean_ape*100:.1f}%")

# Now refit on ALL data at the chosen alpha for the coefficients we actually ship —
# more data in, more reliable factors out.
print("\nFitting final model on all data …")
full_model = Ridge(alpha=best_alpha, fit_intercept=True, solver="sparse_cg")
full_model.fit(X, y)
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
    m.fit(X[sample_idx], y[sample_idx])
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
            "nTrain": int(len(train_idx)),
            "nTest": int(len(test_idx)),
            "alpha": best_alpha,
            "cvR2ByAlpha": cv_scores,
            "testR2": float(test_r2),
            "testMedianAPE": test_median_ape,
            "testMeanAPE": test_mean_ape,
            "categoryCardinality": {c: int(df[c].nunique()) for c in CATEGORIES},
        },
        indent=1,
    ),
    encoding="utf-8",
)
print(f"Wrote {REPORT_OUT}")
