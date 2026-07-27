"""
Can a whole rarity group inside one set still be called collectively
over-/underpriced? That is what the site would lose by absorbing the effect
into a per-(set, rarity) factor. Measured directly: for every (set, rarity)
group, how far its MEDIAN card sits from fair.
"""
import json
import numpy as np
from pathlib import Path
from scipy import sparse
from sklearn.linear_model import Ridge
from tune_model import load, build_design

HERE = Path(__file__).resolve().parent
ratings = json.loads((HERE.parent / "src/data/artwork-ratings.json").read_text(encoding="utf-8"))
promo = json.loads((HERE.parent / "src/data/promo-styles.json").read_text(encoding="utf-8"))
df = load()
CHASE = {"Illustration rare","Special illustration rare","Hyper rare","Shiny rare"}
MID = {"Double rare","Ultra Rare","Promo","ACE SPEC Rare"}
df["tier"]=df["rarity"].apply(lambda r:"chase" if r in CHASE else ("mid" if r in MID else "bulk"))
df["year"]=df["releaseDate"].str.slice(0,4)
df["rarityYear"]=df["rarity"]+" | "+df["year"]; df["cardTypeYear"]=df["cardType"]+" | "+df["year"]
df["raritySet"]=df["rarity"]+" | "+df["set"]; df["tierSet"]=df["tier"]+" | "+df["set"]
G={10:"top",9:"strong",0:"weak"}
df["artwork"]=df["id"].apply(lambda i:"none" if i in promo else G.get(ratings.get(i),"none"))
trend=df["trend"].to_numpy(); displayed=df["displayed"].to_numpy()
disp=np.flatnonzero(displayed); tier=df["tier"].to_numpy()
grp=(df["set"]+" | "+df["rarity"]).to_numpy()
BASE=["pokemon","rarity","illustrator","set","cardType","cardName","rarityYear","cardTypeYear","artwork"]

def groupdev(cats, alpha=1.78):
    X,cc=build_design(df,cats); cc=np.array(cc)
    y=np.log(trend); w=np.where(displayed,1.0,0.2); pk=cc=="pokemon"
    idx=np.arange(X.shape[0])
    m1=Ridge(alpha=alpha,fit_intercept=True,solver="sparse_cg").fit(X[idx],y[idx],sample_weight=w[idx])
    contrib=np.asarray(X[:,pk]@m1.coef_[pk]).ravel()
    X2=sparse.hstack([X,sparse.csr_matrix(np.column_stack([contrib*(tier=="mid"),contrib*(tier=="chase")]))],format="csr")
    m2=Ridge(alpha=alpha,fit_intercept=True,solver="sparse_cg").fit(X2[idx],y[idx],sample_weight=w[idx])
    fair=np.exp(m2.predict(X2[disp])); mkt=trend[disp]
    dev=(mkt-fair)/fair            # site's own reading: >0 = market above fair
    out={}
    for g in set(grp[disp]):
        sel=grp[disp]==g
        if sel.sum()>=8: out[g]=float(np.median(dev[sel]))
    return out

res={n:groupdev(c) for n,c in {
    "9 (current)":BASE, "tier x set":BASE+["tierSet"], "rarity x set":BASE+["raritySet"]}.items()}

print("How many (set, rarity) groups still read as collectively off by >20%?")
for n,d in res.items():
    v=np.array(list(d.values()))
    print(f"  {n:<14} {np.sum(np.abs(v)>0.2):>3} of {len(v)} groups   (median |deviation| {np.median(np.abs(v))*100:>4.0f}%)")
print()
print("Named example — is a hyped rarity group still visible?")
for g in ["sv08.5 | Special illustration rare","sv10.5b | Illustration rare","sv10 | Illustration rare"]:
    print(f"  {g:<38} " + "  ".join(f"{n}: {res[n].get(g,float('nan'))*100:+5.0f}%" for n in res))
