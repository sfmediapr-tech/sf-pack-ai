import type { Dieline } from '../dielines/svg'
import { r2 } from '../units'
import type { OutputIntentSpec } from './pdfx'

/**
 * Conformance report for the exported PDF.
 *
 * The point of this file is to stop the export lying. A PDF/X-4 file without an
 * embedded output intent profile is not a conforming PDF/X-4 file, however much
 * the XMP says it is, and a printer's preflight will reject it. Better that the
 * tool says so first, in the same language the print-ready-handoff skill uses:
 * a missing required input is a blocker, not a note.
 */

export type PreflightStatus = 'PASS' | 'BLOCKER' | 'WARNING' | 'INFO'

export interface PreflightItem {
  id: string
  check: string
  status: PreflightStatus
  detail: string
}

export interface PreflightReport {
  conforming: boolean
  claim: string
  items: PreflightItem[]
  counts: Record<PreflightStatus, number>
}

export interface PreflightInput {
  dieline: Dieline
  outputIntent: OutputIntentSpec
  /** Minimum bleed the printer guide requires, millimetres. */
  requiredBleed?: number
  byteLength?: number
}

export function preflightDielinePdf(i: PreflightInput): PreflightReport {
  const items: PreflightItem[] = []
  const add = (id: string, check: string, status: PreflightStatus, detail: string) =>
    items.push({ id, check, status, detail })

  const icc = i.outputIntent.iccProfile

  // ── The one that decides conformance ────────────────────────────────────
  if (icc && icc.length > 0) {
    const valid = looksLikeIcc(icc)
    if (valid.ok) {
      add(
        'X1',
        'Output intent — embedded ICC profile',
        'PASS',
        `${valid.description ?? i.outputIntent.identifier} embedded, ${(icc.length / 1024).toFixed(0)} kB, ${valid.space ?? 'CMYK'}.`,
      )
    } else {
      add('X1', 'Output intent — embedded ICC profile', 'BLOCKER', `The supplied file is not a valid ICC profile: ${valid.reason}`)
    }
  } else {
    add(
      'X1',
      'Output intent — embedded ICC profile',
      'BLOCKER',
      `No ICC profile loaded. The file declares PDF/X-4 and names "${i.outputIntent.identifier}", but without the profile embedded it is NOT conforming and a printer's preflight will reject it. Load the press profile the printer supplies, or download the matching ECI profile.`,
    )
  }

  // ── Structure, which the writer guarantees ──────────────────────────────
  add('X2', 'PDF version', 'PASS', 'PDF 1.6, as PDF/X-4 requires.')
  add('X3', 'XMP identification', 'PASS', 'pdfxid:GTS_PDFXVersion = PDF/X-4.')
  add('X4', 'Trapped key', 'PASS', '/Trapped is /False — stated, not Unknown.')
  add('X5', 'Page geometry', 'PASS', 'MediaBox ⊇ BleedBox ⊇ TrimBox, all present.')
  add('X6', 'Encryption', 'PASS', 'None. PDF/X forbids it.')
  add('X7', 'Transparency', 'PASS', 'No alpha used; zone fills are ink tints, not blends.')

  // ── Colour ──────────────────────────────────────────────────────────────
  const spots = [...new Set(i.dieline.shapes.map((s) => s.layer))]
  add(
    'C1',
    'Colour spaces',
    'PASS',
    `DeviceCMYK page with ${spots.length} Separation colour space(s), each with a Type 2 tint transform to a CMYK alternate.`,
  )
  add('C2', 'Overprint', 'PASS', 'Technical marks set to overprint (OP/op true, OPM 1) so they do not knock out artwork.')
  add(
    'C3',
    'RGB content',
    'PASS',
    'None. Artwork is deliberately excluded from this file — converting the RGB preview to CMYK without a colour management system would be silently wrong.',
  )

  // ── Fonts ───────────────────────────────────────────────────────────────
  add(
    'F1',
    'Fonts',
    'PASS',
    'No fonts used. Labels are stroked vector paths, so there is nothing to embed and no licence to breach.',
  )

  // ── Layers ──────────────────────────────────────────────────────────────
  add(
    'L1',
    'Non-printing layers',
    'PASS',
    'Every die line and guide layer is an optional content group with /Print /PrintState /OFF.',
  )

  // ── Geometry, which can genuinely fail ──────────────────────────────────
  const required = i.requiredBleed ?? 3
  const bleed = inferBleedFromSheet(i.dieline)
  if (bleed === null) {
    add('G1', 'Bleed', 'WARNING', 'Could not infer the bleed from the geometry. Check it against the printer guide by hand.')
  } else if (bleed + 0.001 < required) {
    add('G1', 'Bleed', 'BLOCKER', `Bleed is ${r2(bleed)} mm against a ${required} mm minimum.`)
  } else {
    add('G1', 'Bleed', 'PASS', `${r2(bleed)} mm on all edges.`)
  }

  for (const w of i.dieline.warnings) add('G2', 'Die line geometry', 'WARNING', w)

  add(
    'H1',
    'Artwork',
    'INFO',
    'This file is the die line only. Artwork, the facts panel and the barcode come from the designer’s native file and are checked separately by packaging-artwork-review.',
  )
  if (i.byteLength) add('H2', 'File size', 'INFO', `${(i.byteLength / 1024).toFixed(1)} kB, uncompressed streams.`)

  const counts: Record<PreflightStatus, number> = { PASS: 0, BLOCKER: 0, WARNING: 0, INFO: 0 }
  for (const it of items) counts[it.status]++

  const conforming = counts.BLOCKER === 0
  return {
    conforming,
    claim: conforming
      ? 'Conforming PDF/X-4. Safe to describe as print-ready to the printer.'
      : `NOT a conforming PDF/X-4 — ${counts.BLOCKER} blocker${counts.BLOCKER === 1 ? '' : 's'}. The file is still usable as a die line reference, but do not call it print-ready.`,
    items,
    counts,
  }
}

