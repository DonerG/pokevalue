"""
Model-variant bake-off for the PokéValue pricing model.

Exists because the model's own reported R² was a poor guide to what the site
actually looks like. Two mismatches caused that:

  1. The model was fitted on `avg30` while every price shown on the site — and
     therefore every over-/undervalued verdict — comes from `trend`. Accuracy
     against a field the user never sees is not accuracy.
  2. R² in log space is dominated by the enormous spread between a EUR0.02 bulk
     common and a EUR400 chase card. It stays ~0.93 while whole rarity tiers
     are systematically off by 2x, because that error is small on a log scale
     next to the total spread.

So this script fixes the yardstick first: every variant is scored by MEDIAN
ABSOLUTE PERCENTAGE ERROR AGAINST `trend`, on cards from the 24 displayed sets
only, via K-fold cross-validation (each displayed card is predicted by a model
that never saw it). That is as close as a single number gets to "how wrong does
the site look".

Usage: python analysis/tune_model.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold

HERE = Path(__file__).resolve().parent
TRAINING_DATA = HERE.parent / "scripts" / "training-data.json"
DISPLAYED_SETS = HERE.parent / "src" / "data" / "generated" / "sets.json"

RNG_SEED = 42
N_FOLDS = 5
ALPHAS = [0.1, 0.32, 1.0, 1.78, 3.16, 5.62, 10.0, 17.78]
TRAINING_ONLY_WEIGHTS = [0.4]

BASE_CATEGORIES = ["pokemon", "rarity", "illustrator", "set", "cardType", "cardName"]


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


def load():
    df = pd.DataFrame(json.loads(TRAINING_DATA.read_text(encoding="utf-8")))
    displayed_ids = {s["id"] for s in json.loads(DISPLAYED_SETS.read_text(encoding="utf-8"))}

    df["displayed"] = df["setId"].isin(displayed_ids)
    df["pokemon"] = df["dexIds"].apply(lambda ids: str(ids[0]) if ids else "none")
    df["rarity"] = df["rarity"].fillna("None")
    df["illustrator"] = df["illustrator"].fillna("Unknown")
    df["set"] = df["setId"].fillna("unknown")
    df["cardType"] = df["cardType"].fillna("Standard")
    df["cardName"] = df.apply(lambda r: "n/a" if r["dexIds"] else r["name"], axis=1)
    df["era"] = df["releaseDate"].apply(era_bucket)
    df["rarityEra"] = df["rarity"] + " | " + df["era"]
    df["cardTypeEra"] = df["cardType"] + " | " + df["era"]
    # The interaction the per-set diagnosis pointed at: within the single "SV+"
    # bucket (2023-2026) the IR/SIR price ratio drifts hard — IR fair prices ran
    # 1.4-2.1x high on 2025-26 sets while SIR ran 0.53-0.92x low, and older SV
    # sets showed the reverse. Era is too coarse to express that; set is exact.
    df["raritySet"] = df["rarity"] + " | " + df["set"]
    df["cardTypeSet"] = df["cardType"] + " | " + df["set"]

    df = df[(df["trend"].notna()) & (df["trend"] > 0)].copy()
    df["avg30"] = df["avg30"].astype(float)
    df["trend"] = df["trend"].astype(float)
    return df


def build_design(df, categories):
    blocks, col_category = [], []
    for c in categories:
        dummies = pd.get_dummies(df[c], prefix="", prefix_sep="", sparse=True)
        blocks.append(sparse.csr_matrix(dummies.sparse.to_coo()))
        col_category.extend([c] * len(dummies.columns))
    return sparse.hstack(blocks, format="csr"), col_category


def evaluate(df, categories, target, alpha, training_only_weight):
    """Median APE against `trend` on displayed cards, K-fold so nothing is scored in-sample."""
    X, _ = build_design(df, categories)
    y = np.log(df[target].to_numpy())
    trend = df["trend"].to_numpy()
    displayed = df["displayed"].to_numpy()
    weight = np.where(displayed, 1.0, training_only_weight)

    disp_idx = np.flatnonzero(displayed)
    other_idx = np.flatnonzero(~displayed)
    kf = KFold(n_splits=N_FOLDS, shuffle=True, random_state=RNG_SEED)

    apes = np.empty(len(disp_idx))
    for train_part, test_part in kf.split(disp_idx):
        tr = np.concatenate([other_idx, disp_idx[train_part]])
        te = disp_idx[test_part]
        m = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        m.fit(X[tr], y[tr], sample_weight=weight[tr])
        pred = np.exp(m.predict(X[te]))
        apes[test_part] = np.abs(pred - trend[te]) / trend[te]

    return {
        "medAPE": float(np.median(apes)),
        "within20": float(np.mean(apes <= 0.20)),
        "within50": float(np.mean(apes <= 0.50)),
    }


def rarity_bias(df, categories, target, alpha, training_only_weight, rarities):
    """Median predicted/trend ratio per rarity — 1.0 means unbiased, 2.0 means priced 2x too high."""
    X, _ = build_design(df, categories)
    y = np.log(df[target].to_numpy())
    trend = df["trend"].to_numpy()
    displayed = df["displayed"].to_numpy()
    weight = np.where(displayed, 1.0, training_only_weight)

    disp_idx = np.flatnonzero(displayed)
    other_idx = np.flatnonzero(~displayed)
    kf = KFold(n_splits=N_FOLDS, shuffle=True, random_state=RNG_SEED)
    ratio = np.empty(len(disp_idx))
    for train_part, test_part in kf.split(disp_idx):
        tr = np.concatenate([other_idx, disp_idx[train_part]])
        te = disp_idx[test_part]
        m = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        m.fit(X[tr], y[tr], sample_weight=weight[tr])
        ratio[test_part] = np.exp(m.predict(X[te])) / trend[te]

    rar = df["rarity"].to_numpy()[disp_idx]
    era_new = df["releaseDate"].to_numpy()[disp_idx] >= "2025-01-01"
    out = {}
    for r in rarities:
        for label, mask in (("new", era_new), ("old", ~era_new)):
            sel = (rar == r) & mask
            if sel.sum() >= 10:
                out[f"{r} [{label}]"] = (float(np.median(ratio[sel])), int(sel.sum()))
    return out


if __name__ == "__main__":
    df = load()
    print(f"{len(df)} rows with a usable trend price; {int(df['displayed'].sum())} in displayed sets\n")

    variants = {
        "A current (avg30 target, era interactions)": (
            BASE_CATEGORIES + ["rarityEra", "cardTypeEra"],
            "avg30",
        ),
        "B trend target, era interactions": (
            BASE_CATEGORIES + ["rarityEra", "cardTypeEra"],
            "trend",
        ),
        "C trend + rarity x set": (
            BASE_CATEGORIES + ["rarityEra", "cardTypeEra", "raritySet"],
            "trend",
        ),
        "D trend + rarity x set + cardType x set": (
            BASE_CATEGORIES + ["rarityEra", "cardTypeEra", "raritySet", "cardTypeSet"],
            "trend",
        ),
        "E trend + rarity x set, no era interactions": (
            BASE_CATEGORIES + ["raritySet", "cardTypeSet"],
            "trend",
        ),
    }

    print(f"{'variant':<46} {'alpha':>6} {'medAPE':>8} {'<=20%':>7} {'<=50%':>7}")
    print("-" * 78)
    best = {}
    for name, (cats, target) in variants.items():
        best_row = None
        for w in TRAINING_ONLY_WEIGHTS:
            for alpha in ALPHAS:
                r = evaluate(df, cats, target, alpha, w)
                if best_row is None or r["medAPE"] < best_row[1]["medAPE"]:
                    best_row = (alpha, r, w)
        alpha, r, w = best_row
        best[name] = (cats, target, alpha, w)
        print(
            f"{name:<46} {alpha:>6.2f} {r['medAPE']*100:>7.1f}% {r['within20']*100:>6.0f}% {r['within50']*100:>6.0f}%"
        )

    print("\nRarity bias (median predicted/trend; 1.00 = unbiased), new = released 2025+")
    for name in ["A current (avg30 target, era interactions)", list(best)[-1]]:
        cats, target, alpha, w = best[name]
        print(f"\n  {name}  (alpha={alpha})")
        bias = rarity_bias(df, cats, target, alpha, w, ["Illustration rare", "Special illustration rare"])
        for k, (v, n) in sorted(bias.items()):
            print(f"    {k:<38} {v:>5.2f}  (n={n})")
