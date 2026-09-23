import type { Ingredient, ProductRecord } from '../types'
import { r2 } from '../units'
import { formatNrvPercent, percentNrv } from './nrv'

/**
 * Facts panel renderer. Produces SVG in millimetres so the output drops onto a
 * die line at true size.
 *
 * The US Supplement Facts box has prescribed rules — a heavy outer box, a thick
 * bar under the heading, a thick bar above the footnote, hairlines between rows
 * and the daggered "Daily Value not established" footnote. Those bar weights are
 * not decoration, so they are encoded here rather than left to a designer.
 */

export interface PanelResult {
  svg: string
  widthMm: number
  heightMm: number
  /** Anything the panel could not render properly. */
  warnings: string[]
}

const FONT = 'Helvetica, Arial, sans-serif'

interface Row {
  label: string
  amount: string
  right: string
  indent: number
  bold: boolean
  hairline: boolean
}

function amountText(i: Ingredient): string {
  if (i.amount === null) return '—'
  const n = i.amount >= 100 ? Math.round(i.amount) : Math.round(i.amount * 100) / 100
  return `${n} ${i.unit}`
}

export function renderFactsPanel(p: ProductRecord, widthMm = 60): PanelResult {
  switch (p.panelType) {
    case 'us-supplement-facts':
    case 'us-nutrition-facts':
      return renderUsPanel(p, widthMm)
    case 'gb-eu-nutrition':
      return renderGbPanel(p, widthMm)
    case 'ca-nhp-split':
      return renderCaPanel(p, widthMm)
    case 'none':
      return { svg: emptySvg(widthMm), widthMm, heightMm: 10, warnings: ['No panel type set.'] }
  }
}

