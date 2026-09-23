import { expectedPanel } from '../compliance/markets'
import type { Ingredient, LegalCategory, Market, PackFormat, ProductRecord } from '../types'

/**
 * The operations that fill a product record.
 *
 * This is the tool-call surface from the architecture note: the deterministic
 * extractor and a language model both fill the record through exactly these
 * typed operations, so swapping one for the other changes nothing downstream.
 *
 * Every operation carries where the value came from. A value with no source is
 * not allowed in — that single rule is what stops the tool inventing a brand
 * name and an ingredient deck the way Packify did.
 */
export type RecordOp =
  | { op: 'setBrand'; value: string; source: string }
  | { op: 'setProductName'; value: string; source: string }
  | { op: 'setMarket'; value: Market; source: string }
  | { op: 'setFormat'; value: PackFormat; source: string }
  | { op: 'setNetQuantity'; value: number; unit: string; declaredAs: string; source: string }
  | { op: 'setServings'; value: number; source: string }
  | { op: 'setServingSize'; value: string; source: string }
  | { op: 'addIngredient'; value: Ingredient; source: string }
  | { op: 'setDimensions'; width?: number; height?: number; depth?: number; diameter?: number; source: string }

/** Something the record needs that the brief did not say. Never guessed. */
export interface Gap {
  field: string
  question: string
  /** Why it blocks, in one line — this is what the client sees. */
  why: string
  severity: 'required' | 'recommended'
}

export interface Extraction {
  ops: RecordOp[]
  gaps: Gap[]
  /** Phrases the extractor did not understand, echoed back rather than ignored. */
  unparsed: string[]
}

/** The category a supplement manufacturer's product takes in each market. */
function defaultCategory(m: Market): LegalCategory {
  switch (m) {
    case 'GB':
      return 'gb-food-supplement'
    case 'EU':
      return 'eu-food-supplement'
    case 'US':
      return 'us-dietary-supplement'
    case 'CA':
      return 'ca-nhp'
  }
}

/** The legal descriptor each market requires on the front panel. */
const STATUTORY_NAME: Record<Market, string> = {
  GB: 'Food Supplement',
  EU: 'Food Supplement',
  US: 'Dietary Supplement',
  CA: 'Natural Health Product',
}

export function applyOps(base: ProductRecord, ops: RecordOp[]): ProductRecord {
  const r: ProductRecord = { ...base, ingredients: [...base.ingredients], claims: [...base.claims] }
  const added: Ingredient[] = []

  for (const o of ops) {
    switch (o.op) {
      case 'setBrand':
        r.brand = o.value
        break
      case 'setProductName':
        r.productName = o.value
        break
      case 'setMarket': {
        // The market carries its own legal category, panel and statutory name.
        // These are not inventions — they are what the market requires, and
        // leaving them on a previous market's values would make the engine
        // report a fault the client never caused.
        r.market = o.value
        r.category = defaultCategory(o.value)
        r.panelType = expectedPanel(r.category) ?? 'none'
        r.statutoryName = STATUTORY_NAME[o.value]
        r.languages = o.value === 'CA' ? ['en', 'fr'] : ['en']
        break
      }
      case 'setFormat':
        r.format = o.value
        break
      case 'setNetQuantity':
        r.netQuantity = { value: o.value, unit: o.unit as never, declaredAs: o.declaredAs }
        break
      case 'setServings':
        r.servingsPerContainer = o.value
        break
      case 'setServingSize':
        r.servingSize = o.value
        break
      case 'addIngredient':
        added.push(o.value)
        break
      case 'setDimensions':
        break
    }
  }

  if (added.length) r.ingredients = added
  return r
}

export function dimensionOps(ops: RecordOp[]) {
  const d = ops.find((o) => o.op === 'setDimensions')
  return d && d.op === 'setDimensions' ? d : null
}
