import type { NetQuantityUnit } from './units'

/** Markets the engine has a rule profile for. One market, one label, one findings file. */
export type Market = 'GB' | 'EU' | 'US' | 'CA'

/** The legal category. Drives which panel is lawful — this is gate A0. */
export type LegalCategory =
  | 'gb-food-supplement'
  | 'eu-food-supplement'
  | 'us-dietary-supplement'
  | 'us-conventional-food'
  | 'ca-nhp'
  | 'unsettled'

export type PanelType =
  | 'gb-eu-nutrition'      // back-of-pack nutrition + "Food Supplement"
  | 'us-supplement-facts'
  | 'us-nutrition-facts'
  | 'ca-nhp-split'         // medicinal / non-medicinal
  | 'none'

/** Pack formats Supplement Factory actually fills. Not 5,000 mockups — the ones we make. */
export type PackFormat =
  | 'tuck-end-carton'
  | 'stand-up-pouch'
  | 'stick-pack'
  | 'jar-wrap-label'
  | 'bottle-wrap-label'

export type Stage = 'concept' | 'client-proof' | 'pre-press'

export type Severity = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'QUESTION'

export type Role =
  | 'design'
  | 'compliance-uk-eu'
  | 'us-regulatory'
  | 'formulation'
  | 'client'
  | 'account'
  | 'ops'

export interface Ingredient {
  name: string
  /** Amount per serving in the unit given. */
  amount: number | null
  unit: string
  /** true = active (goes in the Supplement Facts block), false = excipient / "other ingredients". */
  active: boolean
  /** EU Nutrient Reference Value key, where one exists — see panels/nrv.ts. */
  nrvKey?: string
  /** Branded/licensed ingredient, e.g. Cognizin®. Spelling and mark are checked. */
  branded?: { mark: '®' | '™'; licensor?: string; attributionRequired?: boolean }
  /** Present in the confirmed formulation at the brief's version string. */
  inFormulation?: boolean
}

export type ClaimKind =
  | 'authorised-health'    // GB/EU register
  | 'nutrition'            // "source of", "high in"
  | 'structure-function'   // US — needs the DSHEA disclaimer
  | 'disease'              // never lawful on a supplement
  | 'unclassified'

export interface Claim {
  text: string
  kind: ClaimKind
  /** Where it appears: front, back, carton, URL on pack, product name, imagery. */
  location: string
  /** For authorised claims: is the condition of use met at the dose per serving? */
  conditionsMet?: boolean | null
  /** Register entry / EFSA ID where the claim is authorised. */
  reference?: string
}

export interface NetQuantity {
  value: number
  unit: NetQuantityUnit
  /** The literal words on pack, e.g. "NET WT 30ML" — checked against the unit. */
  declaredAs: string
}

export interface Address {
  name: string
  lines: string[]
  country: string
}

export interface ProductRecord {
  brand: string
  productName: string
  market: Market
  category: LegalCategory
  panelType: PanelType
  format: PackFormat
  stage: Stage

  /** Exact formulation version string from the brief. A blank is a blocker. */
  formulationVersion: string
  servingSize: string
  servingsPerContainer: number | null
  ingredients: Ingredient[]
  claims: Claim[]

  netQuantity: NetQuantity | null
  statutoryName: string
  directions: string
  /** The warnings box contents, line by line. Storage text in here is a FAIL. */
  warnings: string[]
  storage: string
  allergenStatement: string | null
  allergensConfirmedNone: boolean

  responsibleParty: Address | null
  countryOfOrigin: string | null

  /** GTIN-13 (GB/EU) or UPC-A (US). Placeholders are caught. */
  gtin: string | null
  /** Health Canada NPN, or other registration. */
  registrationNumber: string | null
  lotAndExpiryPanel: { present: boolean; method: string } | null

  urlsOnPack: string[]
  languages: string[]
}

export interface Dimensions {
  /** All millimetres. Meaning varies by format — see each die line module. */
  width: number
  height: number
  depth: number
  /** Stand-up pouch bottom gusset, carton dust-flap depth, etc. */
  gusset?: number
  /** Cylinder diameter for jar / bottle wrap labels. */
  diameter?: number
  bleed: number
  safeMargin: number
  /** Glue/seal flap width. */
  flap?: number
  materialThickness?: number
}

export interface Finding {
  id: string
  /** A–E, matching claims-and-warning-check; S/P/D for the artwork-review passes. */
  area: string
  finding: string
  severity: Severity
  proposedFix: string
  owner: Role
  /** Why it matters, one line — this is what goes on the reviewer question sheet. */
  rationale: string
}
