import { LAYERS, type Dieline, type LayerName, type Shape } from '../dielines/svg'
import { r2 } from '../units'
import { DIELINE_SPOTS, type SpotColour } from './colour'
import { MM_TO_PT, type LayerSpec, type OutputIntentSpec, type PdfXSpec, buildPdfX } from './pdfx'
import { strokeText } from './strokeFont'

/**
 * Die line → PDF/X-4.
 *
 * Everything is drawn in millimetres with y measured down, matching the die line
 * generators, and a single `cm` at the top of the content stream scales to
 * points and flips the axis. That keeps every coordinate in this file readable
 * against the die line source.
 */

const f = (n: number) => {
  const v = Math.round(n * 1000) / 1000
  return Object.is(v, -0) ? '0' : String(v)
}

/** Fill tints for the zone layers. Solid ink on a die line would obscure artwork. */
const ZONE_TINT: Partial<Record<LayerName, number>> = { GLUE: 0.15, SEAL: 0.12 }

const KAPPA = 0.5522847498

function pathOps(s: Shape): string[] {
  const out: string[] = []
  switch (s.kind) {
    case 'rect': {
      if (s.rx && s.rx > 0) {
        const { x, y, w, h } = s
        const r = Math.min(s.rx, w / 2, h / 2)
        const c = r * KAPPA
        out.push(`${f(x + r)} ${f(y)} m`)
        out.push(`${f(x + w - r)} ${f(y)} l`)
        out.push(`${f(x + w - r + c)} ${f(y)} ${f(x + w)} ${f(y + r - c)} ${f(x + w)} ${f(y + r)} c`)
        out.push(`${f(x + w)} ${f(y + h - r)} l`)
        out.push(`${f(x + w)} ${f(y + h - r + c)} ${f(x + w - r + c)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} c`)
        out.push(`${f(x + r)} ${f(y + h)} l`)
        out.push(`${f(x + r - c)} ${f(y + h)} ${f(x)} ${f(y + h - r + c)} ${f(x)} ${f(y + h - r)} c`)
        out.push(`${f(x)} ${f(y + r)} l`)
        out.push(`${f(x)} ${f(y + r - c)} ${f(x + r - c)} ${f(y)} ${f(x + r)} ${f(y)} c`)
        out.push('h')
      } else {
        out.push(`${f(s.x)} ${f(s.y)} ${f(s.w)} ${f(s.h)} re`)
      }
      break
    }
    case 'line':
      out.push(`${f(s.from.x)} ${f(s.from.y)} m`, `${f(s.to.x)} ${f(s.to.y)} l`)
      break
    case 'circle': {
      const { cx, cy, r } = s
      const c = r * KAPPA
      out.push(`${f(cx + r)} ${f(cy)} m`)
      out.push(`${f(cx + r)} ${f(cy + c)} ${f(cx + c)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`)
      out.push(`${f(cx - c)} ${f(cy + r)} ${f(cx - r)} ${f(cy + c)} ${f(cx - r)} ${f(cy)} c`)
      out.push(`${f(cx - r)} ${f(cy - c)} ${f(cx - c)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c`)
      out.push(`${f(cx + c)} ${f(cy - r)} ${f(cx + r)} ${f(cy - c)} ${f(cx + r)} ${f(cy)} c`)
      out.push('h')
      break
    }
    case 'path': {
      // The generators emit only M / L / Z.
      const tokens = s.d.match(/[MLZ][^MLZ]*/gi) ?? []
      for (const t of tokens) {
        const op = t[0].toUpperCase()
        if (op === 'Z') {
          out.push('h')
          continue
        }
        const [px, py] = t
          .slice(1)
          .trim()
          .split(/[,\s]+/)
          .map(Number)
        if (Number.isFinite(px) && Number.isFinite(py)) out.push(`${f(px)} ${f(py)} ${op === 'M' ? 'm' : 'l'}`)
      }
      break
    }
    case 'text': {
      const { polylines } = strokeText(s.text, s.x, s.y, s.size ?? 3, s.anchor ?? 'start')
      for (const pl of polylines) {
        pl.forEach(([px, py], i) => out.push(`${f(px)} ${f(py)} ${i === 0 ? 'm' : 'l'}`))
      }
      break
    }
  }
  return out
}

export interface DielinePdfOptions {
  title: string
  subject?: string
  outputIntent: OutputIntentSpec
  /** Draw panel names as stroked vector labels on a non-printing layer. */
  panelLabels?: boolean
}

