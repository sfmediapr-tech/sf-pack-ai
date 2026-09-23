import type { Dimensions } from '../types'
import { r2 } from '../units'
import { type Dieline, type Panel, type Shape, line, rect } from './svg'

export interface StickOptions {
  /** Back fin seal width. */
  finSeal?: number
  /** Top and bottom crimp seal depth. */
  endSeal?: number
  tearNotch?: boolean
}

/**
 * Stick pack / sachet, as it runs on a vertical form-fill-seal machine.
 *
 * The film is one flat web. Width = one face width × 2 (front wraps to back)
 * plus the fin seal overlap. Length = pack length plus a crimp at each end.
 *
 * The practical trap on stick packs is that the printable face is narrow, the
 * crimps eat the ends, and the fin seal steals a strip down the back — so the
 * usable artwork area is far smaller than the film. This generator shows that
 * area explicitly rather than letting a designer discover it at proof stage.
 */
export function stickPack(d: Dimensions, o: StickOptions = {}): Dieline {
  const W = d.width
  const L = d.height
  const b = d.bleed
  const safe = d.safeMargin
  const fin = o.finSeal ?? 6
  const endSeal = o.endSeal ?? 8
  const tearNotch = o.tearNotch ?? true

  const filmW = W * 2 + fin
  const filmL = L + endSeal * 2

  const sheetW = filmW + b * 2
  const sheetH = filmL + b * 2

  const ox = b
  const oy = b

  const shapes: Shape[] = []
  const warnings: string[] = []
  const notes: string[] = []

  shapes.push(rect('BLEED', 0, 0, sheetW, sheetH, 'bleed extent'))
  shapes.push(rect('CUT', ox, oy, filmW, filmL, 'film outline'))

  // Face boundaries: front | back | fin
  const xFront = ox
  const xBack = ox + W
  const xFin = ox + W * 2

  shapes.push(line('CREASE', xBack, oy, xBack, oy + filmL, 'side fold'))
  shapes.push(line('CREASE', xFin, oy, xFin, oy + filmL, 'fin seal fold'))

  shapes.push(rect('SEAL', xFin, oy, fin, filmL, 'back fin seal'))
  shapes.push(rect('SEAL', ox, oy, filmW, endSeal, 'top crimp'))
  shapes.push(rect('SEAL', ox, oy + filmL - endSeal, filmW, endSeal, 'bottom crimp'))

  if (tearNotch) {
    const yNotch = oy + endSeal - 2
    shapes.push(line('PERF', xFront + 3, yNotch, xFin, yNotch, 'laser tear line'))
    notes.push('Laser tear line scored 2 mm inside the top crimp — keep copy 4 mm clear.')
  }

  // Usable artwork area on each face.
  const yArt = oy + endSeal
  const hArt = L
  shapes.push(rect('SAFE', xFront + safe, yArt + safe, W - safe * 2, hArt - safe * 2, 'safe — front face'))
  shapes.push(rect('SAFE', xBack + safe, yArt + safe, W - safe * 2, hArt - safe * 2, 'safe — back face'))

  const panels: Panel[] = [
    { id: 'front', label: 'FRONT', x: xFront, y: yArt, w: W, h: hArt, face: 'front' },
    { id: 'back', label: 'BACK', x: xBack, y: yArt, w: W, h: hArt, face: 'back' },
    { id: 'fin', label: 'FIN', x: xFin, y: yArt, w: fin, h: hArt, face: 'seal' },
  ]

  const usableW = W - safe * 2
  if (usableW < 25) {
    warnings.push(
      `Usable face width is only ${r2(usableW)} mm. A legible ingredient list will not fit — plan on an outer carton or a leaflet.`,
    )
  }
  if (b < 3) warnings.push(`Bleed ${r2(b)} mm is under the 3 mm minimum.`)
  if (fin < 5) warnings.push(`Fin seal ${r2(fin)} mm is thin — 6 mm is the usual VFFS minimum.`)
  if (endSeal < 6) warnings.push(`Crimp ${r2(endSeal)} mm is shallow; check with the filler before committing.`)

  notes.unshift(`Stick pack, face ${r2(W)} × ${r2(L)} mm, film ${r2(filmW)} × ${r2(filmL)} mm.`)
  notes.push(`Fin seal ${r2(fin)} mm on the back; crimps ${r2(endSeal)} mm top and bottom.`)
  notes.push('Registered print on a stick pack drifts — allow ±2 mm and do not butt colour blocks to the crimp.')
  notes.push('Lot and best-before are normally hot-foil coded into the top crimp; leave it unvarnished.')

  return { format: 'Stick pack', sheet: { w: sheetW, h: sheetH }, shapes, panels, notes, warnings }
}
