import type { Dimensions } from '../types'
import { r2 } from '../units'
import { type Dieline, type Panel, type Shape, line, rect } from './svg'

export interface WrapOptions {
  /** Overlap where the label's trailing edge sticks over its leading edge. */
  overlap?: number
  /** Corner radius on the label. */
  cornerRadius?: number
  /** Shrink sleeve rather than a pressure-sensitive wrap. */
  shrink?: boolean
  /** Extra width a shrink sleeve needs before it is shrunk down. */
  shrinkRelaxation?: number
}

/**
 * Wrap-around label for an HDPE jar or a bottle, or a shrink sleeve.
 *
 * Label width = π × diameter + overlap. That overlap zone is the one place on a
 * wrap label where artwork is guaranteed to be hidden or doubled, so nothing
 * legible may sit in it — including the barcode, which is the classic mistake.
 */
export function wrapLabel(d: Dimensions, o: WrapOptions = {}): Dieline {
  const dia = d.diameter ?? d.width
  const H = d.height
  const b = d.bleed
  const safe = d.safeMargin
  const overlap = o.overlap ?? 3
  const radius = o.cornerRadius ?? 2
  const relax = o.shrink ? (o.shrinkRelaxation ?? 0) : 0

  const circumference = Math.PI * dia
  const labelW = circumference + overlap + relax
  const sheetW = labelW + b * 2
  const sheetH = H + b * 2

  const ox = b
  const oy = b

  const shapes: Shape[] = []
  const warnings: string[] = []
  const notes: string[] = []

  shapes.push(rect('BLEED', 0, 0, sheetW, sheetH, 'bleed extent'))
  shapes.push({ kind: 'rect', layer: 'CUT', x: ox, y: oy, w: labelW, h: H, rx: radius, label: 'label outline' })

  // Overlap zone sits at the trailing edge.
  shapes.push(rect('GLUE', ox + labelW - overlap, oy, overlap, H, 'overlap — nothing legible here'))
  shapes.push(line('CREASE', ox + labelW - overlap, oy, ox + labelW - overlap, oy + H, 'overlap start'))

  // Safe area, held clear of the overlap as well as the trim.
  shapes.push(rect('SAFE', ox + safe, oy + safe, labelW - overlap - safe * 2, H - safe * 2, 'safe area'))

  // Quarter marks tell the designer where the front face actually lands on the jar.
  for (let i = 1; i < 4; i++) {
    const x = ox + (circumference * i) / 4
    shapes.push(line('DIMENSIONS', x, oy, x, oy + 4, `${i * 90}°`))
    shapes.push(line('DIMENSIONS', x, oy + H - 4, x, oy + H))
  }
  // Roughly the visible front of a cylinder is the middle ~120°.
  const frontW = (circumference * 120) / 360
  const frontX = ox + circumference / 2 - frontW / 2
  shapes.push(rect('DIMENSIONS', frontX, oy + safe, frontW, H - safe * 2, 'front face — visible at shelf'))

  const panels: Panel[] = [
    { id: 'wrap', label: o.shrink ? 'SLEEVE' : 'WRAP', x: ox, y: oy, w: labelW, h: H, face: 'front' },
  ]

  if (b < 3) warnings.push(`Bleed ${r2(b)} mm is under the 3 mm minimum.`)
  if (overlap < 3) warnings.push(`Overlap ${r2(overlap)} mm is tight — 3 mm is the practical minimum for a wrap.`)
  if (H > dia * 3) warnings.push(`Label height ${r2(H)} mm on a ${r2(dia)} mm diameter — check the applicator can handle it.`)
  if (o.shrink && relax === 0) {
    warnings.push('Shrink sleeve with no relaxation allowance. Ask the converter for their shrink curve before artworking.')
  }

  notes.unshift(
    `${o.shrink ? 'Shrink sleeve' : 'Wrap-around label'} for ${r2(dia)} mm diameter: ${r2(labelW)} × ${r2(H)} mm (circumference ${r2(circumference)} mm + ${r2(overlap)} mm overlap).`,
  )
  notes.push('Barcode must sit in the front 180° and run with the bars parallel to the cylinder axis, or scanners will miss it.')
  if (o.shrink) notes.push('Artwork must be pre-distorted to the converter’s shrink map — this flat is the undistorted reference only.')

  return {
    format: o.shrink ? 'Shrink sleeve' : 'Wrap-around label',
    sheet: { w: sheetW, h: sheetH },
    shapes,
    panels,
    notes,
    warnings,
  }
}
