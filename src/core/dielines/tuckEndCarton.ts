import type { Dimensions } from '../types'
import { r2 } from '../units'
import { type Dieline, type Panel, type Shape, line, poly, rect } from './svg'

export type TuckStyle = 'reverse' | 'straight'

/**
 * Folding carton, reverse or straight tuck end.
 *
 * Flat layout, left to right:
 *   glue flap | back (W) | side (D) | front (W) | side (D)
 *
 * Reverse tuck: top tuck hangs off the BACK panel, bottom tuck off the FRONT.
 * Straight tuck: both tucks hang off the BACK panel. Reverse is cheaper to make
 * and is what most supplement cartons use; straight gives a cleaner front face.
 *
 * W = width (front face), D = depth, H = height. All millimetres.
 */
export function tuckEndCarton(d: Dimensions, style: TuckStyle = 'reverse'): Dieline {
  const W = d.width
  const D = d.depth
  const H = d.height
  const b = d.bleed
  const safe = d.safeMargin
  const caliper = d.materialThickness ?? 0.4
  const glue = d.flap ?? 15

  // A tuck must be a shade shallower than the depth or it will not close.
  const tuck = Math.max(D - caliper * 2, D * 0.85)
  // Dust flaps clear the opposite wall.
  const dust = Math.max(D - 1.5, D * 0.8)
  const flapZone = Math.max(tuck, dust)
  // Tuck nose taper, each side.
  const taper = Math.min(2, D * 0.12)

  const sheetW = glue + W + D + W + D + b * 2
  const sheetH = flapZone * 2 + H + b * 2

  const ox = b
  const oy = b + flapZone

  // Horizontal panel edges.
  const xGlue = ox
  const xBack = xGlue + glue
  const xSideL = xBack + W
  const xFront = xSideL + D
  const xSideR = xFront + W
  const xEnd = xSideR + D

  const shapes: Shape[] = []
  const warnings: string[] = []
  const notes: string[] = []

  // --- Bleed box -----------------------------------------------------------
  shapes.push(rect('BLEED', 0, 0, sheetW, sheetH, 'bleed extent'))

  // --- Body outline --------------------------------------------------------
  // Left edge of the glue flap is tapered so it tucks in without showing.
  shapes.push(
    poly(
      'CUT',
      [
        { x: xGlue + 1.5, y: oy + 1.5 },
        { x: xBack, y: oy },
        { x: xBack, y: oy + H },
        { x: xGlue + 1.5, y: oy + H - 1.5 },
      ],
      true,
      'glue flap',
    ),
  )
  shapes.push(rect('GLUE', xGlue + 1.5, oy + 1.5, glue - 1.5, H - 3, 'glue area — keep free of ink'))

  // Which panel each tuck hangs off. Straight tuck puts both on the back;
  // reverse puts the bottom one on the front, which is cheaper to make.
  const topTuckX = xBack
  const botTuckX = style === 'reverse' ? xFront : xBack

  // Body: the only vertical cut is the right-hand edge of the blank. The panel
  // joins are creases and the glue flap folds against the back panel.
  shapes.push(line('CUT', xEnd, oy, xEnd, oy + H, 'blank edge'))
  for (const x of [xBack, xSideL, xFront, xSideR]) {
    shapes.push(line('CREASE', x, oy, x, oy + H, 'panel fold'))
  }

  // Top and bottom edges are a crease wherever a flap folds off them and a cut
  // where the panel is open. Getting this the wrong way round is not cosmetic:
  // a die that cuts a fold line produces a carton that falls apart, and a die
  // that creases a cut line produces one that will not open.
  const spans: [number, number][] = [
    [xBack, W],
    [xSideL, D],
    [xFront, W],
    [xSideR, D],
  ]
  const topHasFlap = (x: number) => x === topTuckX || x === xSideL || x === xSideR
  const botHasFlap = (x: number) => x === botTuckX || x === xSideL || x === xSideR
  for (const [x, w] of spans) {
    shapes.push(line(topHasFlap(x) ? 'CREASE' : 'CUT', x, oy, x + w, oy, 'top edge'))
    shapes.push(line(botHasFlap(x) ? 'CREASE' : 'CUT', x, oy + H, x + w, oy + H, 'bottom edge'))
  }

  // --- Tuck + dust flaps ---------------------------------------------------

  shapes.push(...tuckFlap(topTuckX, oy, W, tuck, taper, 'up'))
  shapes.push(...tuckFlap(botTuckX, oy + H, W, tuck, taper, 'down'))

  // Dust flaps sit on the two side panels at both ends. The panel opposite each
  // tuck carries nothing — that is the opening the tuck goes into.
  for (const x of [xSideL, xSideR]) {
    shapes.push(...dustFlap(x, oy, D, dust, 'up'))
    shapes.push(...dustFlap(x, oy + H, D, dust, 'down'))
  }

  // --- Safe area -----------------------------------------------------------
  for (const [x, w] of [
    [xBack, W],
    [xSideL, D],
    [xFront, W],
    [xSideR, D],
  ] as const) {
    shapes.push(rect('SAFE', x + safe, oy + safe, w - safe * 2, H - safe * 2, 'safe area'))
  }

  // --- Panels for 3D mapping ----------------------------------------------
  const panels: Panel[] = [
    { id: 'back', label: 'BACK', x: xBack, y: oy, w: W, h: H, face: 'back' },
    { id: 'left', label: 'SIDE', x: xSideL, y: oy, w: D, h: H, face: 'left' },
    { id: 'front', label: 'FRONT', x: xFront, y: oy, w: W, h: H, face: 'front' },
    { id: 'right', label: 'SIDE', x: xSideR, y: oy, w: D, h: H, face: 'right' },
    { id: 'top', label: 'TOP', x: topTuckX, y: oy - tuck, w: W, h: tuck, face: 'top' },
    { id: 'bottom', label: 'BASE', x: botTuckX, y: oy + H, w: W, h: tuck, face: 'bottom' },
    { id: 'glue', label: 'GLUE', x: xGlue, y: oy, w: glue, h: H, face: 'flap' },
  ]

  // --- Geometry warnings ---------------------------------------------------
  if (glue < 12) warnings.push(`Glue flap ${r2(glue)} mm is under the 12 mm most carton printers ask for.`)
  if (b < 3) warnings.push(`Bleed ${r2(b)} mm is under the 3 mm minimum in Pass 1 of packaging-artwork-review.`)
  if (safe < 3) warnings.push(`Safe margin ${r2(safe)} mm is tight; live text this close to a crease will crack.`)
  if (D < 15) warnings.push(`Depth ${r2(D)} mm makes a tuck under 15 mm — check the carton can actually be erected.`)
  if (W / D > 6) warnings.push(`Width:depth ratio ${r2(W / D)}:1 — a carton this flat tends to bow on the front face.`)

  notes.push(`${style === 'reverse' ? 'Reverse' : 'Straight'} tuck end, ${r2(W)} × ${r2(D)} × ${r2(H)} mm.`)
  notes.push(`Board caliper assumed ${r2(caliper)} mm; tuck depth ${r2(tuck)} mm, dust flaps ${r2(dust)} mm.`)
  notes.push('Glue flap area must be free of ink and varnish.')
  notes.push('Die line layers are non-printing — supply as separations named per the printer guide.')

  return { format: `Tuck end carton (${style})`, sheet: { w: sheetW, h: sheetH }, shapes, panels, notes, warnings }
}

