"""
Should a rarity level with few but CONSISTENT cards be trusted more than ridge
allows? Ridge shrinks purely by sample size, so "Black White Rare" (4 cards,
all EUR300-450, tightly clustered) is pulled to the same degree as a level with
4 cards scattered over two orders of magnitude. This measures a per-level
correction — and validates it LEAVE-ONE-OUT, so a level can never be judged on
a card that helped set its own correction.
"""
import json
import numpy as np
from pathlib import Path

HERE = Path(__file__).resolve().parent
cards = []
gen = HERE.parent / "src" / "data" / "generated"
for s in json.loads((gen / "sets.json").read_text(encoding="utf-8")):
    for c in json.loads((gen / f"cards-{s['id']}.json").read_text(encoding="utf-8")):
        if c.get("market") and c["market"].get("trend"):
            cards.append({"rarity": c["rarity"] or "None", "market": c["market"]["trend"], "fair": c["baseValue"]})

by_rarity = {}
for c in cards:
    by_rarity.setdefault(c["rarity"], []).append(c)

def loo_calibrated(group, i, snr_weighted):
    """Correction for card i from the OTHER cards in its level."""
    others = [c for j, c in enumerate(group) if j != i]
    if not others:
        return 1.0
    res = np.log([c["market"] / c["fair"] for c in others])
    m = float(np.mean(res))
    if not snr_weighted:
        return float(np.exp(m))
    # Weight the correction by how much it stands out from its own scatter:
    # a consistent offset gets applied, noise gets ignored.
    se = float(np.std(res, ddof=1) / np.sqrt(len(res))) if len(res) > 1 else abs(m)
    w = m * m / (m * m + se * se) if (m or se) else 0.0
    return float(np.exp(m * w))

def score(mode):
    apes = []
    for group in by_rarity.values():
        for i, c in enumerate(group):
            corr = 1.0 if mode == "none" else loo_calibrated(group, i, mode == "snr")
            apes.append(abs(c["fair"] * corr - c["market"]) / c["market"])
    return float(np.median(apes)), float(np.mean(np.array(apes) <= 0.2))

print(f"{'Variante':<34} {'medAPE':>8} {'<=20%':>7}")
print("-" * 52)
for mode, label in [("none", "ohne Kalibrierung (Ist-Zustand)"),
                    ("plain", "volle Korrektur je Seltenheit"),
                    ("snr", "Korrektur nach Signal/Rauschen")]:
    a, w = score(mode)
    print(f"{label:<34} {a*100:>7.1f}% {w*100:>6.0f}%")

print("\nWas die Korrektur je Stufe machen wuerde (alle Karten der Stufe):")
print(f"{'Seltenheit':<28} {'n':>5} {'Korrektur':>10} {'Streuung':>10}")
for r, group in sorted(by_rarity.items(), key=lambda kv: -len(kv[1])):
    if len(group) < 2:
        continue
    res = np.log([c["market"] / c["fair"] for c in group])
    m, sd = float(np.mean(res)), float(np.std(res, ddof=1))
    se = sd / np.sqrt(len(group))
    w = m * m / (m * m + se * se)
    if abs(np.exp(m * w) - 1) < 0.15:
        continue
    print(f"{r:<28} {len(group):>5} {np.exp(m*w):>9.2f}x {np.exp(sd):>9.2f}x")
