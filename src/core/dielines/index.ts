import type { Dimensions, PackFormat } from '../types'
import type { Dieline } from './svg'
import { standUpPouch } from './standUpPouch'
import { stickPack } from './stickPack'
import { tuckEndCarton } from './tuckEndCarton'
import { wrapLabel } from './wrapLabel'

export * from './svg'
export { standUpPouch, stickPack, tuckEndCarton, wrapLabel }

export interface FormatMeta {
  id: PackFormat
  label: string
  blurb: string
  /** Which dimension fields the UI should show, and what to call them here. */
  fields: { key: keyof Dimensions; label: string; min: number; max: number; step: number }[]
  defaults: Dimensions
}

const BLEED_SAFE = { bleed: 3, safeMargin: 4 }

export const FORMATS: FormatMeta[] = [
  {
    id: 'tuck-end-carton',
    label: 'Tuck-end carton',
    blurb: 'Folding carton for bottles, blisters or a pouch in an outer. Reverse tuck by default.',
    fields: [
      { key: 'width', label: 'Width (front face)', min: 20, max: 300, step: 1 },
      { key: 'height', label: 'Height', min: 30, max: 400, step: 1 },
      { key: 'depth', label: 'Depth', min: 10, max: 200, step: 1 },
      { key: 'flap', label: 'Glue flap', min: 8, max: 30, step: 1 },
      { key: 'materialThickness', label: 'Board caliper', min: 0.2, max: 1.2, step: 0.05 },
      { key: 'bleed', label: 'Bleed', min: 0, max: 10, step: 0.5 },
      { key: 'safeMargin', label: 'Safe margin', min: 0, max: 15, step: 0.5 },
    ],
    defaults: { width: 60, height: 120, depth: 60, flap: 15, materialThickness: 0.4, ...BLEED_SAFE },
  },
  {
    id: 'stand-up-pouch',
    label: 'Stand-up pouch',
    blurb: 'Doypack for powders. Side seals, bottom gusset, zipper and tear notch are all dead zones.',
    fields: [
      { key: 'width', label: 'Face width', min: 60, max: 400, step: 1 },
      { key: 'height', label: 'Face height', min: 80, max: 500, step: 1 },
      { key: 'gusset', label: 'Gusset (half)', min: 10, max: 80, step: 1 },
      { key: 'bleed', label: 'Bleed', min: 0, max: 10, step: 0.5 },
      { key: 'safeMargin', label: 'Safe margin', min: 0, max: 15, step: 0.5 },
    ],
    defaults: { width: 188, height: 260, depth: 80, gusset: 40, ...BLEED_SAFE },
  },
  {
    id: 'stick-pack',
    label: 'Stick pack / sachet',
    blurb: 'Single-serve VFFS stick. The narrow face is the constraint — most copy has to go on an outer.',
    fields: [
      { key: 'width', label: 'Face width', min: 15, max: 120, step: 1 },
      { key: 'height', label: 'Pack length', min: 50, max: 250, step: 1 },
      { key: 'bleed', label: 'Bleed', min: 0, max: 10, step: 0.5 },
      { key: 'safeMargin', label: 'Safe margin', min: 0, max: 10, step: 0.5 },
    ],
    defaults: { width: 30, height: 120, depth: 8, ...BLEED_SAFE },
  },
  {
    id: 'jar-wrap-label',
    label: 'Jar wrap label',
    blurb: 'Pressure-sensitive wrap for an HDPE capsule jar. Overlap zone must stay clear of the barcode.',
    fields: [
      { key: 'diameter', label: 'Jar diameter', min: 30, max: 160, step: 1 },
      { key: 'height', label: 'Label height', min: 20, max: 250, step: 1 },
      { key: 'bleed', label: 'Bleed', min: 0, max: 10, step: 0.5 },
      { key: 'safeMargin', label: 'Safe margin', min: 0, max: 15, step: 0.5 },
    ],
    defaults: { width: 75, height: 90, depth: 75, diameter: 75, ...BLEED_SAFE },
  },
  {
    id: 'bottle-wrap-label',
    label: 'Bottle wrap label',
    blurb: 'Wrap for a liquid bottle. Same maths, taller and narrower — watch the applicator limits.',
    fields: [
      { key: 'diameter', label: 'Bottle diameter', min: 20, max: 120, step: 1 },
      { key: 'height', label: 'Label height', min: 20, max: 250, step: 1 },
      { key: 'bleed', label: 'Bleed', min: 0, max: 10, step: 0.5 },
      { key: 'safeMargin', label: 'Safe margin', min: 0, max: 15, step: 0.5 },
    ],
    defaults: { width: 50, height: 110, depth: 50, diameter: 50, ...BLEED_SAFE },
  },
]

export function formatMeta(id: PackFormat): FormatMeta {
  const f = FORMATS.find((x) => x.id === id)
  if (!f) throw new Error(`Unknown pack format: ${id}`)
  return f
}

/** Single entry point: format + dimensions in, die line out. */
export function buildDieline(format: PackFormat, dims: Dimensions): Dieline {
  switch (format) {
    case 'tuck-end-carton':
      return tuckEndCarton(dims, 'reverse')
    case 'stand-up-pouch':
      return standUpPouch(dims, { zipper: true, tearNotch: true })
    case 'stick-pack':
      return stickPack(dims, {})
    case 'jar-wrap-label':
      return wrapLabel(dims, { overlap: 3, cornerRadius: 3 })
    case 'bottle-wrap-label':
      return wrapLabel(dims, { overlap: 3, cornerRadius: 2 })
  }
}
