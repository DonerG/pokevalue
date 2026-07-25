import { useEffect, useState } from 'react'
import { loadFactorHighlights, type FactorExample, type FactorHighlights } from '../data/cards'
import { useDocumentMeta } from '../logic/documentMeta'
import { howItWorksMeta } from '../logic/pageMeta.js'

const multFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })
const intFmt = new Intl.NumberFormat('en-GB')

function FactorTable({ title, note, rows }: { title: string; note: string; rows: FactorExample[] }) {
  return (
    <div className="factor-table">
      <h4>{title}</h4>
      <p className="muted">{note}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.label}>
            <span className="factor-table-label">{r.label}</span>
            <span className="factor-table-n">{r.n} cards</span>
            <span className="factor-table-value">×{multFmt.format(r.factor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HowItWorksPage() {
  const [data, setData] = useState<FactorHighlights | null>(null)

  useEffect(() => {
    loadFactorHighlights().then(setData)
  }, [])

  const meta = howItWorksMeta()
  useDocumentMeta(meta.title, meta.description, '/how-it-works')

  return (
    <div className="how-it-works">
      <nav className="breadcrumb">
        <a href="/">Sets</a> / <strong>How it works</strong>
      </nav>

      <section className="hero-block">
        <h2>How the fair price is calculated</h2>
        <p>
          Every price on this site comes from a statistical model trained on real Cardmarket data —
          not from a hand-written formula, and not from anyone's opinion about what a card
          <em> should</em> be worth. This page explains exactly how that works.
        </p>
      </section>

      <section className="panel prose-panel">
        <h3>The short version</h3>
        <p>
          A card's fair price is one starting amount multiplied by a series of factors, each one
          learned from data:
        </p>
        <p className="formula">
          fair price = €1 × Pokémon × rarity × illustrator × set × card type
          <br />
          <span className="formula-cont">× card name × rarity·era × card type·era</span>
        </p>
        <p>
          So a card is worth €1 to start, then multiplied up or down by which Pokémon it shows, how
          rare it is, who illustrated it, which set it's from, and which mechanic it uses (ex, V,
          VMAX, …). If a Pokémon's factor is ×12, cards showing it sell for about twelve times what
          an otherwise identical card would.
        </p>
      </section>

      <section className="panel prose-panel">
        <h3>How the factors are found</h3>
        <p>
          The model is a <strong>ridge regression</strong> fitted on the logarithm of each card's
          Cardmarket price. Taking the log is what turns a chain of multiplications into a plain
          sum, which is the kind of problem a linear model can solve — and it matches how card
          prices actually behave: they span from a few cents to several hundred euros, so what
          matters is proportion, not absolute difference.
        </p>
        <p>
          Every value of every category (each individual Pokémon, each rarity, each illustrator, …)
          gets its own column, and the fit finds the set of factors that best explains every card
          price at once. Nothing is picked or tuned by hand — the values below are whatever best
          fits the data.
        </p>
        <p>
          The "ridge" part matters for cards with thin data. A Pokémon appearing on 300 cards gives
          a confident estimate; one appearing on two doesn't. Ridge regularization automatically
          pulls poorly-supported factors back toward neutral (×1) instead of letting a single odd
          card dictate a whole factor. On top of that, anything backed by fewer than five cards is
          damped further before it's shown here.
        </p>
        <p>
          The regularization strength is chosen by 5-fold cross-validation, and every factor gets a
          95% confidence interval from 60 bootstrap resamples, so weakly-supported values are
          identifiable rather than silently trusted.
        </p>
      </section>

      <section className="panel prose-panel">
        <h3>Why some factors are combined</h3>
        <p>
          Mostly the factors are independent: a Pokémon's factor doesn't depend on which set the
          card is from. Two are deliberate exceptions, because the same label has genuinely meant
          different things over the game's history.
        </p>
        <p>
          A "Rare" in 1999 was near the top of the ladder. Today there are half a dozen tiers above
          it. Measured directly: for cards from the original era, a Rare sold for about 32× a Common
          from the same era — for current cards it's about 2×. One global rarity factor can't
          represent both, and the set factor can't fix it either, since that shifts a whole set up or
          down without changing the ratio <em>between</em> rarities inside it. So rarity gets a
          second factor that depends on the era. Card type gets the same treatment, for the same
          reason (an old "EX" and a modern "ex" are written almost identically but priced worlds
          apart).
        </p>
        <p>
          This is applied narrowly on purpose. Combining every category with every other one would
          produce hundreds of thousands of combinations, nearly all backed by a single card —
          precision-looking numbers that are really just noise.
        </p>
      </section>

      {!data && <p className="muted">Loading factors…</p>}

      {data && (
        <>
          <section className="panel prose-panel">
            <h3>How well does it work?</h3>
            <ul className="stat-list">
              <li>
                <strong>{intFmt.format(data.model.cards)}</strong>
                <span>cards used for training</span>
              </li>
              <li>
                <strong>{(data.model.testR2 * 100).toFixed(0)}%</strong>
                <span>of price variation explained (R², on held-out cards)</span>
              </li>
              <li>
                <strong>{(data.model.medianError * 100).toFixed(0)}%</strong>
                <span>median error on cards the model never saw</span>
              </li>
            </ul>
            <p className="muted">
              A median error around a third sounds large, and it is — but it's the honest number, and
              it's measured on cards held out of training entirely. Card prices carry a lot of
              genuine noise (hype, print runs, a card suddenly becoming tournament-relevant) that no
              model reading only card attributes can predict. The point isn't to nail every price to
              the cent; it's to have a defensible reference to compare the market against.
            </p>
          </section>

          <section className="factor-grid">
            <FactorTable
              title="Most valuable Pokémon"
              note="Highest computed factors, among Pokémon with enough cards to be confident."
              rows={data.topPokemon}
            />
            <FactorTable
              title="Rarities"
              note="The base rarity factor, before the era correction below."
              rows={data.rarities}
            />
            <FactorTable
              title="Illustrators"
              note="Some artists' cards reliably sell above others, independent of what's on them."
              rows={data.topIllustrators}
            />
            <FactorTable
              title="Card types"
              note="Mechanic printed on the card, from TCGdex's suffix and stage fields."
              rows={data.cardTypes}
            />
            <FactorTable
              title={'"Rare" across the eras'}
              note="The clearest case for the rarity·era factor: the same word, worth 30× less today."
              rows={data.rarityAcrossEras}
            />
          </section>
        </>
      )}

      <section className="panel prose-panel">
        <h3>What the model doesn't know</h3>
        <p>
          Condition and language are <em>not</em> computed — they're reasonable assumptions you can
          adjust on each card page. Cardmarket doesn't publish prices split by grade or language, so
          there's no data to derive them from, and they're labelled as assumptions rather than
          dressed up as model output.
        </p>
        <p>
          It also can't see hype. If a card spikes because of a video or a tournament result, the
          model will call it overvalued — it only knows what's printed on the card, not what the
          community is currently excited about. Reverse-holo and 1st-Edition variants aren't modelled
          separately either; the source data isn't consistent enough across cards to trust.
        </p>
        <p className="muted">
          Not financial advice. This is a data-driven estimate, not a market oracle.
        </p>
      </section>
    </div>
  )
}
