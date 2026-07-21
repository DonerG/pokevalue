# PokéPreis – Kartenwert-Rechner

Eine Website, die für Pokémon-Karten einen fairen Preis nach einer transparenten Formel berechnet und ihn mit dem aktuellen Cardmarket-Preis vergleicht — pro Karte vorbelegt, Set für Set erweiterbar.

## Funktionen

- **Karten-Datenbank:** Sets durchstöbern, jede Karte mit Bild, fairem Preis, Cardmarket-Trendpreis und Urteil („über-/unter-/fair bewertet“). Suche und Sortierung (z. B. unterbewertete zuerst).
- **Kartenseite:** Seltenheit, Ära, Beliebtheit und Angebot sind aus den Kartendaten voreingestellt; du wählst nur Zustand, Sprache und Auflage deines Exemplars — heraus kommt ein konkreter Preis.
- **Freier Rechner:** Bewertung beliebiger Karten ohne Datenbankeintrag.
- **Experten-Modus:** Alle Multiplikatoren, der Anker und die Schwellen sind anpassbar (gespeichert im Browser).

## Die Formel

```
Basiswert    = Anker × Seltenheit × Ära × Beliebtheit × Angebot     (fix pro Karte)
Fairer Preis = Basiswert × Zustand × Sprache × Auflage               (dein Exemplar)
Score        = logarithmische Lage des Basiswerts auf 0–100
```

Multiplikativ, weil sich Kartenpreise über Größenordnungen verteilen. Urteil: Abweichung des Marktpreises vom fairen Preis über/unter den Schwellen (Standard ±20 %).

## Entwicklung

```bash
npm install
npm run dev              # Dev-Server auf http://localhost:5173
npm run build            # Produktions-Build nach dist/
npm run ingest me05 me04 # Set(s) von TCGdex importieren/aktualisieren
```

Stack: React 19 + TypeScript + Vite, keine weiteren Laufzeit-Abhängigkeiten. Kartendaten und Cardmarket-Preise von der freien [TCGdex-API](https://tcgdex.dev) (Set-IDs z. B. `me05`; Liste: https://api.tcgdex.net/v2/en/sets). Der Import schreibt JSON nach `src/data/generated/` — neue Sets erscheinen automatisch in der App, einfach committen.

## Deployment (GitHub + Vercel)

1. Repository auf GitHub anlegen und pushen.
2. Auf [vercel.com](https://vercel.com) „Import Project“ → GitHub-Repo wählen. Vercel erkennt Vite automatisch (Build `npm run build`, Output `dist`).
3. Ab dann wird jeder Push automatisch deployed. Preise aktualisieren = `npm run ingest …` laufen lassen und committen (später automatisierbar per GitHub Action mit Cron).

## Projektstruktur

```
scripts/ingest.mjs        Import von TCGdex (Karten, Preise, Faktor-Presets)
src/
  data/defaults.ts        Faktoren, Optionen, Default-Multiplikatoren
  data/cards.ts           Zugriff auf importierte Sets/Karten
  data/generated/         importierte Kartendaten (JSON, committen!)
  logic/pricing.ts        Preisformel, Score, Urteil, Formatierung
  logic/storage.ts        localStorage-Persistenz der Konfiguration
  components/             Faktor-Gruppen, Ergebnis-Panel, Experten-Modus, Chips
  pages/                  Startseite, Set-Seite, Karten-Seite, freier Rechner
  router.ts               Hash-Router (#/set/…, #/karte/…, #/rechner)
```

## Hinweise

Inoffizielles Fanprojekt — nicht von Nintendo, Game Freak oder The Pokémon Company unterstützt. Pokémon-Namen und Kartenbilder sind Eigentum ihrer Rechteinhaber. Keine Anlageberatung; die Formel ist ein anpassbares Modell, kein Marktorakel.