/** Tapered tuck with a shallow nose. `dir` is which way it folds off the body. */
function tuckFlap(x: number, yEdge: number, w: number, depth: number, taper: number, dir: 'up' | 'down'): Shape[] {
  const s = dir === 'up' ? -1 : 1
  const yTip = yEdge + s * depth
  const yShoulder = yEdge + s * (depth * 0.72)
  return [
    poly(
      'CUT',
      [
        { x, y: yEdge },
        { x, y: yShoulder },
        { x: x + taper, y: yTip },
        { x: x + w - taper, y: yTip },
        { x: x + w, y: yShoulder },
        { x: x + w, y: yEdge },
      ],
      false,
      'tuck flap',
    ),
  ]
}

/** Dust flap with clipped outer corners so it clears the tuck on closing. */
function dustFlap(x: number, yEdge: number, w: number, depth: number, dir: 'up' | 'down'): Shape[] {
  const s = dir === 'up' ? -1 : 1
  const yTip = yEdge + s * depth
  const clip = Math.min(3, depth * 0.35)
  return [
    poly(
      'CUT',
      [
        { x, y: yEdge },
        { x, y: yEdge + s * (depth - clip) },
        { x: x + clip, y: yTip },
        { x: x + w - clip, y: yTip },
        { x: x + w, y: yEdge + s * (depth - clip) },
        { x: x + w, y: yEdge },
      ],
      false,
      'dust flap',
    ),
  ]
}