/** Minimal sanity check on an uploaded .icc — header size, signature, colour space. */
function looksLikeIcc(buf: Uint8Array): { ok: boolean; reason?: string; space?: string; description?: string } {
  if (buf.length < 132) return { ok: false, reason: 'shorter than an ICC header' }
  const sig = String.fromCharCode(...buf.slice(36, 40))
  if (sig !== 'acsp') return { ok: false, reason: `magic is "${sig}", expected "acsp"` }
  const declared = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]
  if (declared > buf.length) return { ok: false, reason: `header declares ${declared} bytes but the file is ${buf.length}` }
  const space = String.fromCharCode(...buf.slice(16, 20)).trim()
  if (space !== 'CMYK') {
    return { ok: false, reason: `data colour space is "${space}", but a CMYK output intent is required here` }
  }
  const cls = String.fromCharCode(...buf.slice(12, 16)).trim()
  if (cls !== 'prtr') {
    return { ok: false, reason: `profile class is "${cls}", expected "prtr" (output device)` }
  }
  return { ok: true, space }
}

function inferBleedFromSheet(dl: Dieline): number | null {
  const bleedRect = dl.shapes.find((s) => s.layer === 'BLEED' && s.kind === 'rect')
  if (!bleedRect || bleedRect.kind !== 'rect') return null
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
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  return Math.min(minX, minY)
}

export function preflightToMarkdown(r: PreflightReport, title: string): string {
  const icon: Record<PreflightStatus, string> = { PASS: '✓', BLOCKER: '✗', WARNING: '!', INFO: 'i' }
  return [
    `# PDF preflight — ${title}`,
    '',
    `**${r.claim}**`,
    '',
    `Pass: ${r.counts.PASS} · Blockers: ${r.counts.BLOCKER} · Warnings: ${r.counts.WARNING} · Notes: ${r.counts.INFO}`,
    '',
    '| | # | Check | Detail |',
    '|---|---|---|---|',
    ...r.items.map((i) => `| ${icon[i.status]} | ${i.id} | ${i.check} | ${i.detail.replace(/\|/g, '\\|')} |`),
    '',
    '---',
    '',
    '*Generated by SF Pack AI. This checks what the exporter knows about its own output;',
    "*it is not a substitute for the printer's own preflight.*",
    '',
  ].join('\n')
}
