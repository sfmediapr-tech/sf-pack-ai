import type { ProductRecord } from '../core/types'
import { renderFactsPanel } from '../core/panels/factsPanel'
import { DEFAULT_SPEC, renderBarcode } from '../core/barcode/symbol'

export interface BrandKit {
  primary: string
  secondary: string
  accent: string
  ink: string
  paper: string
  /** Display font stack for the brand name. */
  displayFont: string
  bodyFont: string
  /** Artwork feel — changes layout, not just colour. */
  style: 'clinical' | 'performance' | 'botanical' | 'premium-dark'
}

export const DEFAULT_KIT: BrandKit = {
  primary: '#0E3B2E',
  secondary: '#F4F1E8',
  accent: '#9E7C2B',
  ink: '#101418',
  paper: '#FFFFFF',
  displayFont: '700 {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
  bodyFont: '{weight} {size}px "Helvetica Neue", Helvetica, Arial, sans-serif',
  style: 'premium-dark',
}

export type PanelRole = 'front' | 'back' | 'side' | 'top' | 'bottom'

/** Pixels per millimetre for the generated textures. 12 ≈ 300 dpi. */
const PPMM = 12

const font = (tpl: string, size: number, weight = 400) =>
  tpl.replace('{size}', String(size)).replace('{weight}', String(weight))

/** Draw an image to fill the box, cropping the overflow rather than squashing. */
function drawCover(c: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const scale = Math.max(W / img.width, H / img.height)
  const w = img.width * scale
  const h = img.height * scale
  c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
}

/** Hex to rgba, so a brand colour can be used as a scrim at a given opacity. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(0,0,0,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function wrapText(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (c.measureText(t).width <= maxW || !cur) cur = t
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Rasterise an SVG string into a canvas at the given millimetre box. */
async function drawSvg(
  c: CanvasRenderingContext2D,
  svg: string,
  x: number,
  y: number,
  wMm: number,
  hMm: number,
): Promise<void> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('svg raster failed'))
      img.src = url
    })
    c.drawImage(img, x, y, wMm * PPMM, hMm * PPMM)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface PanelArtOptions {
  role: PanelRole
  /** Panel size in millimetres. */
  wMm: number
  hMm: number
  product: ProductRecord
  kit: BrandKit
  /** Draw the safe-area and bleed guides over the art. */
  showGuides?: boolean
  safeMm?: number
  /**
   * A generated surface graphic, drawn underneath everything else. It carries
   * no text of its own — every word on the pack is set below, from the record.
   */
  background?: HTMLImageElement | null
}

/**
 * Draw one pack face onto a canvas. This is deliberately a real layout engine,
 * not an image model: the text on the pack is the text on the record, so what
 * the client sees in 3D is what the compliance engine just checked.
 */
export async function renderPanelArt(o: PanelArtOptions): Promise<HTMLCanvasElement> {
  const { role, wMm, hMm, product: p, kit } = o
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(8, Math.round(wMm * PPMM))
  canvas.height = Math.max(8, Math.round(hMm * PPMM))
  const c = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  const M = 4 * PPMM // artwork margin

  const dark = kit.style === 'premium-dark'
  const bg = dark ? kit.primary : kit.secondary
  const fg = dark ? kit.secondary : kit.ink

  // Background
  c.fillStyle = bg
  c.fillRect(0, 0, W, H)

  // A generated surface graphic goes down first, cover-fitted, with a scrim of
  // the brand colour over it. The scrim is not decoration: type set over an
  // unmodified generated image is unreadable at pack size, and legibility of
  // the mandatory particulars is a legal requirement, not a preference.
  if (o.background && role === 'front') {
    drawCover(c, o.background, W, H)
    const scrim = c.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, withAlpha(kit.primary, dark ? 0.82 : 0.7))
    scrim.addColorStop(0.5, withAlpha(kit.primary, dark ? 0.62 : 0.5))
    scrim.addColorStop(1, withAlpha(kit.primary, dark ? 0.88 : 0.78))
    c.fillStyle = scrim
    c.fillRect(0, 0, W, H)
  }

  if (kit.style === 'botanical') {
    const g = c.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, kit.secondary)
    g.addColorStop(1, kit.primary + '22')
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
  }
  if (kit.style === 'performance') {
    c.fillStyle = kit.accent
    c.beginPath()
    c.moveTo(0, H * 0.62)
    c.lineTo(W, H * 0.48)
    c.lineTo(W, H)
    c.lineTo(0, H)
    c.closePath()
    c.fill()
  }

  // Facts panel occupies a column on the left of the back; body copy runs beside it.
  const panelWMm = Math.max(34, Math.min(wMm * 0.45, 72))

  if (role === 'front') {
    drawFront(c, W, H, M, p, kit, fg)
  } else if (role === 'back') {
    drawBackChrome(c, W, H, M, p, kit, panelWMm)
  } else if (role === 'side') {
    drawSide(c, W, H, M, p, kit, fg)
  } else {
    drawEnd(c, W, H, M, p, kit, fg)
  }

  // The facts panel is the real generated SVG, composited at true size.
  if (role === 'back') {
    const res = renderFactsPanel(p, panelWMm)
    const maxH = hMm - 26
    const scale = res.heightMm > maxH ? maxH / res.heightMm : 1
    try {
      await drawSvg(c, res.svg, M, 14 * PPMM, res.widthMm * scale, res.heightMm * scale)
    } catch {
      c.fillStyle = '#b00020'
      c.font = font(kit.bodyFont, 3 * PPMM, 600)
      c.fillText('panel render failed', M, 20 * PPMM)
    }
  }

  // The real barcode, generated from the GTIN and composited at true size.
  // It is a decodable symbol with correct quiet zones, not an illustration —
  // so what the client approves in 3D is what a scanner would read.
  if (role === 'back') {
    const bar = renderBarcode(p.gtin, DEFAULT_SPEC)
    if (!('error' in bar)) {
      const maxW = Math.min(wMm * 0.34, 38)
      const scale = bar.widthMm > maxW ? maxW / bar.widthMm : 1
      const bwMm = bar.widthMm * scale
      const bhMm = bar.heightMm * scale
      try {
        await drawSvg(c, bar.svg, (wMm - 4 - bwMm) * PPMM, (hMm - 4 - bhMm) * PPMM, bwMm, bhMm)
      } catch {
        /* the reserved box drawn above already says a GTIN is needed */
      }
    }
  }

  if (o.showGuides && o.safeMm) {
    const s = o.safeMm * PPMM
    c.strokeStyle = 'rgba(0,184,148,0.9)'
    c.setLineDash([6, 6])
    c.lineWidth = 2
    c.strokeRect(s, s, W - s * 2, H - s * 2)
    c.setLineDash([])
  }

  return canvas
}

