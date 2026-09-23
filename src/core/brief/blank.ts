import type { ProductRecord } from '../types'

/**
 * An empty record.
 *
 * Every field starts blank on purpose. The compliance engine will light up with
 * blockers immediately, which is the correct state for a pack nobody has
 * specified yet — and it is the opposite of a tool that fills the gaps with
 * plausible-looking invention.
 */
export function blankRecord(): ProductRecord {
  return {
    brand: '',
    productName: '',
    market: 'GB',
    category: 'gb-food-supplement',
    panelType: 'gb-eu-nutrition',
    format: 'stand-up-pouch',
    stage: 'concept',
    formulationVersion: '',
    servingSize: '',
    servingsPerContainer: null,
    ingredients: [],
    claims: [],
    netQuantity: null,
    // Left blank: the statutory descriptor follows from the market, which
    // nobody has stated yet.
    statutoryName: '',
    directions: '',
    warnings: [],
    storage: '',
    allergenStatement: null,
    allergensConfirmedNone: false,
    responsibleParty: null,
    countryOfOrigin: null,
    gtin: null,
    registrationNumber: null,
    lotAndExpiryPanel: null,
    urlsOnPack: [],
    languages: ['en'],
  }
}
