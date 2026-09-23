import { r2 } from '../units'

/**
 * Die line layer conventions. packaging-artwork-review Pass 1 fails a file where
 * the die line is flattened into the artwork, so every line this engine emits is
 * tagged with its layer and its spot colour name, and the layers come out as
 * separate <g> elements that map 1:1 onto Illustrator layers on import.
 */
export type LayerName = 'CUT' | 'CREASE' | 'PERF' | 'BLEED' | 'SAFE' | 'GLUE' | 'SEAL' | 'DIMENSIONS'

export interface LayerStyle {
  /** Spot colour name as it must appear in the separations. */
  spot: string
  stroke: string
  strokeWidth: number
  dash?: string
  /** Non-printing layers are still drawn on screen, but marked for the printer. */
  printing: boolean
  fill?: string
}

export const LAYERS: Record<LayerName, LayerStyle> = {
  CUT:        { spot: 'Dieline-Cut',    stroke: '#e6007e', strokeWidth: 0.25, printing: false },
  CREASE:     { spot: 'Dieline-Crease', stroke: '#00a0e9', strokeWidth: 0.25, dash: '2 1.2', printing: false },
  PERF:       { spot: 'Dieline-Perf',   stroke: '#8bc34a', strokeWidth: 0.25, dash: '1 1', printing: false },
  BLEED:      { spot: 'Guide-Bleed',    stroke: '#ff8a00', strokeWidth: 0.2,  dash: '3 2', printing: false },
  SAFE:       { spot: 'Guide-Safe',     stroke: '#00b894', strokeWidth: 0.2,  dash: '1.5 1.5', printing: false },
  GLUE:       { spot: 'Dieline-Glue',   stroke: '#9b59b6', strokeWidth: 0.25, printing: false, fill: 'rgba(155,89,182,0.10)' },
  SEAL:       { spot: 'Dieline-Seal',   stroke: '#c0392b', strokeWidth: 0.25, printing: false, fill: 'rgba(192,57,43,0.08)' },
  DIMENSIONS: { spot: 'Guide-Dims',     stroke: '#7a8699', strokeWidth: 0.15, printing: false },
}

export interface Pt { x: number; y: number }

export type Shape =
  | { kind: 'rect'; layer: LayerName; x: number; y: number; w: number; h: number; rx?: number; label?: string }
  | { kind: 'path'; layer: LayerName; d: string; closed?: boolean; label?: string }
  | { kind: 'line'; layer: LayerName; from: Pt; to: Pt; label?: string }
  | { kind: 'circle'; layer: LayerName; cx: number; cy: number; r: number; label?: string }
  | { kind: 'text'; layer: LayerName; x: number; y: number; text: string; size?: number; anchor?: 'start' | 'middle' | 'end' }

/** A named face of the pack — used to map artwork onto the right panel in 3D. */
export interface Panel {
  id: string
  label: string
  /** Position and size on the flat die line, millimetres. */
  x: number
  y: number
  w: number
  h: number
  /** Which physical face this becomes once folded. */
  face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'flap' | 'gusset' | 'seal'
  /** 0/90/180/270 — how artwork must be rotated on this panel. */
  rotation?: 0 | 90 | 180 | 270
}

export interface Dieline {
  format: string
  /** Overall flat sheet size including bleed. */
  sheet: { w: number; h: number }
  shapes: Shape[]
  panels: Panel[]
  /** Human-readable build notes that go into print-spec.md. */
  notes: string[]
  /** Warnings the geometry itself raises (e.g. flap narrower than printer minimum). */
  warnings: string[]
}

export function rect(layer: LayerName, x: number, y: number, w: number, h: number, label?: string): Shape {
  return { kind: 'rect', layer, x, y, w, h, label }
}

export function line(layer: LayerName, x1: number, y1: number, x2: number, y2: number, label?: string): Shape {
  return { kind: 'line', layer, from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, label }
}

export function poly(layer: LayerName, pts: Pt[], closed = true, label?: string): Shape {
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r2(p.x)},${r2(p.y)}`).join(' ') + (closed ? ' Z' : '')
  return { kind: 'path', layer, d, closed, label }
}

function shapeToSvg(s: Shape): string {
  switch (s.kind) {
    case 'rect':
      return `<rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}"${
        s.rx ? ` rx="${r2(s.rx)}"` : ''
      }${s.label ? ` data-label="${escapeAttr(s.label)}"` : ''} />`
    case 'path':
      return `<path d="${s.d}"${s.label ? ` data-label="${escapeAttr(s.label)}"` : ''} />`
    case 'line':
      return `<line x1="${r2(s.from.x)}" y1="${r2(s.from.y)}" x2="${r2(s.to.x)}" y2="${r2(s.to.y)}"${
        s.label ? ` data-label="${escapeAttr(s.label)}"` : ''
      } />`
    case 'circle':
      return `<circle cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}" />`
    case 'text':
      return `<text x="${r2(s.x)}" y="${r2(s.y)}" font-size="${s.size ?? 3}" text-anchor="${
        s.anchor ?? 'start'
      }" fill="${LAYERS[s.layer].stroke}" stroke="none" font-family="Helvetica, Arial, sans-serif">${escapeText(
        s.text,
      )}</text>`
  }
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escapeText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Serialise to SVG with one <g> per layer. Units are millimetres in user space and
 * the root carries width/height in mm, so the file opens at true size in
 * Illustrator and imposes correctly.
 */
export function dielineToSvg(dl: Dieline, opts: { showPanelLabels?: boolean } = {}): string {
  const used = new Set(dl.shapes.map((s) => s.layer))
  const order: LayerName[] = ['BLEED', 'SAFE', 'GLUE', 'SEAL', 'CREASE', 'PERF', 'CUT', 'DIMENSIONS']

  const groups = order
    .filter((l) => used.has(l))
    .map((l) => {
      const st = LAYERS[l]
      const body = dl.shapes.filter((s) => s.layer === l).map(shapeToSvg).join('\n      ')
      return `    <g id="${l}" data-spot="${st.spot}" data-printing="${st.printing}"
       fill="${st.fill ?? 'none'}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"${
        st.dash ? ` stroke-dasharray="${st.dash}"` : ''
      }>
      ${body}
    </g>`
    })
    .join('\n')

  const labels = opts.showPanelLabels
    ? `\n    <g id="PANEL-LABELS" data-printing="false" fill="#7a8699" stroke="none" font-family="Helvetica, Arial, sans-serif">\n` +
      dl.panels
        .map(
          (p) =>
            `      <text x="${r2(p.x + p.w / 2)}" y="${r2(p.y + p.h / 2)}" font-size="3.2" text-anchor="middle">${escapeText(
              p.label,
            )}</text>`,
        )
        .join('\n') +
      `\n    </g>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${r2(dl.sheet.w)}mm" height="${r2(dl.sheet.h)}mm"
     viewBox="0 0 ${r2(dl.sheet.w)} ${r2(dl.sheet.h)}"
     data-format="${escapeAttr(dl.format)}"
     data-units="mm">
  <title>${escapeText(dl.format)} die line — ${r2(dl.sheet.w)} × ${r2(dl.sheet.h)} mm</title>
  <desc>Generated by SF Pack AI. All layers non-printing. Cut on ${LAYERS.CUT.spot}, crease on ${LAYERS.CREASE.spot}.</desc>
${groups}${labels}
</svg>
`
}