const emptySvg = (w: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="10mm" viewBox="0 0 ${w} 10"></svg>`

// ── US Supplement Facts ──────────────────────────────────────────────────
function renderUsPanel(p: ProductRecord, W: number): PanelResult {
  const warnings: string[] = []
  const pad = 1.6
  const inner = W - pad * 2

  const title = p.panelType === 'us-supplement-facts' ? 'Supplement Facts' : 'Nutrition Facts'
  const actives = p.ingredients.filter((i) => i.active)
  const others = p.ingredients.filter((i) => !i.active)

  const rows: Row[] = actives.map((i) => {
    const pct = percentNrv(i.nrvKey, i.amount, i.unit)
    return {
      label: i.name + (i.branded ? i.branded.mark : ''),
      amount: amountText(i),
      right: pct === null ? '†' : `${Math.round(pct)}%`,
      indent: 0,
      bold: false,
      hairline: true,
    }
  })

  const hasDagger = rows.some((r) => r.right === '†')

  // Vertical rhythm, millimetres.
  const yTitle = 7.5
  const rowH = 4.2
  let y = 0
  const out: string[] = []

  const rule = (yy: number, weight: number) =>
    `<line x1="${pad}" y1="${r2(yy)}" x2="${r2(W - pad)}" y2="${r2(yy)}" stroke="#000" stroke-width="${weight}"/>`

  // Title
  out.push(
    `<text x="${pad}" y="${yTitle}" font-family="${FONT}" font-size="7" font-weight="bold" letter-spacing="-0.2">${esc(title)}</text>`,
  )
  y = yTitle + 1.6
  out.push(rule(y, 0.3))

  // Serving lines
  y += 3.6
  out.push(
    `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="3.1">Serving Size ${esc(p.servingSize || '—')}</text>`,
  )
  if (p.servingsPerContainer) {
    y += 3.6
    out.push(
      `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="3.1">Servings Per Container ${p.servingsPerContainer}</text>`,
    )
  } else {
    warnings.push('Servings per container is missing — the panel is printing without it.')
  }

  y += 1.4
  out.push(rule(y, 1.0)) // thick bar

  // Column headers
  y += 3.4
  out.push(
    `<text x="${r2(W - pad)}" y="${r2(y)}" text-anchor="end" font-family="${FONT}" font-size="2.9" font-weight="bold">% Daily Value</text>`,
  )
  out.push(
    `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.9" font-weight="bold">Amount Per Serving</text>`,
  )
  y += 1.1
  out.push(rule(y, 0.3))

  // Rows. Ingredient names on a supplement pack routinely run to forty
  // characters ("Magnesium (as magnesium bisglycinate)"), so the name wraps and
  // the numeric columns stay on their own right-aligned tracks rather than
  // being overrun.
  const pctColX = W - pad
  const amtColX = W - pad - 11
  const nameW = W - pad * 2 - 24
  for (const r of rows) {
    const nameLines = wrap(r.label, nameW, 3.1)
    y += rowH
    out.push(
      `<text x="${r2(pad + r.indent)}" y="${r2(y - 1.2)}" font-family="${FONT}" font-size="3.1" font-weight="bold">${esc(
        nameLines[0],
      )}</text>`,
    )
    out.push(
      `<text x="${r2(amtColX)}" y="${r2(y - 1.2)}" text-anchor="end" font-family="${FONT}" font-size="3.1">${esc(r.amount)}</text>`,
    )
    out.push(
      `<text x="${r2(pctColX)}" y="${r2(y - 1.2)}" text-anchor="end" font-family="${FONT}" font-size="3.1" font-weight="bold">${esc(
        r.right,
      )}</text>`,
    )
    for (let i = 1; i < nameLines.length; i++) {
      y += 3.5
      out.push(
        `<text x="${r2(pad + r.indent)}" y="${r2(y - 1.2)}" font-family="${FONT}" font-size="3.1" font-weight="bold">${esc(
          nameLines[i],
        )}</text>`,
      )
    }
    out.push(rule(y, 0.15))
    if (nameW < 14) {
      warnings.push(`"${r.label}" has only ${r2(nameW)} mm of name column at ${r2(W)} mm panel width.`)
    }
  }

  if (!rows.length) {
    y += rowH
    out.push(
      `<text x="${pad}" y="${r2(y - 1.2)}" font-family="${FONT}" font-size="3.1" fill="#b00">No actives on the record.</text>`,
    )
    warnings.push('No active ingredients — the panel body is empty.')
  }

  // Footnote
  y += 0.6
  out.push(rule(y, 1.0))
  if (hasDagger) {
    y += 3.4
    out.push(
      `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.7">† Daily Value not established.</text>`,
    )
  }

  // Other ingredients — outside the box in the real thing, kept below here.
  if (others.length) {
    y += 4.2
    const line = `Other ingredients: ${others.map((i) => i.name).join(', ')}.`
    const wrapped = wrap(line, inner, 2.9)
    for (const w of wrapped) {
      out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.9">${esc(w)}</text>`)
      y += 3.3
    }
  }

  if (p.allergenStatement) {
    y += 1.2
    for (const w of wrap(p.allergenStatement, inner, 2.9)) {
      out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.9" font-weight="bold">${esc(w)}</text>`)
      y += 3.3
    }
  }

  const H = y + pad + 1
  const box = `<rect x="0.4" y="0.4" width="${r2(W - 0.8)}" height="${r2(H - 0.8)}" fill="#fff" stroke="#000" stroke-width="0.8"/>`

  if (W < 32) warnings.push(`Panel width ${r2(W)} mm is below the ~32 mm where a Supplement Facts box stays legible.`)

  return { svg: svgWrap(W, H, box + out.join('')), widthMm: W, heightMm: H, warnings }
}

