"""
Builds a PDF documenting every factor the pricing model computed: which
Pokemon, rarity, illustrator, set, and card type is worth what, plus sample
size and a 95% confidence interval for each - so anything backed by too
little data to trust is visible, not hidden.

Text is sanitized to plain ASCII throughout: this reportlab/Windows/base14-font
combination silently mangles non-ASCII characters into unrecoverable "�"
replacement glyphs even when the write step doesn't error (confirmed with an
isolated test) - not worth the risk on a document meant to be read exactly as
written, so accents are stripped and special punctuation is swapped for ASCII.

Reads:  analysis/factors.json, analysis/model_report.json, analysis/pokedex_names.json
Writes: analysis/PokeValue-Faktoren.pdf

Usage: python analysis/build_report.py
"""

import json
import unicodedata
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HERE = Path(__file__).resolve().parent
FACTORS = json.loads((HERE / "factors.json").read_text(encoding="utf-8"))
REPORT = json.loads((HERE / "model_report.json").read_text(encoding="utf-8"))
POKEDEX = json.loads((HERE / "pokedex_names.json").read_text(encoding="utf-8"))

LOW_CONFIDENCE_N = 5  # below this, a factor is flagged "low confidence" - same threshold used to dampen it for on-site display

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=9.5, leading=13))
styles.add(ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.grey))
styles.add(ParagraphStyle("H2", parent=styles["Heading2"], spaceBefore=14, spaceAfter=6))
styles.add(ParagraphStyle("TableCell", parent=styles["Normal"], fontSize=8, leading=10))

BAD = colors.HexColor("#b3251c")
HEADER_BG = colors.HexColor("#2d2a4a")

_ASCII_SUBS = {
    "—": " - ",  # em dash
    "–": "-",  # en dash
    "×": "x",  # multiplication sign
    "→": "->",
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
}


def ascii_safe(text: str) -> str:
    """Strips accents (e -> e) and swaps special punctuation for ASCII equivalents,
    so nothing can hit the mangled-glyph issue regardless of source."""
    for char, repl in _ASCII_SUBS.items():
        text = text.replace(char, repl)
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")


def pokemon_name(dex_key: str) -> str:
    if dex_key == "none":
        return "- (Trainer / Energy, no specific Pokemon)"
    name = POKEDEX.get(dex_key)
    if not name:
        return f"Pokedex #{dex_key}"
    return ascii_safe(f"{name.replace('-', ' ').title()} (#{dex_key})")


def confidence_note(n: int) -> str:
    return "low confidence" if n < LOW_CONFIDENCE_N else ""


def make_table(rows, col_widths, header):
    data = [header] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f4f8")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8d8e0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    # color the "low confidence" flag column red where present
    for i, row in enumerate(rows, start=1):
        if row[-1] == "low confidence":
            style.append(("TEXTCOLOR", (-1, i), (-1, i), BAD))
    t.setStyle(TableStyle(style))
    return t


def factor_rows(entries: dict, name_fn=None, sort_desc=True):
    items = sorted(entries.items(), key=lambda kv: -kv[1]["factor"] if sort_desc else 0)
    rows = []
    for key, v in items:
        label = name_fn(key) if name_fn else ascii_safe(key)
        rows.append(
            [
                Paragraph(label, styles["TableCell"]),
                f"x{v['factor']:.2f}",
                str(v["n"]),
                f"{v['ciLow']:.2f}-{v['ciHigh']:.2f}",
                confidence_note(v["n"]),
            ]
        )
    return rows


HEADER = ["Value", "Factor", "n cards", "95% CI", "Flag"]

story = []

# ---------------------------------------------------------------- cover / methodology

story.append(Paragraph("PokeValue - Pricing Model Factor Report", styles["Title"]))
story.append(Paragraph(f"Generated {FACTORS['trainedAt'][:10]}", styles["Small"]))
story.append(Spacer(1, 10 * mm))