function drawFront(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  M: number,
  p: ProductRecord,
  kit: BrandKit,
  fg: string,
) {
  const cx = W / 2

  // Brand rule
  c.strokeStyle = kit.accent
  c.lineWidth = Math.max(2, W * 0.008)
  c.beginPath()
  c.moveTo(M, H * 0.16)
  c.lineTo(W - M, H * 0.16)
  c.stroke()

  // Brand name
  c.fillStyle = fg
  c.textAlign = 'center'
  const brandSize = Math.min(W * 0.11, H * 0.075)
  c.font = font(kit.displayFont, brandSize)
  c.letterSpacing = `${brandSize * 0.08}px`
  c.fillText(p.brand.toUpperCase(), cx, H * 0.12)
  c.letterSpacing = '0px'

  // Product name, wrapped
  const prodSize = Math.min(W * 0.155, H * 0.1)
  c.font = font(kit.displayFont, prodSize)
  const lines = wrapText(c, p.productName.toUpperCase(), W - M * 2)
  let y = H * 0.36
  for (const ln of lines) {
    c.fillText(ln, cx, y)
    y += prodSize * 1.12
  }

  // Statutory descriptor — the legal name, which is not the brand name.
  c.font = font(kit.bodyFont, Math.min(W * 0.052, H * 0.034), 500)
  c.fillStyle = kit.accent
  c.letterSpacing = `${W * 0.006}px`
  c.fillText((p.statutoryName || 'FOOD SUPPLEMENT').toUpperCase(), cx, y + H * 0.035)
  c.letterSpacing = '0px'

  // Lead claim, if one is classified and lawful.
  const lead = p.claims.find((cl) => cl.kind === 'authorised-health' || cl.kind === 'nutrition')
  if (lead) {
    c.fillStyle = fg
    c.font = font(kit.bodyFont, Math.min(W * 0.045, H * 0.03), 400)
    const cl = wrapText(c, lead.text, W - M * 2.4)
    let cy = H * 0.66
    for (const ln of cl.slice(0, 3)) {
      c.fillText(ln, cx, cy)
      cy += Math.min(W * 0.045, H * 0.03) * 1.35
    }
  }

  // Net quantity, bottom.
  if (p.netQuantity) {
    c.fillStyle = fg
    c.font = font(kit.bodyFont, Math.min(W * 0.06, H * 0.038), 700)
    c.fillText(p.netQuantity.declaredAs.toUpperCase(), cx, H - M * 1.1)
  }
  c.textAlign = 'left'
}

