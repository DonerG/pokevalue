"""
Is rarity x set genuinely better, or does it just fit its own training rows?
Each (set, rarity) group holds a median of ~16 cards, so a factor for that
group is partly an average of the very cards it then prices. Two symptoms of
that: a bigger gap between in-sample and out-of-fold error, and a group that
can no longer be flagged as collectively over- or underpriced.
"""
import json
import numpy as np
from pathlib import Path
from scipy import sparse
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold
from tune_model import load, build_design

HERE = Path(__file__).resolve().parent
ratings = json.loads((HERE.parent / "src/data/artwork-ratings.json").read_text(encoding="utf-8"))
promo_styles = json.loads((HERE.parent / "src/data/promo-styles.json").read_text(encoding="utf-8"))

df = load()
CHASE = {"Illustration rare", "Special illustration rare", "Hyper rare", "Shiny rare"}
MID = {"Double rare", "Ultra Rare", "Promo", "ACE SPEC Rare"}
df["tier"] = df["rarity"].apply(lambda r: "chase" if r in CHASE else ("mid" if r in MID else "bulk"))
df["year"] = df["releaseDate"].str.slice(0, 4)
df["rarityYear"] = df["rarity"] + " | " + df["year"]
df["cardTypeYear"] = df["cardType"] + " | " + df["year"]
df["raritySet"] = df["rarity"] + " | " + df["set"]
df["tierSet"] = df["tier"] + " | " + df["set"]
GRADE = {10: "top", 9: "strong", 0: "weak"}
df["artwork"] = df["id"].apply(lambda i: "none" if i in promo_styles else GRADE.get(ratings.get(i), "none"))

trend = df["trend"].to_numpy(); displayed = df["displayed"].to_numpy()
disp = np.flatnonzero(displayed); other = np.flatnonzero(~displayed)
tier = df["tier"].to_numpy()
groupsize = df.groupby("raritySet")["id"].transform("count").to_numpy()

BASE = ["pokemon","rarity","illustrator","set","cardType","cardName","rarityYear","cardTypeYear","artwork"]

def run(cats, alpha=1.78):
    X, cc = build_design(df, cats); cc = np.array(cc)
    y = np.log(trend); w = np.where(displayed, 1.0, 0.2); pk = cc == "pokemon"
    def fit2(idx):
        m1 = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg").fit(X[idx], y[idx], sample_weight=w[idx])
        contrib = np.asarray(X[:, pk] @ m1.coef_[pk]).ravel()
        X2 = sparse.hstack([X, sparse.csr_matrix(np.column_stack(
            [contrib*(tier=="mid"), contrib*(tier=="chase")]))], format="csr")
        return Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg").fit(X2[idx], y[idx], sample_weight=w[idx]), X2
    # out of fold
    oof = np.empty(len(disp))
    for tr_p, te_p in KFold(5, shuffle=True, random_state=42).split(disp):
        m, X2 = fit2(np.concatenate([other, disp[tr_p]]))
        oof[te_p] = np.exp(m.predict(X2[disp[te_p]]))
    # in sample (what actually ships)
    m, X2 = fit2(np.arange(X.shape[0]))
    ins = np.exp(m.predict(X2[disp]))
    t = trend[disp]
    oof_ape = np.median(np.abs(oof-t)/t); ins_ape = np.median(np.abs(ins-t)/t)
    flagged = np.mean(np.abs((t-ins)/ins) > 0.2)
    gs = groupsize[disp]
    small = np.mean(np.abs((t-ins)/ins)[gs <= 20] > 0.2)
    return oof_ape, ins_ape, oof_ape-ins_ape, flagged, small

print(f"{'variant':<24} {'out-of-fold':>12} {'in-sample':>10} {'gap':>7} {'flagged':>9} {'flagged in small groups':>24}")
print("-"*92)
for name, cats in {
    "9 (current)":        BASE,
    "10 + tier x set":    BASE + ["tierSet"],
    "10 + rarity x set":  BASE + ["raritySet"],
}.items():
    o, i, g, fl, sm = run(cats)
    print(f"{name:<24} {o*100:>11.1f}% {i*100:>9.1f}% {g*100:>6.1f}pp {fl*100:>8.0f}% {sm*100:>23.0f}%")