export function dielineToPdfX(dl: Dieline, o: DielinePdfOptions): Uint8Array {
  const used: LayerName[] = [...new Set(dl.shapes.map((s) => s.layer))]
  const order: LayerName[] = ['BLEED', 'SAFE', 'GLUE', 'SEAL', 'CREASE', 'PERF', 'CUT', 'DIMENSIONS']
  const active = order.filter((l) => used.includes(l))

  const layers: LayerSpec[] = active.map((l) => ({ id: l, label: `${l} (${LAYERS[l].spot})`, printing: false }))
  if (o.panelLabels && dl.panels.length) layers.push({ id: 'LABELS', label: 'PANEL LABELS', printing: false })

  const spots: SpotColour[] = active.map((l) => DIELINE_SPOTS[LAYERS[l].spot]).filter(Boolean)
  if (o.panelLabels && dl.panels.length) spots.push(DIELINE_SPOTS['Guide-Dims'])
  const uniqueSpots = spots.filter((s, i) => spots.findIndex((x) => x.name === s.name) === i)
  const spotIndex = (n: string) => uniqueSpots.findIndex((s) => s.name === n)

  const lines: string[] = []

  // mm → pt with the y axis flipped, so the rest of the stream is millimetres.
  lines.push('q')
  lines.push(`${f(MM_TO_PT)} 0 0 ${f(-MM_TO_PT)} 0 ${f(dl.sheet.h * MM_TO_PT)} cm`)
  // Technical marks overprint: they must not knock a hole in the artwork beneath.
  lines.push('/GSop gs')
  lines.push('1 J 1 j')

  active.forEach((layerName, li) => {
    const style = LAYERS[layerName]
    const si = spotIndex(style.spot)
    if (si < 0) return
    const shapes = dl.shapes.filter((s) => s.layer === layerName)
    if (!shapes.length) return

    lines.push(`/OC /OC${li} BDC`)
    lines.push('q')
    lines.push(`${f(style.strokeWidth)} w`)
    lines.push(style.dash ? `[ ${style.dash.split(/\s+/).map(Number).map(f).join(' ')} ] 0 d` : '[ ] 0 d')

    const tint = ZONE_TINT[layerName]
    if (tint !== undefined) {
      // Zone layers get a light tint fill plus their outline.
      lines.push(`/S${si} cs ${f(tint)} scn`)
      lines.push(`/S${si} CS 1 SCN`)
      for (const s of shapes) {
        const ops = pathOps(s)
        if (!ops.length) continue
        lines.push(...ops, 'B')
      }
    } else {
      lines.push(`/S${si} CS 1 SCN`)
      for (const s of shapes) {
        const ops = pathOps(s)
        if (!ops.length) continue
        lines.push(...ops, 'S')
      }
    }
    lines.push('Q', 'EMC')
  })

  if (o.panelLabels && dl.panels.length) {
    const si = spotIndex('Guide-Dims')
    lines.push(`/OC /OC${layers.length - 1} BDC`, 'q', '0.12 w', '[ ] 0 d', `/S${si} CS 1 SCN`)
    for (const p of dl.panels) {
      const size = Math.max(2.2, Math.min(4, Math.min(p.w, p.h) * 0.14))
      const { polylines } = strokeText(p.label, p.x + p.w / 2, p.y + p.h / 2, size, 'middle')
      for (const pl of polylines) {
        pl.forEach(([px, py], i) => lines.push(`${f(px)} ${f(py)} ${i === 0 ? 'm' : 'l'}`))
        lines.push('S')
      }
    }
    lines.push('Q', 'EMC')
  }

  lines.push('Q')

  // Trim box = the die line extent inside the bleed.
  const b = inferBleed(dl)
  const spec: PdfXSpec = {
    title: o.title,
    subject: o.subject ?? `${dl.format} — ${r2(dl.sheet.w)} × ${r2(dl.sheet.h)} mm`,
    creator: 'SF Pack AI',
    producer: 'SF Pack AI die line engine',
    sheet: dl.sheet,
    trim: { x: b, y: b, w: dl.sheet.w - b * 2, h: dl.sheet.h - b * 2 },
    bleed: { x: 0, y: 0, w: dl.sheet.w, h: dl.sheet.h },
    spots: uniqueSpots,
    layers,
    outputIntent: o.outputIntent,
  }

  return buildPdfX(spec, lines.join('\n'))
}

/**
 * The generators inset everything by the bleed, and draw the bleed box at the
 * sheet edge, so the trim inset is recoverable from the geometry.
 */
function inferBleed(dl: Dieline): number {
  const cut = dl.shapes.filter((s) => s.layer === 'CUT')
  let minX = Infinity
  let minY = Infinity
  for (const s of cut) {
    if (s.kind === 'rect') {
      minX = Math.min(minX, s.x)
      minY = Math.min(minY, s.y)
    } else if (s.kind === 'path') {
      for (const m of s.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
        minX = Math.min(minX, Number(m[1]))
        minY = Math.min(minY, Number(m[2]))
      }
    } else if (s.kind === 'line') {
      minX = Math.min(minX, s.from.x, s.to.x)
      minY = Math.min(minY, s.from.y, s.to.y)
    }
  }
  const v = Math.min(minX, minY)
  return Number.isFinite(v) && v >= 0 ? r2(v) : 0
}
