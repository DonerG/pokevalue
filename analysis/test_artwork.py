"""
Two questions at once: does the hand-rated artwork grade earn a place in the
model, and what is the cheapest term that fixes the Black Bolt problem
(a set whose chase cards cost 2-3x the going rate while its bulk is ordinary,
which a uniform per-set factor cannot express and rarity x YEAR cannot either,
since its neighbours share its release year).
"""
import json
import numpy as np
from pathlib import Path
from scipy import sparse
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold
from tune_model import load, build_design

HERE = Path(__file__).resolve().parent
ratings = json.loads((HERE.parent / "src" / "data" / "artwork-ratings.json").read_text(encoding="utf-8"))
promo_styles = json.loads((HERE.parent / "src" / "data" / "promo-styles.json").read_text(encoding="utf-8"))

df = load()
CHASE = {"Illustration rare", "Special illustration rare", "Hyper rare", "Shiny rare"}
MID = {"Double rare", "Ultra Rare", "Promo", "ACE SPEC Rare"}
df["tier"] = df["rarity"].apply(lambda r: "chase" if r in CHASE else ("mid" if r in MID else "bulk"))
df["year"] = df["releaseDate"].str.slice(0, 4)
df["rarityYear"] = df["rarity"] + " | " + df["year"]
df["cardTypeYear"] = df["cardType"] + " | " + df["year"]
df["raritySet"] = df["rarity"] + " | " + df["set"]
df["tierSet"] = df["tier"] + " | " + df["set"]

# 8 is deliberately folded into "none": measured, an 8 outside Hyper Rares sits
# at 1.00 and an unrated chase card at 0.98 — the reviewer used it both for
# "acceptable" and for "couldn't judge this one", so it carries nothing.
GRADE = {10: "top", 9: "strong", 0: "weak"}
def artwork(card_id):
    if card_id in promo_styles:      # already carried by its promo rarity level
        return "none"
    return GRADE.get(ratings.get(card_id), "none")
df["artwork"] = df["id"].apply(artwork)
print("artwork levels:", df[df["displayed"]]["artwork"].value_counts().to_dict())

trend = df["trend"].to_numpy(); displayed = df["displayed"].to_numpy()
disp = np.flatnonzero(displayed); other = np.flatnonzero(~displayed)
tier = df["tier"].to_numpy(); setid = df["set"].to_numpy(); rar = df["rarity"].to_numpy()

BASE8 = ["pokemon", "rarity", "illustrator", "set", "cardType", "cardName", "rarityYear", "cardTypeYear"]

def run(cats, alpha=3.16):
    X, cc = build_design(df, cats); cc = np.array(cc)
    y = np.log(trend); w = np.where(displayed, 1.0, 0.2)
    pk = cc == "pokemon"
    oof = np.empty(len(disp))
    for tr_p, te_p in KFold(5, shuffle=True, random_state=42).split(disp):
        tr = np.concatenate([other, disp[tr_p]])
        m1 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg").fit(X[tr], y[tr], sample_weight=w[tr])
        contrib = np.asarray(X[:, pk] @ m1.coef_[pk]).ravel()
        X2 = sparse.hstack([X, sparse.csr_matrix(np.column_stack(
            [contrib * (tier == "mid"), contrib * (tier == "chase")]))], format="csr")
        m2 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg").fit(X2[tr], y[tr], sample_weight=w[tr])
        oof[te_p] = np.exp(m2.predict(X2[disp[te_p]]))
    ape = np.abs(oof - trend[disp]) / trend[disp]
    ratio = oof / trend[disp]
    def bias(mask): 
        sel = mask[disp]
        return np.median(ratio[sel]) if sel.sum() >= 5 else float("nan")
    bb_bulk = bias((setid == "sv10.5b") & (tier == "bulk"))
    bb_ir = bias((setid == "sv10.5b") & (rar == "Illustration rare"))
    normal_ir = bias(np.isin(setid, ["sv10", "sv09"]) & (rar == "Illustration rare"))
    return np.median(ape), np.mean(np.abs(ratio - 1) > 0.2), bb_bulk, bb_ir, normal_ir

variants = {
    "8 current (no artwork)":       BASE8,
    "9  + artwork":                 BASE8 + ["artwork"],
    "10 + artwork + tier x set":    BASE8 + ["artwork", "tierSet"],
    "10 + artwork + rarity x set":  BASE8 + ["artwork", "raritySet"],
}
print(f"\n{'variant':<30} {'medAPE':>7} {'flagged':>8} {'BB bulk':>8} {'BB IR':>7} {'normal IR':>10}")
print("-" * 76)
for name, cats in variants.items():
    a, fl, bb, bbir, nir = run(cats)
    print(f"{name:<30} {a*100:>6.1f}% {fl*100:>7.0f}% {bb:>8.2f} {bbir:>7.2f} {nir:>10.2f}")
