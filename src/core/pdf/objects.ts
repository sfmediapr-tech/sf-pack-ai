/**
 * A small, dependency-free PDF writer.
 *
 * Written rather than pulled in because PDF/X-4 needs three things the general
 * purpose libraries either do not expose or fight you over: Separation colour
 * spaces with real tint transforms, an OutputIntent carrying an embedded ICC
 * profile, and optional content groups whose print state is OFF. Doing those
 * through someone else's abstraction means dropping to raw dictionaries anyway.
 *
 * Streams are written uncompressed. Die line content is a few kilobytes and an
 * uncompressed file is one less thing between you and a printer who says the
 * file will not open.
 */

export type Chunk = string | Uint8Array

export interface Ref {
  num: number
  gen: 0
}

const enc = new TextEncoder()

const byteLength = (c: Chunk) => (typeof c === 'string' ? enc.encode(c).length : c.length)

export const refStr = (r: Ref) => `${r.num} ${r.gen} R`

/** PDF name: slashes and spaces have to be escaped as #xx. */
export function name(s: string): string {
  return '/' + s.replace(/[^A-Za-z0-9._-]/g, (ch) => '#' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
}

/** PDF literal string, with the three characters that must be escaped. */
export function str(s: string): string {
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'
}

/** PDF date: D:YYYYMMDDHHmmSS+HH'mm' */
export function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const oh = p(Math.floor(Math.abs(off) / 60))
  const om = p(Math.abs(off) % 60)
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds(),
  )}${sign}${oh}'${om}'`
}

export function dict(entries: Record<string, string | undefined>): string {
  const body = Object.entries(entries)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${name(k)} ${v}`)
    .join('\n  ')
  return `<<\n  ${body}\n>>`
}

export function array(items: string[]): string {
  return `[ ${items.join(' ')} ]`
}

export class PdfDoc {
  private bodies = new Map<number, Chunk[]>()
  private next = 1

  ref(): Ref {
    return { num: this.next++, gen: 0 }
  }

  /** Define an object. Pass a ref to fill one reserved earlier. */
  obj(body: Chunk | Chunk[], into?: Ref): Ref {
    const r = into ?? this.ref()
    this.bodies.set(r.num, Array.isArray(body) ? body : [body])
    return r
  }

  /**
   * Define a stream object. `Length` is written as a direct integer, which is
   * legal and avoids the indirect-length dance.
   */
  stream(extra: Record<string, string | undefined>, data: Chunk, into?: Ref): Ref {
    const len = byteLength(data)
    const d = dict({ ...extra, Length: String(len) })
    return this.obj([d, '\nstream\n', data, '\nendstream'], into)
  }

  /** Serialise the whole file, computing byte-accurate cross-reference offsets. */
  build(catalog: Ref, info: Ref, fileId: string): Uint8Array {
    const out: Chunk[] = []
    let pos = 0
    const push = (c: Chunk) => {
      out.push(c)
      pos += byteLength(c)
    }

    // The binary comment tells transfer agents the file is not plain text.
    push('%PDF-1.6\n')
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    const maxNum = this.next - 1
    const offsets = new Array<number>(maxNum + 1).fill(0)

    for (let n = 1; n <= maxNum; n++) {
      const body = this.bodies.get(n)
      if (!body) continue
      offsets[n] = pos
      push(`${n} 0 obj\n`)
      for (const c of body) push(c)
      push('\nendobj\n')
    }

    const xrefPos = pos
    const lines: string[] = [`xref\n0 ${maxNum + 1}\n`, '0000000000 65535 f \n']
    for (let n = 1; n <= maxNum; n++) {
      lines.push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
    }
    push(lines.join(''))

    push(
      `trailer\n${dict({
        Size: String(maxNum + 1),
        Root: refStr(catalog),
        Info: refStr(info),
        ID: `[ <${fileId}> <${fileId}> ]`,
      })}\nstartxref\n${xrefPos}\n%%EOF\n`,
    )

    const total = out.reduce((a, c) => a + byteLength(c), 0)
    const buf = new Uint8Array(total)
    let o = 0
    for (const c of out) {
      const bytes = typeof c === 'string' ? enc.encode(c) : c
      buf.set(bytes, o)
      o += bytes.length
    }
    return buf
  }
}

/** Deterministic-ish 32 hex char file identifier. */
export function makeFileId(seed: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 + seed.charCodeAt(i) + i, 2246822519) >>> 0
  }
  const part = (n: number) => n.toString(16).padStart(8, '0')
  return (part(h1) + part(h2) + part(h1 ^ h2) + part((h1 + h2) >>> 0)).slice(0, 32)
}