// ── GB / EU nutrition declaration ────────────────────────────────────────
function renderGbPanel(p: ProductRecord, W: number): PanelResult {
  const warnings: string[] = []
  const pad = 1.6
  const inner = W - pad * 2
  const actives = p.ingredients.filter((i) => i.active)
  const others = p.ingredients.filter((i) => !i.active)

  const out: string[] = []
  let y = 5.5

  out.push(
    `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="4.4" font-weight="bold">Nutrition Information</text>`,
  )
  y += 4
  out.push(
    `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.9">Per serving (${esc(p.servingSize || '—')})</text>`,
  )
  y += 1.2
  out.push(`<line x1="${pad}" y1="${r2(y)}" x2="${r2(W - pad)}" y2="${r2(y)}" stroke="#000" stroke-width="0.5"/>`)

  y += 3.4
  out.push(
    `<text x="${r2(W - pad)}" y="${r2(y)}" text-anchor="end" font-family="${FONT}" font-size="2.8" font-weight="bold">% NRV</text>`,
  )
  out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.8" font-weight="bold">Per serving</text>`)
  y += 0.9
  out.push(`<line x1="${pad}" y1="${r2(y)}" x2="${r2(W - pad)}" y2="${r2(y)}" stroke="#000" stroke-width="0.2"/>`)

  let anyDagger = false
  const gbNameW = W - pad * 2 - 24
  for (const i of actives) {
    const pct = percentNrv(i.nrvKey, i.amount, i.unit)
    const pctText = formatNrvPercent(pct)
    if (pctText === '†') anyDagger = true
    const nameLines = wrap(i.name + (i.branded ? i.branded.mark : ''), gbNameW, 3)
    y += 4
    out.push(`<text x="${pad}" y="${r2(y - 1.2)}" font-family="${FONT}" font-size="3">${esc(nameLines[0])}</text>`)
    out.push(
      `<text x="${r2(W - pad - 11)}" y="${r2(y - 1.2)}" text-anchor="end" font-family="${FONT}" font-size="3">${esc(amountText(i))}</text>`,
    )
    out.push(
      `<text x="${r2(W - pad)}" y="${r2(y - 1.2)}" text-anchor="end" font-family="${FONT}" font-size="3">${esc(pctText)}</text>`,
    )
    for (let k = 1; k < nameLines.length; k++) {
      y += 3.4
      out.push(`<text x="${pad}" y="${r2(y - 1.2)}" font-family="${FONT}" font-size="3">${esc(nameLines[k])}</text>`)
    }
    out.push(`<line x1="${pad}" y1="${r2(y)}" x2="${r2(W - pad)}" y2="${r2(y)}" stroke="#000" stroke-width="0.1"/>`)
  }

  if (!actives.length) warnings.push('No active ingredients — the declaration is empty.')

  if (anyDagger) {
    y += 3.4
    out.push(
      `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.5">† Nutrient Reference Value not established.</text>`,
    )
  }

  // Ingredient list, allergens emphasised.
  y += 4.4
  const listSource = [...actives, ...others]
  const listText = `Ingredients: ${listSource.map((i) => i.name).join(', ')}.`
  for (const w of wrap(listText, inner, 2.8)) {
    out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.8">${esc(w)}</text>`)
    y += 3.2
  }
  if (p.allergenStatement) {
    y += 0.8
    for (const w of wrap(p.allergenStatement, inner, 2.8)) {
      out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.8" font-weight="bold">${esc(w)}</text>`)
      y += 3.2
    }
  }

  // Statutory descriptor and directions.
  y += 1.6
  out.push(
    `<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="3.2" font-weight="bold">${esc(p.statutoryName || 'Food Supplement')}</text>`,
  )
  y += 3.6
  for (const w of wrap(p.directions || 'Directions: —', inner, 2.8)) {
    out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.8">${esc(w)}</text>`)
    y += 3.2
  }

  if (p.warnings.length) {
    y += 1.4
    const boxTop = y - 2.6
    const lines: string[] = []
    for (const wline of p.warnings) lines.push(...wrap(wline, inner - 2, 2.7))
    for (const w of lines) {
      out.push(`<text x="${r2(pad + 1)}" y="${r2(y)}" font-family="${FONT}" font-size="2.7">${esc(w)}</text>`)
      y += 3.1
    }
    out.push(
      `<rect x="${r2(pad - 0.4)}" y="${r2(boxTop)}" width="${r2(inner + 0.8)}" height="${r2(y - boxTop - 1.2)}" fill="none" stroke="#000" stroke-width="0.3"/>`,
    )
    y += 1
  }

  if (p.storage) {
    y += 2.4
    for (const w of wrap(p.storage, inner, 2.7)) {
      out.push(`<text x="${pad}" y="${r2(y)}" font-family="${FONT}" font-size="2.7">${esc(w)}</text>`)
      y += 3.1
    }
  }

  const H = y + pad
  if (W < 35) warnings.push(`Panel width ${r2(W)} mm — GB back-of-pack rarely fits under 35 mm without going below 6 pt.`)

  return {
    svg: svgWrap(W, H, `<rect x="0" y="0" width="${r2(W)}" height="${r2(H)}" fill="#fff"/>` + out.join('')),
    widthMm: W,
    heightMm: H,
    warnings,
  }
}

// ── Canada NHP split ─────────────────────────────────────────────────────
function renderCaPanel(p: ProductRecord, W: number): PanelResult {
  const base = renderGbPanel(p, W)
  return {
    ...base,
    warnings: [
      ...base.warnings,
      'Canadian NHP panels must split medicinal and non-medicinal ingredients and carry both languages. This render is a GB-shaped placeholder — do not use it as a proof.',
    ],
  }
}

// ── helpers ──────────────────────────────────────────────────────────────
function wrap(text: string, widthMm: number, sizeMm: number): string[] {
  const charW = sizeMm * 0.52
  const max = Math.max(8, Math.floor(widthMm / charW))
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur.length) cur = w
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const svgWrap = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(w)}mm" height="${r2(h)}mm" viewBox="0 0 ${r2(w)} ${r2(h)}">${body}</svg>`
