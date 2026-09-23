/**
 * Placeholder detection. Every one of these has survived to a "proof" on a real
 * job at least once — see the lessons list in docs/workflow-map.md.
 */
const PATTERNS: { re: RegExp; what: string }[] = [
  { re: /lorem\s+ipsum/i, what: 'lorem ipsum' },
  { re: /\bX{4,}\b/, what: 'XXXX placeholder' },
  { re: /\[\s*tbc\s*\]|\bTBC\b|\bTBD\b/i, what: 'TBC / TBD' },
  { re: /\bplaceholder\b/i, what: 'the word "placeholder"' },
  { re: /\bsample\s+text\b/i, what: 'sample text' },
  { re: /\bYOUR\s+(BRAND|LOGO|TEXT)\b/i, what: 'template boilerplate' },
  { re: /\bNPN\s*[:#]?\s*X+/i, what: 'placeholder NPN' },
  { re: /\b(00000|99999)\b/, what: 'filler digits' },
  { re: /\bdd\/mm\/yy+\b/i, what: 'date mask left in' },
  { re: /\bINSERT\b/i, what: '"INSERT" instruction' },
]

export interface PlaceholderHit {
  what: string
  excerpt: string
  where: string
}

export function findPlaceholders(fields: Record<string, string | null | undefined>): PlaceholderHit[] {
  const hits: PlaceholderHit[] = []
  for (const [where, value] of Object.entries(fields)) {
    if (!value) continue
    for (const p of PATTERNS) {
      const m = p.re.exec(value)
      if (m) hits.push({ what: p.what, excerpt: m[0], where })
    }
  }
  return hits
}

/**
 * Catch a trademark or brand name spelled two ways across the pack. One real job
 * carried "Cognizin" and "Cogitzin" on the same face.
 */
export function findNearDuplicateTerms(terms: string[], maxDistance = 2): [string, string][] {
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))]
  const out: [string, string][] = []
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i]
      const b = unique[j]
      if (a.toLowerCase() === b.toLowerCase()) continue
      if (Math.abs(a.length - b.length) > maxDistance) continue
      if (levenshtein(a.toLowerCase(), b.toLowerCase()) <= maxDistance) out.push([a, b])
    }
  }
  return out
}

export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}
