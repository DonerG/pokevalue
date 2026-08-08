import { impressum, datenschutz } from '../data/legal.js'
import { useDocumentMeta } from '../logic/documentMeta'

interface LegalDoc {
  title: string
  description: string
  sections: { h?: string; p: string[] }[]
}

function LegalPage({ doc, path }: { doc: LegalDoc; path: string }) {
  useDocumentMeta(doc.title, doc.description, path, null)
  return (
    <div className="legal-page">
      <h1>{doc.title}</h1>
      {doc.sections.map((s, i) => (
        <section key={i}>
          {s.h && <h2>{s.h}</h2>}
          {s.p.map((para, j) => (
            <p key={j}>{para}</p>
          ))}
        </section>
      ))}
    </div>
  )
}

export function ImpressumPage() {
  return <LegalPage doc={impressum as LegalDoc} path="/impressum" />
}

export function DatenschutzPage() {
  return <LegalPage doc={datenschutz as LegalDoc} path="/datenschutz" />
}