function drawBackChrome(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  M: number,
  p: ProductRecord,
  kit: BrandKit,
  panelWMm: number,
) {
  // The back is always light — a facts panel on a dark ground fails legibility.
  c.fillStyle = kit.paper
  c.fillRect(0, 0, W, H)

  const headerH = Math.min(11 * PPMM, H * 0.08)
  c.fillStyle = kit.primary
  c.fillRect(0, 0, W, headerH)
  c.fillStyle = kit.secondary
  c.font = font(kit.displayFont, headerH * 0.42)
  c.fillText(p.brand.toUpperCase(), M, headerH * 0.66)
  c.font = font(kit.bodyFont, headerH * 0.26, 400)
  c.fillText(p.productName, M + c.measureText(p.brand.toUpperCase()).width + 4 * PPMM, headerH * 0.66)

  // ── body copy column, to the right of the facts panel ──────────────────
  const colX = M + panelWMm * PPMM + 6 * PPMM
  const colW = W - colX - M
  let y = 18 * PPMM
  const body = 2.9 * PPMM
  c.fillStyle = '#101418'

  const heading = (t: string) => {
    y += body * 1.4
    c.font = font(kit.bodyFont, body * 1.05, 700)
    c.fillStyle = kit.primary
    c.fillText(t.toUpperCase(), colX, y)
    c.fillStyle = '#101418'
    y += body * 1.5
  }
  const para = (t: string, weight = 400) => {
    c.font = font(kit.bodyFont, body, weight)
    for (const ln of wrapText(c, t, colW)) {
      c.fillText(ln, colX, y)
      y += body * 1.35
    }
  }

  if (colW > 20 * PPMM) {
    c.font = font(kit.bodyFont, body * 1.25, 700)
    c.fillText((p.statutoryName || 'Food Supplement').toUpperCase(), colX, y)
    y += body * 2

    heading('Directions')
    para(p.directions || '—')

    if (p.warnings.length) {
      heading('Warnings')
      const boxTop = y - body * 1.2
      for (const w of p.warnings) para(w)
      c.strokeStyle = '#101418'
      c.lineWidth = 2
      c.strokeRect(colX - 2 * PPMM, boxTop, colW + 3 * PPMM, y - boxTop - body * 0.5)
      y += body * 1.2
    }

    if (p.storage) {
      heading('Storage')
      para(p.storage)
    }
  }

  // ── footer: responsible party, barcode, coding area ────────────────────
  const footY = H - 30 * PPMM
  c.font = font(kit.bodyFont, 2.6 * PPMM, 400)
  c.fillStyle = '#101418'
  if (p.responsibleParty) {
    let fy = footY
    c.font = font(kit.bodyFont, 2.6 * PPMM, 700)
    c.fillText(p.responsibleParty.name, M, fy)
    c.font = font(kit.bodyFont, 2.6 * PPMM, 400)
    fy += 3.1 * PPMM
    for (const l of p.responsibleParty.lines.slice(0, 3)) {
      c.fillText(l, M, fy)
      fy += 3.1 * PPMM
    }
    c.fillText(p.responsibleParty.country, M, fy)
  }

  const bw = Math.min(32 * PPMM, W * 0.3)
  const bh = bw * 0.56
  const bx = W - M - bw
  const by = H - M - bh
  const digits = (p.gtin ?? '').replace(/\s/g, '')
  if (!/^\d{12,13}$/.test(digits)) {
    // No usable GTIN: reserve the footprint and say so, rather than drawing
    // something barcode-shaped that would never scan.
    c.strokeStyle = '#b00020'
    c.setLineDash([6, 5])
    c.lineWidth = 3
    c.strokeRect(bx, by, bw, bh)
    c.setLineDash([])
    c.fillStyle = '#b00020'
    c.font = font(kit.bodyFont, 2.8 * PPMM, 700)
    c.fillText('GTIN REQUIRED', bx + 2.5 * PPMM, by + bh / 2)
  }

  // Lot / BBE reservation — drawn so nobody prints over it.
  c.strokeStyle = 'rgba(0,0,0,0.4)'
  c.setLineDash([4, 4])
  c.lineWidth = 2
  const lw = 34 * PPMM
  const lh = 6 * PPMM
  c.strokeRect(M, H - M - lh, lw, lh)
  c.setLineDash([])
  c.fillStyle = 'rgba(0,0,0,0.55)'
  c.font = font(kit.bodyFont, 2.3 * PPMM, 400)
  c.fillText('LOT / BBE — keep clear', M + 1.2 * PPMM, H - M - lh / 2 + 0.8 * PPMM)
}

function drawSide(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  M: number,
  p: ProductRecord,
  kit: BrandKit,
  fg: string,
) {
  c.save()
  c.translate(W / 2, H / 2)
  c.rotate(-Math.PI / 2)
  c.textAlign = 'center'
  c.fillStyle = fg
  c.font = font(kit.bodyFont, Math.min(H * 0.035, W * 0.3), 600)
  c.fillText(`${p.brand.toUpperCase()}  ·  ${p.productName.toUpperCase()}`, 0, 0)
  if (p.netQuantity) {
    c.font = font(kit.bodyFont, Math.min(H * 0.028, W * 0.24), 400)
    c.fillText(p.netQuantity.declaredAs.toUpperCase(), 0, Math.min(W * 0.32, 28))
  }
  c.restore()
  c.textAlign = 'left'
  void M
}

function drawEnd(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  M: number,
  p: ProductRecord,
  kit: BrandKit,
  fg: string,
) {
  c.textAlign = 'center'
  c.fillStyle = fg
  c.font = font(kit.displayFont, Math.min(W * 0.1, H * 0.28))
  c.fillText(p.brand.toUpperCase(), W / 2, H / 2 + Math.min(W * 0.035, H * 0.1))
  c.textAlign = 'left'
  void M
  void kit
}

export { roundRect }
