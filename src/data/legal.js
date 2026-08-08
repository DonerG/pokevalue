/**
 * Impressum and privacy-policy text, in one place so the React pages
 * (src/pages/ImpressumPage.tsx, DatenschutzPage.tsx) and the static prerender
 * (scripts/prerender.mjs) render exactly the same wording — no drift between
 * what a visitor sees and what a JS-disabled crawler/authority sees.
 *
 * Plain JS on purpose: scripts/prerender.mjs imports it under bare Node.
 *
 * Structured as sections of heading + paragraphs so both renderers just map
 * over it. Wording reflects what the site actually does; it is a solid starting
 * template, not certified legal advice — have it reviewed before relying on it.
 *
 * @typedef {{ h?: string, p: string[] }} LegalSection
 * @typedef {{ title: string, description: string, sections: LegalSection[] }} LegalDoc
 */

const OPERATOR = 'Daniel Leitmann'
const ADDRESS = 'Jahnstraße 9, Salzburg, Austria'
const EMAIL = 'aureliacapital@gmx.at'
const UPDATED = '8 August 2026'

/** @type {LegalDoc} */
export const impressum = {
  title: 'Impressum',
  description: 'Legal information (Impressum) for PokéValue.',
  sections: [
    {
      h: 'Media owner and operator (§ 5 ECG, § 25 MedienG)',
      p: [OPERATOR, ADDRESS, `Email: ${EMAIL}`],
    },
    {
      h: 'Purpose of the site',
      p: [
        'PokéValue is a non-commercial hobby project. It estimates a “fair” price for Pokémon trading cards from a statistical model trained on publicly available market data, and compares it with the current market price. Nothing is sold on this site.',
      ],
    },
    {
      h: 'Trademarks and copyright',
      p: [
        'PokéValue is an unofficial fan project. It is not affiliated with, endorsed, sponsored, or approved by Nintendo, The Pokémon Company, Game Freak, or Cardmarket.',
        'Pokémon and all associated names and card images are trademarks and copyright of their respective owners. Card data and images are provided via TCGdex; price data originates from Cardmarket. All rights remain with the respective rights holders.',
      ],
    },
    {
      h: 'Liability for content',
      p: [
        'The price estimates shown here are model-based approximations. They are not investment advice and not a guarantee of any actual value or sale price. No liability is accepted for the accuracy, completeness, or timeliness of the information.',
      ],
    },
    {
      h: 'Liability for links',
      p: [
        'This site links to external websites (e.g. Cardmarket). We have no influence on their content and accept no liability for it; responsibility lies with their respective operators.',
      ],
    },
  ],
}

/** @type {LegalDoc} */
export const datenschutz = {
  title: 'Privacy Policy',
  description: 'How PokéValue handles data — hosting logs, cookieless analytics, and browser-only storage.',
  sections: [
    {
      h: 'Controller',
      p: [
        `${OPERATOR}, ${ADDRESS}. Email: ${EMAIL}.`,
        'This policy explains what personal data is processed when you use PokéValue (pokevalue.cards) and on what legal basis under the GDPR.',
      ],
    },
    {
      h: 'Hosting and server logs',
      p: [
        'The site is hosted by Vercel Inc. (USA), which also serves as its content delivery network. When you open the site, Vercel automatically processes technical connection data — including your IP address, the requested URL, date and time, referrer, and browser/user-agent — in order to deliver the site and keep it secure and stable.',
        'Legal basis: Art. 6(1)(f) GDPR (legitimate interest in operating the site securely and reliably). Processing may take place on servers in the USA; Vercel acts as a processor under a data processing agreement, with the EU Standard Contractual Clauses as the transfer safeguard.',
      ],
    },
    {
      h: 'Usage statistics',
      p: [
        'We use Vercel Web Analytics to understand how the site is used. It is privacy-friendly and cookieless: it sets no cookies, builds no cross-site profiles, and reports only aggregated figures such as page views. It does not store data that identifies you personally.',
        'In addition, when you add a card to your watchlist or portfolio, an anonymous event is counted that contains only the card’s identifier — no IP address, no device or user identifier, and no link to you. Only aggregate totals are stored (how often the feature is used, and which cards are saved most).',
        'Legal basis: Art. 6(1)(f) GDPR (legitimate interest in measuring and improving the service with minimal, aggregated data).',
      ],
    },
    {
      h: 'Data stored in your browser (no cookies)',
      p: [
        'PokéValue does not use cookies. Your watchlist, your portfolio (including any purchase and sale prices you enter), and your display preferences are stored solely in your browser’s local storage, on your own device. This data is never transmitted to us and stays under your control — you can delete it at any time via your browser settings.',
      ],
    },
    {
      h: 'Card images from third parties',
      p: [
        'Card images are loaded directly from TCGdex (assets.tcgdex.net). When your browser requests these images, your IP address is necessarily transmitted to that provider, which may use a content delivery network. We have no control over any processing carried out there; please refer to TCGdex’s own privacy information.',
      ],
    },
    {
      h: 'External links',
      p: [
        'The site links to external services such as Cardmarket. Once you follow such a link, the privacy policy of the respective provider applies; we are not responsible for their processing.',
      ],
    },
    {
      h: 'Retention',
      p: [
        'Server log data is retained only as long as necessary for delivery and security and is then deleted or anonymised in line with the host’s practices. The aggregate usage counters are anonymous and are not linked to individuals.',
      ],
    },
    {
      h: 'Your rights',
      p: [
        'Under the GDPR you have the right to access, rectification, erasure, restriction of processing, data portability, and to object to processing based on legitimate interests. To exercise these rights, contact us at ' + EMAIL + '.',
        'You also have the right to lodge a complaint with a supervisory authority. In Austria this is the Data Protection Authority (Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Vienna, dsb.gv.at).',
      ],
    },
    {
      h: 'Changes',
      p: [`This policy may be updated as the site changes. This version: ${UPDATED}.`],
    },
  ],
}
