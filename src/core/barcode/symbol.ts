import { r2 } from '../units'
import { checkGtin, computeCheckDigit } from '../compliance/barcode'

/**
 * EAN-13 and UPC-A symbol generation.
 *
 * Written out rather than pulled from a library because the parts that matter
 * on a supplement pack are the print parameters, not the bar pattern: the
 * magnification the printer will run, the bar width reduction that compensates
 * for ink gain on the substrate, and the quiet zones nobody leaves room for.
 * A generic barcode library gives you a picture; this gives you a symbol with
 * its print spec attached.
 *
 * Module widths follow ISO/IEC 15420. At 100% magnification (SC2) a module is
 * 0.33 mm and the symbol is 95 modules wide.
 */

const NOMINAL_MODULE_MM = 0.33
const NOMINAL_HEIGHT_MM = 22.85
/** Quiet zones, in modules. The left is wider; both are routinely omitted. */
const QUIET_LEFT = 11
const QUIET_RIGHT = 7
/** Guard bars run 5 modules below the data bars. */
const GUARD_DROP_MODULES = 5

// ── Encoding tables (ISO/IEC 15420) ──────────────────────────────────────
const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']

/** Which of L/G each of the six left-hand digits uses, chosen by digit 1. */
const PARITY = [
  'LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
  'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL',
]

export interface BarcodeSpec {
  /** 80–200. Below 80% most retail scanners start failing. */
  magnification: number
  /** Bar width reduction in mm, to compensate for ink gain. Ask the printer. */
  barWidthReduction: number
  /** Draw the quiet-zone limit marks (the '>' character) either side. */
  quietZoneMarks: boolean
  /** Bar colour. Must be dark; red bars do not scan. */
  barColour: string
  background: string
}

export const DEFAULT_SPEC: BarcodeSpec = {
  magnification: 100,
  barWidthReduction: 0.02,
  quietZoneMarks: true,
  barColour: '#000000',
  background: '#ffffff',
}

export interface BarcodeResult {
  svg: string
  widthMm: number
  heightMm: number
  symbology: 'EAN-13' | 'UPC-A'
  gtin: string
  /** Print notes for the spec sheet. */
  notes: string[]
  warnings: string[]
}

export type BarcodeOutcome = BarcodeResult | { error: string }

/** Build the 95-module pattern for a 13-digit GTIN. */
function modulesFor(d: number[]): string {
  const parity = PARITY[d[0]]
  let bits = '101'
  for (let i = 0; i < 6; i++) bits += parity[i] === 'L' ? L[d[i + 1]] : G[d[i + 1]]
  bits += '01010'
  for (let i = 7; i < 13; i++) bits += R[d[i]]
  return bits + '101'
}

export function renderBarcode(raw: string | null, spec: BarcodeSpec = DEFAULT_SPEC): BarcodeOutcome {
  const verdict = checkGtin(raw)
  if (!verdict.ok) return { error: verdict.reason }

  // UPC-A is EAN-13 with a leading zero, and encodes identically.
  const gtin13 = verdict.symbology === 'UPC-A' ? '0' + verdict.gtin : verdict.gtin
  const digits = gtin13.split('').map(Number)
  const bits = modulesFor(digits)

  const mag = Math.min(200, Math.max(80, spec.magnification)) / 100
  const m = NOMINAL_MODULE_MM * mag
  const bwr = Math.max(0, spec.barWidthReduction)

  const symbolW = 95 * m
  const quietL = QUIET_LEFT * m
  const quietR = QUIET_RIGHT * m
  const totalW = quietL + symbolW + quietR
  const barsH = NOMINAL_HEIGHT_MM * mag
  const guardH = barsH + GUARD_DROP_MODULES * m
  const hriH = 2.6 * mag
  const totalH = guardH + hriH + 0.6 * mag

  // Guard positions, so those bars can be drawn full length.
  const isGuard = (i: number) =>
    i < 3 || (i >= 45 && i < 50) || i >= 92

  const rects: string[] = []
  let run = 0
  while (run < bits.length) {
    if (bits[run] === '0') {
      run++
      continue
    }
    let end = run
    while (end < bits.length && bits[end] === '1') end++
    const x = quietL + run * m
    const w = (end - run) * m - bwr
    const h = isGuard(run) ? guardH : barsH
    if (w > 0) rects.push(`<rect x="${r2(x + bwr / 2)}" y="0" width="${r2(w)}" height="${r2(h)}"/>`)
    run = end
  }

  // Human-readable line: the lead digit sits in the left quiet zone, then two
  // groups of six under the symbol halves.
  const hriY = guardH + hriH
  const fs = 2.4 * mag
  const text: string[] = []
  const t = (x: number, s: string, anchor = 'middle') =>
    `<text x="${r2(x)}" y="${r2(hriY)}" font-size="${r2(fs)}" text-anchor="${anchor}" font-family="OCR-B, 'Courier New', monospace">${s}</text>`

  if (verdict.symbology === 'EAN-13') {
    text.push(t(quietL - m * 2.5, gtin13[0], 'middle'))
    text.push(t(quietL + m * 24.5, gtin13.slice(1, 7), 'middle'))
    text.push(t(quietL + m * 71.5, gtin13.slice(7), 'middle'))
  } else {
    text.push(t(quietL + m * 24.5, verdict.gtin.slice(0, 6), 'middle'))
    text.push(t(quietL + m * 71.5, verdict.gtin.slice(6), 'middle'))
  }
  if (spec.quietZoneMarks) {
    text.push(t(quietL + symbolW + quietR - m * 1.5, '&gt;', 'middle'))
  }

  const warnings: string[] = []
  if (spec.magnification < 80) warnings.push(`Magnification ${spec.magnification}% is below the 80% floor for retail scanning.`)
  if (spec.magnification < 90) warnings.push(`At ${spec.magnification}% this is near the limit; check with the printer before committing.`)
  if (bwr === 0) warnings.push('No bar width reduction set. Ink gain will thicken the bars and can push the symbol out of tolerance — ask the printer for their figure.')
  if (bwr > m * 0.3) warnings.push(`Bar width reduction ${r2(bwr)} mm is large against a ${r2(m)} mm module; confirm it is per side and not total.`)

  const notes = [
    `${verdict.symbology}, GTIN ${verdict.gtin} (check digit ${computeCheckDigit(gtin13.slice(0, 12))} verified).`,
    `Magnification ${spec.magnification}%: module ${r2(m)} mm, symbol ${r2(symbolW)} mm wide, bars ${r2(barsH)} mm tall.`,
    `Quiet zones ${r2(quietL)} mm left and ${r2(quietR)} mm right — these are part of the symbol and must stay free of artwork.`,
    `Bar width reduction ${r2(bwr)} mm applied.`,
    'Bars must be dark on a light ground. Red, orange or yellow bars do not scan, and neither does a bar over a busy image.',
    'Human-readable digits are set here in a monospace fallback; supply OCR-B in the print file.',
  ]

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(totalW)}mm" height="${r2(totalH)}mm" viewBox="0 0 ${r2(totalW)} ${r2(totalH)}">
  <rect width="${r2(totalW)}" height="${r2(totalH)}" fill="${spec.background}"/>
  <g fill="${spec.barColour}">
    ${rects.join('\n    ')}
  </g>
  <g fill="${spec.barColour}">
    ${text.join('\n    ')}
  </g>
</svg>`

  return { svg, widthMm: totalW, heightMm: totalH, symbology: verdict.symbology, gtin: verdict.gtin, notes, warnings }
}
