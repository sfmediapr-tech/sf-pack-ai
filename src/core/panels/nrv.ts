/**
 * EU / GB Nutrient Reference Values (Annex XIII, Regulation 1169/2011), as used
 * for the % NRV column on a food supplement's nutrition declaration.
 *
 * Values are adult NRVs. Where no NRV is established the panel must carry a
 * dagger and the "NRV not established" footnote instead of a percentage.
 */
export interface NrvEntry {
  key: string
  label: string
  nrv: number
  unit: 'mg' | 'µg' | 'g'
  /** 15% of NRV per 100 g/ml is the "source of" threshold; 30% is "high in". */
  claimable: boolean
}

export const NRV: Record<string, NrvEntry> = {
  'vitamin-a':    { key: 'vitamin-a',    label: 'Vitamin A',        nrv: 800,  unit: 'µg', claimable: true },
  'vitamin-d':    { key: 'vitamin-d',    label: 'Vitamin D',        nrv: 5,    unit: 'µg', claimable: true },
  'vitamin-e':    { key: 'vitamin-e',    label: 'Vitamin E',        nrv: 12,   unit: 'mg', claimable: true },
  'vitamin-k':    { key: 'vitamin-k',    label: 'Vitamin K',        nrv: 75,   unit: 'µg', claimable: true },
  'vitamin-c':    { key: 'vitamin-c',    label: 'Vitamin C',        nrv: 80,   unit: 'mg', claimable: true },
  thiamin:        { key: 'thiamin',      label: 'Thiamin (B1)',     nrv: 1.1,  unit: 'mg', claimable: true },
  riboflavin:     { key: 'riboflavin',   label: 'Riboflavin (B2)',  nrv: 1.4,  unit: 'mg', claimable: true },
  niacin:         { key: 'niacin',       label: 'Niacin (B3)',      nrv: 16,   unit: 'mg', claimable: true },
  'vitamin-b6':   { key: 'vitamin-b6',   label: 'Vitamin B6',       nrv: 1.4,  unit: 'mg', claimable: true },
  folate:         { key: 'folate',       label: 'Folic acid',       nrv: 200,  unit: 'µg', claimable: true },
  'vitamin-b12':  { key: 'vitamin-b12',  label: 'Vitamin B12',      nrv: 2.5,  unit: 'µg', claimable: true },
  biotin:         { key: 'biotin',       label: 'Biotin',           nrv: 50,   unit: 'µg', claimable: true },
  'pantothenic':  { key: 'pantothenic',  label: 'Pantothenic acid', nrv: 6,    unit: 'mg', claimable: true },
  potassium:      { key: 'potassium',    label: 'Potassium',        nrv: 2000, unit: 'mg', claimable: true },
  chloride:       { key: 'chloride',     label: 'Chloride',         nrv: 800,  unit: 'mg', claimable: true },
  calcium:        { key: 'calcium',      label: 'Calcium',          nrv: 800,  unit: 'mg', claimable: true },
  phosphorus:     { key: 'phosphorus',   label: 'Phosphorus',       nrv: 700,  unit: 'mg', claimable: true },
  magnesium:      { key: 'magnesium',    label: 'Magnesium',        nrv: 375,  unit: 'mg', claimable: true },
  iron:           { key: 'iron',         label: 'Iron',             nrv: 14,   unit: 'mg', claimable: true },
  zinc:           { key: 'zinc',         label: 'Zinc',             nrv: 10,   unit: 'mg', claimable: true },
  copper:         { key: 'copper',       label: 'Copper',           nrv: 1,    unit: 'mg', claimable: true },
  manganese:      { key: 'manganese',    label: 'Manganese',        nrv: 2,    unit: 'mg', claimable: true },
  fluoride:       { key: 'fluoride',     label: 'Fluoride',         nrv: 3.5,  unit: 'mg', claimable: true },
  selenium:       { key: 'selenium',     label: 'Selenium',         nrv: 55,   unit: 'µg', claimable: true },
  chromium:       { key: 'chromium',     label: 'Chromium',         nrv: 40,   unit: 'µg', claimable: true },
  molybdenum:     { key: 'molybdenum',   label: 'Molybdenum',       nrv: 50,   unit: 'µg', claimable: true },
  iodine:         { key: 'iodine',       label: 'Iodine',           nrv: 150,  unit: 'µg', claimable: true },
}

const TO_MG: Record<string, number> = { g: 1000, mg: 1, 'µg': 0.001, mcg: 0.001, ug: 0.001 }

/** Returns % of NRV, or null when there is no NRV for that nutrient. */
export function percentNrv(nrvKey: string | undefined, amount: number | null, unit: string): number | null {
  if (!nrvKey || amount === null) return null
  const entry = NRV[nrvKey]
  if (!entry) return null
  const factorIn = TO_MG[unit.trim()]
  const factorRef = TO_MG[entry.unit]
  if (factorIn === undefined || factorRef === undefined) return null
  const amountMg = amount * factorIn
  const nrvMg = entry.nrv * factorRef
  if (nrvMg <= 0) return null
  return (amountMg / nrvMg) * 100
}

/** EU rounding convention for the % NRV column. */
export function formatNrvPercent(pct: number | null): string {
  if (pct === null) return '†'
  if (pct < 0.5) return '<1%'
  if (pct >= 100) return `${Math.round(pct)}%`
  return `${pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct)}%`
}

export function nrvOptions(): NrvEntry[] {
  return Object.values(NRV).sort((a, b) => a.label.localeCompare(b.label))
}
