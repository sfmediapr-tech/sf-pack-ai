import type { Dimensions } from '../types'
import { r2 } from '../units'
import { type Dieline, type Panel, type Shape, line, poly, rect } from './svg'

export interface PouchOptions {
  sideSeal?: number
  topSeal?: number
  zipper?: boolean
  tearNotch?: boolean
  hangHole?: 'none' | 'euro' | 'round'
}

/**
 * Stand-up pouch (doypack), laid out flat as the film runs:
 *
 *   top seal (front) · FRONT panel · bottom gusset (2 halves) · BACK panel · top seal (back)
 *
 * W is the finished face width, H the finished face height, and `gusset` the
 * depth of one half of the bottom gusset — so the pouch stands on 2 × gusset.
 *
 * The side seals and the top seal are dead zones: live text there is a Pass 1
 * failure because it lands in a weld.
 */
export function standUpPouch(d: Dimensions, o: PouchOptions = {}): Dieline {
  const W = d.width
  const H = d.height
  const G = d.gusset ?? Math.max(d.depth / 2, 15)
  const b = d.bleed
  const safe = d.safeMargin
  const sideSeal = o.sideSeal ?? 8
  const topSeal = o.topSeal ?? 10
  const zipper = o.zipper ?? true
  const tearNotch = o.tearNotch ?? true

  const sheetW = W + b * 2
  const sheetH = topSeal * 2 + H * 2 + G * 2 + b * 2

  const ox = b
  let y = b

  const shapes: Shape[] = []
  const warnings: string[] = []
  const notes: string[] = []

  shapes.push(rect('BLEED', 0, 0, sheetW, sheetH, 'bleed extent'))

  // Front top seal
  const yFrontSeal = y
  shapes.push(rect('SEAL', ox, yFrontSeal, W, topSeal, 'top seal — front'))
  y += topSeal

  // Front panel
  const yFront = y
  y += H

  // Gusset: two halves meeting at a fold. The outer corners are welded shut so
  // the base can open out, which is why the corner triangles are seal, not print.
  const yGussetTop = y
  const yGussetFold = y + G
  const yGussetBot = y + G * 2
  y = yGussetBot

  // Back panel
  const yBack = y
  y += H

  // Back top seal
  const yBackSeal = y

  // --- Outline -------------------------------------------------------------
  shapes.push(rect('CUT', ox, b, W, sheetH - b * 2, 'film outline'))

  // Horizontal folds / seal boundaries
  for (const [yy, label] of [
    [yFront, 'top seal fold — front'],
    [yGussetTop, 'gusset fold — front'],
    [yGussetFold, 'gusset centre fold (pouch base)'],
    [yGussetBot, 'gusset fold — back'],
    [yBackSeal, 'top seal fold — back'],
  ] as const) {
    shapes.push(line('CREASE', ox, yy, ox + W, yy, label))
  }

  shapes.push(rect('SEAL', ox, yBackSeal, W, topSeal, 'top seal — back'))

  // Side seals run the full film length.
  shapes.push(rect('SEAL', ox, b, sideSeal, sheetH - b * 2, 'side seal — left'))
  shapes.push(rect('SEAL', ox + W - sideSeal, b, sideSeal, sheetH - b * 2, 'side seal — right'))

  // Gusset corner welds — triangles at the four gusset corners.
  const tri = Math.min(G, W * 0.18)
  for (const xSide of [ox, ox + W]) {
    const s = xSide === ox ? 1 : -1
    shapes.push(
      poly('SEAL', [
        { x: xSide, y: yGussetTop },
        { x: xSide + s * tri, y: yGussetTop },
        { x: xSide, y: yGussetTop + tri },
      ], true, 'gusset corner weld'),
      poly('SEAL', [
        { x: xSide, y: yGussetBot },
        { x: xSide + s * tri, y: yGussetBot },
        { x: xSide, y: yGussetBot - tri },
      ], true, 'gusset corner weld'),
    )
  }

  // --- Zipper and tear notch ----------------------------------------------
  if (zipper) {
    const yZip = yFront + 6
    shapes.push(line('PERF', ox + sideSeal, yZip, ox + W - sideSeal, yZip, 'press-to-close zipper'))
    shapes.push(line('PERF', ox + sideSeal, yBackSeal - 6, ox + W - sideSeal, yBackSeal - 6, 'press-to-close zipper'))
    notes.push('Zipper sits 6 mm below the top seal — keep live text 4 mm clear of it on both faces.')
  }
  if (tearNotch) {
    const yNotch = zipper ? yFront + 2 : yFront + 3
    for (const xSide of [ox, ox + W]) {
      const s = xSide === ox ? 1 : -1
      shapes.push(
        poly('CUT', [
          { x: xSide, y: yNotch },
          { x: xSide + s * 4, y: yNotch + 2 },
          { x: xSide, y: yNotch + 4 },
        ], false, 'tear notch'),
      )
    }
  }
  if (o.hangHole === 'euro') {
    const cx = ox + W / 2
    const cy = yFrontSeal + topSeal / 2
    shapes.push({ kind: 'circle', layer: 'CUT', cx, cy: cy + 1.5, r: 3 })
    shapes.push(rect('CUT', cx - 2.5, cy - 4, 5, 5, 'euro slot'))
    notes.push('Euro hang hole punched through the front top seal — seal must be at least 12 mm for this.')
    if (topSeal < 12) warnings.push(`Top seal ${r2(topSeal)} mm is too shallow for a euro hang hole (needs 12 mm).`)
  }

  // --- Safe areas ----------------------------------------------------------
  const zipClear = zipper ? 10 : 4
  shapes.push(
    rect('SAFE', ox + sideSeal + safe, yFront + zipClear, W - (sideSeal + safe) * 2, H - zipClear - safe, 'safe — front'),
  )
  shapes.push(
    rect('SAFE', ox + sideSeal + safe, yBack + safe, W - (sideSeal + safe) * 2, H - zipClear - safe, 'safe — back'),
  )

  const panels: Panel[] = [
    { id: 'front', label: 'FRONT', x: ox, y: yFront, w: W, h: H, face: 'front' },
    { id: 'gusset', label: 'BASE GUSSET', x: ox, y: yGussetTop, w: W, h: G * 2, face: 'gusset' },
    { id: 'back', label: 'BACK', x: ox, y: yBack, w: W, h: H, face: 'back', rotation: 180 },
  ]

  if (b < 3) warnings.push(`Bleed ${r2(b)} mm is under the 3 mm minimum.`)
  if (sideSeal < 6) warnings.push(`Side seal ${r2(sideSeal)} mm is thin for a stand-up pouch — 8 mm is typical.`)
  if (G * 2 > W * 0.8) warnings.push(`Gusset ${r2(G * 2)} mm against a ${r2(W)} mm face — the pouch will not stand square.`)

  notes.unshift(`Stand-up pouch, finished face ${r2(W)} × ${r2(H)} mm, base gusset ${r2(G * 2)} mm.`)
  notes.push(`Side seals ${r2(sideSeal)} mm, top seal ${r2(topSeal)} mm — no live text, barcodes or trim marks inside a seal.`)
  notes.push('Back panel prints rotated 180° relative to the front on this web layout.')

  return { format: 'Stand-up pouch', sheet: { w: sheetW, h: sheetH }, shapes, panels, notes, warnings }
}
