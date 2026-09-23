import type { ProductRecord } from './core/types'
import type { BrandKit } from './three/artwork'

/**
 * Two starting records. Both brands are invented — this file ships in a public
 * build, so no real customer appears in it.
 *
 * `CLEAN_GB` passes. `FAULTY_GB` carries the faults from the lessons list in
 * docs/workflow-map.md — the net-weight-in-millilitres declaration, the
 * warnings box holding only storage text, the placeholder barcode, the
 * trademark spelled two ways. Loading it is the fastest way to see what the
 * compliance engine actually catches.
 */

export const CLEAN_GB: ProductRecord = {
  brand: 'Meridian',
  productName: 'Daily Magnesium',
  market: 'GB',
  category: 'gb-food-supplement',
  panelType: 'gb-eu-nutrition',
  format: 'jar-wrap-label',
  stage: 'client-proof',

  formulationVersion: 'FORM-2291 rev C',
  servingSize: '2 capsules',
  servingsPerContainer: 30,
  ingredients: [
    { name: 'Magnesium (as magnesium bisglycinate)', amount: 187.5, unit: 'mg', active: true, nrvKey: 'magnesium', inFormulation: true },
    { name: 'Vitamin B6 (as pyridoxal-5-phosphate)', amount: 1.4, unit: 'mg', active: true, nrvKey: 'vitamin-b6', inFormulation: true },
    { name: 'Zinc (as zinc bisglycinate)', amount: 7.5, unit: 'mg', active: true, nrvKey: 'zinc', inFormulation: true },
    { name: 'Hydroxypropyl methylcellulose (capsule shell)', amount: null, unit: '', active: false, inFormulation: true },
    { name: 'Rice flour', amount: null, unit: '', active: false, inFormulation: true },
  ],
  claims: [
    {
      text: 'Magnesium contributes to a reduction of tiredness and fatigue',
      kind: 'authorised-health',
      location: 'front panel',
      conditionsMet: true,
      reference: 'EU Register ID 244',
    },
    {
      text: 'Zinc contributes to the normal function of the immune system',
      kind: 'authorised-health',
      location: 'back panel',
      conditionsMet: true,
      reference: 'EU Register ID 291',
    },
  ],

  netQuantity: { value: 33, unit: 'g', declaredAs: 'NET WT 33 g ℮ (60 capsules)' },
  statutoryName: 'Food Supplement',
  directions: 'Take 2 capsules per day with food. Do not exceed the recommended daily dose.',
  warnings: [
    'Do not exceed the recommended daily dose.',
    'Food supplements should not be used as a substitute for a varied and balanced diet and a healthy lifestyle.',
    'Keep out of reach of children.',
    'Consult your doctor if pregnant, breastfeeding or taking medication.',
  ],
  storage: 'Store in a cool, dry place away from direct sunlight.',
  allergenStatement: 'No declarable allergens. Packed in a facility that also handles milk and soya.',
  allergensConfirmedNone: false,

  responsibleParty: {
    name: 'Meridian Nutrition Ltd',
    lines: ['Unit 7, Bankside Industrial Estate', 'Falkirk FK2 7XY'],
    country: 'United Kingdom',
  },
  countryOfOrigin: 'United Kingdom',

  gtin: '5060442920019',
  registrationNumber: null,
  lotAndExpiryPanel: { present: true, method: 'Inkjet, base of jar, unvarnished 34 × 6 mm area' },

  urlsOnPack: ['meridiannutrition.co.uk'],
  languages: ['en'],
}

export const FAULTY_GB: ProductRecord = {
  ...CLEAN_GB,
  brand: 'Northgate',
  productName: 'Immune Performance Complex',
  format: 'stand-up-pouch',
  stage: 'client-proof',

  formulationVersion: '',
  servingsPerContainer: null,
  ingredients: [
    { name: 'Citicoline (Cognizin)', amount: 250, unit: 'mg', active: true, inFormulation: true, branded: { mark: '®', attributionRequired: true } },
    { name: 'Citicoline (Cogitzin)', amount: 250, unit: 'mg', active: true, inFormulation: false, branded: { mark: '®' } },
    { name: 'Magnesium malate', amount: null, unit: 'mg', active: true, nrvKey: 'magnesium', inFormulation: true },
    { name: 'Vitamin D3', amount: 25, unit: 'µg', active: true, nrvKey: 'vitamin-d', inFormulation: true },
    { name: 'Natural flavouring', amount: null, unit: '', active: false, inFormulation: true },
  ],
  claims: [
    { text: 'Supports immune defence against colds and flu', kind: 'disease', location: 'front panel' },
    { text: 'Boosts mental performance', kind: 'unclassified', location: 'front panel' },
    { text: 'Vitamin D contributes to normal muscle function', kind: 'authorised-health', location: 'back panel', conditionsMet: false },
  ],

  netQuantity: { value: 300, unit: 'ml', declaredAs: 'NET WT 300ML' },
  statutoryName: 'Performance Blend',
  directions: 'Mix one scoop with water.',
  warnings: ['Store in a cool, dry place.', 'Keep away from direct sunlight.'],
  storage: '',
  allergenStatement: null,
  allergensConfirmedNone: false,

  responsibleParty: { name: 'Northgate Labs', lines: ['Dublin'], country: 'Ireland' },
  gtin: 'XXXXXXXXXXXXX',
  registrationNumber: null,
  lotAndExpiryPanel: null,
  urlsOnPack: ['northgatelabs.com', 'northgatelbs.com'],
  languages: ['en'],
}

export const KITS: Record<string, BrandKit> = {
  'Premium dark': {
    primary: '#0E3B2E',
    secondary: '#F4F1E8',
    accent: '#9E7C2B',
    ink: '#101418',
    paper: '#FFFFFF',
    displayFont: '700 {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    bodyFont: '{weight} {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    style: 'premium-dark',
  },
  Clinical: {
    primary: '#12395F',
    secondary: '#FFFFFF',
    accent: '#2E8BC0',
    ink: '#0B1B2B',
    paper: '#FFFFFF',
    displayFont: '700 {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    bodyFont: '{weight} {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    style: 'clinical',
  },
  Performance: {
    primary: '#111213',
    secondary: '#F5F5F5',
    accent: '#D7FF3E',
    ink: '#111213',
    paper: '#FFFFFF',
    displayFont: '800 {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    bodyFont: '{weight} {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    style: 'performance',
  },
  Botanical: {
    primary: '#3F6B4A',
    secondary: '#F7F3E8',
    accent: '#B07A3C',
    ink: '#23301F',
    paper: '#FFFDF8',
    displayFont: '600 {size}px Georgia, "Times New Roman", serif',
    bodyFont: '{weight} {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
    style: 'botanical',
  },
}