story.append(Paragraph("How the model works", styles["H2"]))
story.append(
    Paragraph(
        "Every card's fair value is computed as: "
        "<b>base rate x Pokemon factor x rarity factor x illustrator factor x set factor x card type factor</b>. "
        "Each factor is independent of the others - a Pokemon's factor doesn't depend on which rarity the card "
        "happens to be, and vice versa. This is a log-linear (ridge) regression fitted on "
        f"{REPORT['nRows']:,} English-language cards with a real Cardmarket price, covering every set on TCGdex.",
        styles["Body"],
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    Paragraph(
        f"<b>Model accuracy</b> (on {REPORT['nTest']:,} cards held out of training): "
        f"R-squared = {REPORT['testR2']:.3f} (the model explains {REPORT['testR2']*100:.0f}% of the price variation "
        f"between cards), median prediction error {REPORT['testMedianAPE']*100:.0f}%. "
        "This is comparable to a neural-network version of the same model tried earlier, "
        "but every number below is directly interpretable instead of hidden inside the network.",
        styles["Body"],
    )
)
story.append(Spacer(1, 4 * mm))
story.append(Paragraph("How to read the confidence columns", styles["H2"]))
story.append(
    Paragraph(
        "<b>n cards</b> is how many priced cards support that specific factor. <b>95% CI</b> is a bootstrap "
        "confidence interval (60 resamples) - the range the true factor plausibly falls in; a wide range means "
        "the point estimate is shaky. Anything with fewer than "
        f"{LOW_CONFIDENCE_N} supporting cards is flagged <font color='#b3251c'><b>low confidence</b></font> - "
        "on the live site, those factors are additionally pulled most of the way back toward neutral (1x) so a "
        "single freak card can't dominate a shown price. The numbers in this report are the raw, undamped "
        "statistical estimate.",
        styles["Body"],
    )
)
story.append(Spacer(1, 4 * mm))
story.append(
    Paragraph(
        "<b>Not included in this model:</b> reverse holo / 1st Edition / Shadowless pricing (Cardmarket's "
        "variant-level data was too inconsistent to trust yet) and manual artwork-quality ratings (descoped for "
        "this version). Condition and language remain adjustable on the site but are reasonable assumptions, "
        "not computed from data - Cardmarket doesn't track prices separately by grade or by language.",
        styles["Body"],
    )
)
story.append(PageBreak())

# ---------------------------------------------------------------- rarity

story.append(Paragraph("Rarity factors", styles["H2"]))
story.append(Paragraph(f"{len(FACTORS['factors']['rarity'])} distinct rarities.", styles["Small"]))
story.append(Spacer(1, 3 * mm))
story.append(make_table(factor_rows(FACTORS["factors"]["rarity"]), [70 * mm, 18 * mm, 18 * mm, 28 * mm, 26 * mm], HEADER))
story.append(PageBreak())

# ---------------------------------------------------------------- card type

story.append(Paragraph("Card type factors", styles["H2"]))
story.append(Paragraph(f"{len(FACTORS['factors']['cardType'])} distinct mechanics (V/VMAX/GX/EX/Mega EX/...).", styles["Small"]))
story.append(Spacer(1, 3 * mm))
story.append(make_table(factor_rows(FACTORS["factors"]["cardType"]), [70 * mm, 18 * mm, 18 * mm, 28 * mm, 26 * mm], HEADER))
story.append(PageBreak())

# ---------------------------------------------------------------- set

set_names = {}
for setmeta in json.loads((HERE.parent / "src" / "data" / "generated" / "sets.json").read_text(encoding="utf-8")):
    set_names[setmeta["id"]] = setmeta["name"]


def set_label(key):
    return ascii_safe(f"{set_names.get(key, key)} ({key})")


story.append(Paragraph("Set factors", styles["H2"]))
story.append(Paragraph(f"{len(FACTORS['factors']['set'])} distinct sets.", styles["Small"]))
story.append(Spacer(1, 3 * mm))
story.append(make_table(factor_rows(FACTORS["factors"]["set"], name_fn=set_label), [70 * mm, 18 * mm, 18 * mm, 28 * mm, 26 * mm], HEADER))
story.append(PageBreak())

# ---------------------------------------------------------------- illustrator

story.append(Paragraph("Illustrator factors", styles["H2"]))
story.append(Paragraph(f"{len(FACTORS['factors']['illustrator'])} distinct illustrators.", styles["Small"]))
story.append(Spacer(1, 3 * mm))
story.append(make_table(factor_rows(FACTORS["factors"]["illustrator"]), [70 * mm, 18 * mm, 18 * mm, 28 * mm, 26 * mm], HEADER))
story.append(PageBreak())

# ---------------------------------------------------------------- pokemon

story.append(Paragraph("Pokemon factors", styles["H2"]))
story.append(Paragraph(f"{len(FACTORS['factors']['pokemon'])} distinct Pokemon (plus the Trainer/Energy baseline).", styles["Small"]))
story.append(Spacer(1, 3 * mm))
story.append(make_table(factor_rows(FACTORS["factors"]["pokemon"], name_fn=pokemon_name), [70 * mm, 18 * mm, 18 * mm, 28 * mm, 26 * mm], HEADER))
story.append(PageBreak())

# ---------------------------------------------------------------- card name (trainer/energy)

story.append(Paragraph("Card name factors (Trainer / Energy)", styles["H2"]))
story.append(
    Paragraph(
        f"{len(FACTORS['factors']['cardName'])} distinct Trainer/Energy card names (plus the n/a baseline for "
        "Pokemon cards, whose identity is already covered by the Pokemon factor above). Most names are one-off "
        "reprints with too little data to say anything - shrinkage pulls those to neutral, same as anywhere else "
        "in this report.",
        styles["Small"],
    )
)
story.append(Spacer(1, 3 * mm))
story.append(make_table(factor_rows(FACTORS["factors"]["cardName"]), [70 * mm, 18 * mm, 18 * mm, 28 * mm, 26 * mm], HEADER))

# ---------------------------------------------------------------- build

OUT = HERE / "PokeValue-Faktoren.pdf"
doc = SimpleDocTemplate(
    str(OUT),
    pagesize=A4,
    topMargin=18 * mm,
    bottomMargin=16 * mm,
    leftMargin=16 * mm,
    rightMargin=16 * mm,
    title="PokeValue Pricing Model Factor Report",
)
doc.build(story)
print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
