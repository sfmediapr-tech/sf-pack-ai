import type { LegalCategory, Market, PanelType, Role } from '../types'

export interface MarketProfile {
  id: Market
  label: string
  /** Who rules on a finding in this market. UK/EU compliance does not cover the US. */
  reviewer: Role
  reviewerLabel: string
  categories: LegalCategory[]
  panels: PanelType[]
  /** The words that must appear as the statutory name. */
  statutoryNames: string[]
  requiredLanguages: string[]
  /** Barcode symbology expected at retail. */
  barcode: 'EAN-13' | 'UPC-A'
  /** Minimum x-height for mandatory particulars, millimetres. */
  minXHeightMm: number
  /** Minimum positive type size in points, from the printer guides. */
  minTypePt: number
  minReversedTypePt: number
  allergenFormat: string
  /** Statements that must be present somewhere on pack. */
  mandatoryStatements: { key: string; label: string; match: RegExp }[]
  /** Does this market need a registration number on pack? */
  registrationRequired: boolean
  registrationLabel?: string
  notes: string[]
}

const KEEP_OUT_OF_REACH = /keep\s+out\s+of\s+(the\s+)?reach\s+of\s+children/i
const NOT_A_SUBSTITUTE = /not\s+(be\s+)?(used\s+)?(as\s+)?a\s+substitute\s+for\s+a\s+(varied|balanced)/i
const DO_NOT_EXCEED = /(do\s+not\s+exceed|not\s+to\s+exceed)\s+.{0,30}(dose|dosage|recommended|daily|intake)/i

export const MARKETS: Record<Market, MarketProfile> = {
  GB: {
    id: 'GB',
    label: 'Great Britain',
    reviewer: 'compliance-uk-eu',
    reviewerLabel: 'UK/EU compliance',
    categories: ['gb-food-supplement'],
    panels: ['gb-eu-nutrition'],
    statutoryNames: ['food supplement'],
    requiredLanguages: ['en'],
    barcode: 'EAN-13',
    minXHeightMm: 1.2,
    minTypePt: 6,
    minReversedTypePt: 7,
    allergenFormat: 'Allergens emphasised within the ingredient list (bold or caps), plus "may contain" where cross-contact applies.',
    mandatoryStatements: [
      { key: 'no-substitute', label: '"Not a substitute for a varied and balanced diet"', match: NOT_A_SUBSTITUTE },
      { key: 'keep-out-of-reach', label: '"Keep out of reach of children"', match: KEEP_OUT_OF_REACH },
      { key: 'do-not-exceed', label: '"Do not exceed the recommended daily dose"', match: DO_NOT_EXCEED },
    ],
    registrationRequired: false,
    notes: [
      'Nutrition declaration is per portion with % NRV where an NRV exists.',
      'FBO name and a GB address must appear on pack — an EU-only address is not sufficient post-transition.',
    ],
  },
  EU: {
    id: 'EU',
    label: 'European Union',
    reviewer: 'compliance-uk-eu',
    reviewerLabel: 'UK/EU compliance',
    categories: ['eu-food-supplement'],
    panels: ['gb-eu-nutrition'],
    statutoryNames: ['food supplement', 'complément alimentaire', 'nahrungsergänzungsmittel'],
    requiredLanguages: ['en'],
    barcode: 'EAN-13',
    minXHeightMm: 1.2,
    minTypePt: 6,
    minReversedTypePt: 7,
    allergenFormat: 'Annex II allergens emphasised in the ingredient list, in the language(s) of the market of sale.',
    mandatoryStatements: [
      { key: 'no-substitute', label: '"Not a substitute for a varied and balanced diet"', match: NOT_A_SUBSTITUTE },
      { key: 'keep-out-of-reach', label: '"Keep out of reach of young children"', match: KEEP_OUT_OF_REACH },
      { key: 'do-not-exceed', label: '"Do not exceed the recommended daily dose"', match: DO_NOT_EXCEED },
    ],
    registrationRequired: false,
    notes: [
      'An EU responsible person and address are required; notification rules differ per member state.',
      'Language must match every member state of sale — one artwork rarely covers the whole EU.',
    ],
  },
  US: {
    id: 'US',
    label: 'United States',
    reviewer: 'us-regulatory',
    reviewerLabel: "a US regulatory consultant or the client's FSVP agent — not the UK/EU reviewer",
    categories: ['us-dietary-supplement', 'us-conventional-food'],
    panels: ['us-supplement-facts', 'us-nutrition-facts'],
    statutoryNames: ['dietary supplement'],
    requiredLanguages: ['en'],
    barcode: 'UPC-A',
    minXHeightMm: 1.6,
    minTypePt: 6,
    minReversedTypePt: 8,
    allergenFormat: 'FALCPA "Contains:" statement immediately following the ingredient list.',
    mandatoryStatements: [
      { key: 'keep-out-of-reach', label: '"Keep out of reach of children"', match: KEEP_OUT_OF_REACH },
    ],
    registrationRequired: false,
    notes: [
      'Structure/function claims require the DSHEA disclaimer in a box: "This statement has not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease."',
      'Dietary Supplement uses Supplement Facts. Conventional food uses Nutrition Facts and every functional ingredient must be GRAS for that use.',
      'Net quantity goes in the bottom 30% of the principal display panel, in both US customary and metric.',
    ],
  },
  CA: {
    id: 'CA',
    label: 'Canada',
    reviewer: 'us-regulatory',
    reviewerLabel: 'Canadian NHP regulatory reviewer',
    categories: ['ca-nhp'],
    panels: ['ca-nhp-split'],
    statutoryNames: ['natural health product', 'produit de santé naturel'],
    requiredLanguages: ['en', 'fr'],
    barcode: 'EAN-13',
    minXHeightMm: 1.6,
    minTypePt: 6,
    minReversedTypePt: 8,
    allergenFormat: '"Contains:" statement in both English and French.',
    mandatoryStatements: [
      { key: 'keep-out-of-reach', label: '"Keep out of reach of children / Garder hors de la portée des enfants"', match: KEEP_OUT_OF_REACH },
    ],
    registrationRequired: true,
    registrationLabel: 'NPN (Natural Product Number)',
    notes: [
      'All mandatory text must be bilingual English/French.',
      'Medicinal and non-medicinal ingredients are declared separately.',
      'An NPN must be the real issued number — a placeholder is a blocker.',
    ],
  },
}

/** Which panel type is lawful for a given category. */
export function expectedPanel(category: LegalCategory): PanelType | null {
  switch (category) {
    case 'gb-food-supplement':
    case 'eu-food-supplement':
      return 'gb-eu-nutrition'
    case 'us-dietary-supplement':
      return 'us-supplement-facts'
    case 'us-conventional-food':
      return 'us-nutrition-facts'
    case 'ca-nhp':
      return 'ca-nhp-split'
    case 'unsettled':
      return null
  }
}

export function categoryBelongsToMarket(category: LegalCategory, market: Market): boolean {
  return MARKETS[market].categories.includes(category)
}
