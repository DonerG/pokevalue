"""
Does adding factors make the site say LESS? Every factor the model gains lets
it explain away more of the market, and a model that reproduced the market
exactly would flag nothing as over- or undervalued — which is the whole point
of the site. So variants are compared on two axes at once: how close they get
(median APE) and how much they still have to say (share of cards flagged).
"""
import numpy as np
from scipy import sparse
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold
from tune_model import load, build_design

df = load()
CHASE = {"Illustration rare", "Special illustration rare", "Hyper rare", "Shiny rare"}
MID = {"Double rare", "Ultra Rare", "Promo", "ACE SPEC Rare"}
df["tier"] = df["rarity"].apply(lambda r: "chase" if r in CHASE else ("mid" if r in MID else "bulk"))
# Finer era buckets: a middle ground between one coarse "SV+" bucket (2023-2026)
# and a full per-set factor — same idea, far fewer levels.
df["eraFine"] = df["releaseDate"].str.slice(0, 4)
df["rarityEraFine"] = df["rarity"] + " | " + df["eraFine"]
df["cardTypeEraFine"] = df["cardType"] + " | " + df["eraFine"]

trend = df["trend"].to_numpy(); displayed = df["displayed"].to_numpy()
disp = np.flatnonzero(displayed); other = np.flatnonzero(~displayed)
tier = df["tier"].to_numpy(); rar = df["rarity"].to_numpy()
new = df["releaseDate"].to_numpy() >= "2025-01-01"

CORE5 = ["pokemon", "rarity", "illustrator", "set", "cardType"]

def run(cats, varying, alpha=3.16, rs_scale=None):
    X, cc = build_design(df, cats); cc = np.array(cc)
    y = np.log(trend)
    s = np.ones(X.shape[1])
    if rs_scale: s[cc == "raritySet"] = rs_scale
    Xs = (X @ sparse.diags(s)).tocsr()
    w = np.where(displayed, 1.0, 0.2)

    def fit(idx, Xm):
        m = Ridge(alpha=alpha, fit_intercept=True, solver="sparse_cg")
        m.fit(Xm[idx], y[idx], sample_weight=w[idx]); return m

    def expand(Xm, m):
        pk = cc == "pokemon"
        contrib = np.asarray(Xs[:, pk] @ m.coef_[pk]).ravel()
        return sparse.hstack([Xs, sparse.csr_matrix(np.column_stack(
            [contrib * (tier == "mid"), contrib * (tier == "chase")]))], format="csr")

    # Out-of-fold accuracy
    oof = np.empty(len(disp))
    for tr_p, te_p in KFold(5, shuffle=True, random_state=42).split(disp):
        tr = np.concatenate([other, disp[tr_p]])
        m = fit(tr, Xs)
        Xm = expand(Xs, m) if varying else Xs
        if varying: m = fit(tr, Xm)
        oof[te_p] = np.exp(m.predict(Xm[disp[te_p]]))
    ape = np.abs(oof - trend[disp]) / trend[disp]

    # What the site would actually show: fit on everything, like production
    m = fit(np.arange(X.shape[0]), Xs)
    Xm = expand(Xs, m) if varying else Xs
    if varying: m = fit(np.arange(X.shape[0]), Xm)
    fair = np.exp(m.predict(Xm[disp]))
    mkt = trend[disp]
    gap = (mkt - fair) / fair
    flagged = np.mean(np.abs(gap) > 0.20)
    # Systematic bias that per-set factors were added to remove
    ir = np.median((fair / mkt)[(rar[disp] == "Illustration rare") & new[disp]])
    sir = np.median((fair / mkt)[(rar[disp] == "Special illustration rare") & new[disp]])
    return np.median(ape), flagged, ir, sir, len(np.unique(cc))

variants = {
    "5 core":                          (CORE5, False, None),
    "6 (+cardName)":                   (CORE5 + ["cardName"], False, None),
    "8 (+rarity/type x era)":          (CORE5 + ["cardName", "rarityEra", "cardTypeEra"], False, None),
    "8 + Pokemon tier exponent":       (CORE5 + ["cardName", "rarityEra", "cardTypeEra"], True, None),
    "8, era by YEAR + tier exp":       (CORE5 + ["cardName", "rarityEraFine", "cardTypeEraFine"], True, None),
    "10 current (+ x set)":            (CORE5 + ["cardName", "rarityEra", "cardTypeEra", "raritySet", "cardTypeSet"], True, 2.0),
}
print(f"{'variant':<30} {'medAPE':>7} {'flagged':>8} {'IR[new]':>8} {'SIR[new]':>9}")
print("-" * 68)
for name, (cats, varying, rs) in variants.items():
    a, fl, ir, sir, _ = run(cats, varying, rs_scale=rs)
    print(f"{name:<30} {a*100:>6.1f}% {fl*100:>7.0f}% {ir:>8.2f} {sir:>9.2f}")
