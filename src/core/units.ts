/**
 * Units. Everything inside the engine is millimetres, because every die line and
 * printer guide Supplement Factory works to is in millimetres. Points exist only
 * at the SVG/PDF boundary.
 */

export const MM_PER_IN = 25.4
export const PT_PER_IN = 72

export const mmToPt = (mm: number) => (mm / MM_PER_IN) * PT_PER_IN
export const ptToMm = (pt: number) => (pt / PT_PER_IN) * MM_PER_IN
export const mmToPx = (mm: number, dpi = 96) => (mm / MM_PER_IN) * dpi

/** Round to 0.01 mm — finer than any press can hold, coarse enough to kill float noise. */
export const r2 = (n: number) => Math.round(n * 100) / 100

export const fmtMm = (n: number) => `${r2(n)} mm`

/**
 * Net quantity units, split by the kind of measure. Finding #9 in
 * claims-and-warning-check: "NET WT 30ML" is a FAIL because weight was declared
 * with a volume unit. The engine has to know which is which to catch that.
 */
export const WEIGHT_UNITS = ['g', 'kg', 'mg', 'oz', 'lb'] as const
export const VOLUME_UNITS = ['ml', 'l', 'fl oz'] as const
export const COUNT_UNITS = ['capsules', 'tablets', 'sachets', 'servings', 'sticks', 'gummies'] as const

export type WeightUnit = (typeof WEIGHT_UNITS)[number]
export type VolumeUnit = (typeof VOLUME_UNITS)[number]
export type CountUnit = (typeof COUNT_UNITS)[number]
export type NetQuantityUnit = WeightUnit | VolumeUnit | CountUnit

export type MeasureKind = 'weight' | 'volume' | 'count'

export function measureKind(unit: string): MeasureKind | null {
  const u = unit.trim().toLowerCase()
  if ((WEIGHT_UNITS as readonly string[]).includes(u)) return 'weight'
  if ((VOLUME_UNITS as readonly string[]).includes(u)) return 'volume'
  if ((COUNT_UNITS as readonly string[]).includes(u)) return 'count'
  return null
}

/** "NET WT", "NET WEIGHT", "e" etc. imply a weight declaration. */
const WEIGHT_DESCRIPTORS = [/\bnet\s*wt\b/i, /\bnet\s*weight\b/i, /\bweight\b/i]
const VOLUME_DESCRIPTORS = [/\bnet\s*vol\b/i, /\bvolume\b/i, /\bfl\.?\s*oz\b/i]

export function descriptorImplies(descriptor: string): MeasureKind | null {
  if (WEIGHT_DESCRIPTORS.some((re) => re.test(descriptor))) return 'weight'
  if (VOLUME_DESCRIPTORS.some((re) => re.test(descriptor))) return 'volume'
  return null
}
