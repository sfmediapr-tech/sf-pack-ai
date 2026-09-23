import type { PackFormat, ProductRecord } from '../types'

/**
 * Building the image prompt.
 *
 * The single most important thing in this file is what it asks for: a **flat
 * surface graphic**, not a pack and not a product photo.
 *
 * Ask an image model for "a supplement pouch" and you get a photograph of a
 * pouch — beautiful, with invented branding, invented claims and no die line.
 * That is the failure mode of every AI packaging tool on the market. Ask
 * instead for the decorative surface only, with text explicitly excluded, and
 * you get something that can be mapped onto geometry this codebase computed,
 * underneath type this codebase set from a record a human supplied.
 *
 * The model contributes texture and mood. It never contributes a word.
 */

export interface ConceptBrief {
  prompt: string
  negativePrompt: string
  /** Width and height to request, close to the printed face's aspect. */
  size: { width: number; height: number }
  /** Echoed back to the UI so a person can see exactly what was asked for. */
  summary: string
}

type Style = 'clinical' | 'performance' | 'botanical' | 'premium-dark'

const STYLE_DIRECTION: Record<Style, string> = {
  clinical:
    'precise geometric linework, generous negative space, cool and exact, the visual language of a laboratory data sheet',
  performance:
    'bold angular forms with a strong diagonal, high contrast, kinetic energy, the visual language of sports equipment',
  botanical:
    'fine botanical line illustration of leaves and stems, hand-drawn quality, organic asymmetry, the visual language of an apothecary',
  'premium-dark':
    'restrained minimal composition, subtle paper and foil texture, a single quiet focal motif, the visual language of fine spirits packaging',
}

/** What the surface has to survive once it is on a real pack. */
const SURFACE_RULES = [
  'flat two-dimensional artwork viewed straight on',
  'evenly lit with no cast shadows and no perspective',
  'the centre kept calm and uncluttered so type can sit over it',
  'detail concentrated toward the edges and corners',
]

/**
 * Everything that must not appear. Text is first for a reason: every word on
 * the finished pack is set from the product record, so generated lettering
 * would be both wrong and unlawful.
 */
const FORBIDDEN = [
  'text', 'letters', 'words', 'numbers', 'typography', 'lettering', 'captions', 'labels',
  'logos', 'wordmarks', 'watermarks', 'signatures',
  'packaging', 'pouch', 'bottle', 'jar', 'box', 'carton', 'sachet', 'product mockup',
  'photograph of a product', 'hands', 'people', 'faces',
  'drop shadows', 'perspective', '3d render', 'bevels', 'glossy highlights',
  'borders', 'frames',
]

const FACE_ASPECT: Record<PackFormat, [number, number]> = {
  'tuck-end-carton': [1, 2],
  'stand-up-pouch': [3, 4],
  'stick-pack': [1, 4],
  'jar-wrap-label': [3, 2],
  'bottle-wrap-label': [3, 2],
}

/** One clause becomes one sentence: leading capital, closing full stop. */
const sentence = (s: string) => {
  const t = s.trim().replace(/\.*$/, '')
  return t ? t[0].toUpperCase() + t.slice(1) + '.' : ''
}

/** Round to a multiple of 32, which every diffusion model is happier with. */
const snap = (n: number) => Math.max(512, Math.round(n / 32) * 32)

function sizeFor(format: PackFormat, budget = 1_200_000): { width: number; height: number } {
  const [aw, ah] = FACE_ASPECT[format]
  const k = Math.sqrt(budget / (aw * ah))
  return { width: snap(aw * k), height: snap(ah * k) }
}

export interface ConceptInput {
  record: ProductRecord
  palette: { primary: string; secondary: string; accent: string }
  style: Style
  /** Anything the client typed that should steer the look. Optional. */
  direction?: string
}

export function buildConceptBrief(i: ConceptInput): ConceptBrief {
  const { record: r, palette, style } = i

  // Subject matter comes from the record, never from the model's imagination.
  const actives = r.ingredients.filter((x) => x.active).map((x) => x.name)
  const subject = actives.length
    ? `a supplement containing ${actives.slice(0, 3).join(', ')}`
    : 'a nutritional supplement'

  const parts = [
    'A flat decorative surface pattern for printed packaging.',
    STYLE_DIRECTION[style],
    `Evoking ${subject}, without depicting the product or its container`,
    `Colour palette strictly limited to ${palette.primary}, ${palette.secondary} and ${palette.accent}`,
    ...SURFACE_RULES,
    i.direction?.trim() ?? '',
    'Print-quality, suitable for offset lithography',
  ].filter(Boolean)

  return {
    prompt: parts.map(sentence).join(' '),
    negativePrompt: FORBIDDEN.join(', '),
    size: sizeFor(r.format),
    summary:
      `A ${style.replace('-', ' ')} surface graphic in ${palette.primary} / ${palette.accent}, ` +
      `with no text — every word on the pack is set from your record.`,
  }
}
