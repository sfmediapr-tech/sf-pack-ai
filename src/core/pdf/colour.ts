/**
 * Colour for print.
 *
 * There is deliberately no hexToCmyk() in this file. A naive RGB→CMYK
 * conversion is exactly the silent wrongness this tool exists to prevent: it
 * turns a brand gold into mud and a rich black into a registration nightmare,
 * and nothing on screen tells you it happened. Press colours are declared as
 * CMYK or as named spots, by a person, or they do not go in the PDF.
 */

export interface Cmyk {
  /** 0..1 each. */
  c: number
  m: number
  y: number
  k: number
}

export const cmyk = (c: number, m: number, y: number, k: number): Cmyk => ({ c, m, y, k })

export const CMYK_BLACK = cmyk(0, 0, 0, 1)

export interface SpotColour {
  /** Separation name exactly as it must appear in the printer's separations. */
  name: string
  /** What the spot looks like when the press has no such ink — the tint transform target. */
  alternate: Cmyk
}

/**
 * Die line separations. The alternates follow the usual converter convention
 * (cut magenta, crease cyan) so a printer opening the file sees what they
 * expect even before they read the spec sheet.
 */
export const DIELINE_SPOTS: Record<string, SpotColour> = {
  'Dieline-Cut':    { name: 'Dieline-Cut',    alternate: cmyk(0, 1, 0, 0) },
  'Dieline-Crease': { name: 'Dieline-Crease', alternate: cmyk(1, 0, 0, 0) },
  'Dieline-Perf':   { name: 'Dieline-Perf',   alternate: cmyk(0.5, 0, 1, 0) },
  'Dieline-Glue':   { name: 'Dieline-Glue',   alternate: cmyk(0.4, 0.7, 0, 0) },
  'Dieline-Seal':   { name: 'Dieline-Seal',   alternate: cmyk(0, 0.85, 0.8, 0.1) },
  'Guide-Bleed':    { name: 'Guide-Bleed',    alternate: cmyk(0, 0.5, 1, 0) },
  'Guide-Safe':     { name: 'Guide-Safe',     alternate: cmyk(0.8, 0, 0.5, 0) },
  'Guide-Dims':     { name: 'Guide-Dims',     alternate: cmyk(0, 0, 0, 0.5) },
}

export const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000
  return Number.isInteger(r) ? String(r) : String(r)
}

export const cmykOperands = (v: Cmyk) => `${fmt(v.c)} ${fmt(v.m)} ${fmt(v.y)} ${fmt(v.k)}`

/**
 * A press colour the job actually prints in, as opposed to a die line
 * separation. Declared, never derived.
 */
export interface PressColour {
  label: string
  kind: 'process' | 'spot'
  cmyk: Cmyk
  /** For a spot: the ink name, e.g. "PANTONE 872 C". */
  spotName?: string
}

export function separationList(press: PressColour[]): string[] {
  const out: string[] = []
  if (press.some((p) => p.kind === 'process')) out.push('Cyan', 'Magenta', 'Yellow', 'Black')
  for (const p of press) if (p.kind === 'spot' && p.spotName) out.push(p.spotName)
  return [...new Set(out)]
}
