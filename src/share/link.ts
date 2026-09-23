import type { Dimensions, PackFormat, ProductRecord } from '../core/types'

/**
 * Shareable links.
 *
 * The whole pack state is compressed into the URL **fragment**, not a query
 * string. That is a deliberate privacy choice, not a technical one: a fragment
 * is never sent to the server, so a client's formulation — doses, branded
 * ingredients, unreleased product names — never lands in an access log, a CDN
 * cache or an analytics record. It also means sharing costs nothing and needs
 * no database, no account and no login.
 *
 * The trade-off is link length. Compressed, a full record is usually under
 * 1.5 kB, which every mainstream browser and mail client handles.
 */

export interface ShareState {
  /** Schema version, so an old link can be read or rejected honestly. */
  v: 1
  record: ProductRecord
  format: PackFormat
  dims: Dimensions
  kit: string
}

const PREFIX = '#p='

const toBase64Url = (bytes: Uint8Array) => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const stream = new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

export async function encodeShare(state: ShareState): Promise<string> {
  return toBase64Url(await gzip(JSON.stringify(state)))
}

export async function decodeShare(encoded: string): Promise<ShareState | null> {
  try {
    const parsed = JSON.parse(await gunzip(fromBase64Url(encoded))) as ShareState
    // Reject anything we cannot read rather than rendering half a pack.
    if (parsed?.v !== 1 || !parsed.record || !parsed.format || !parsed.dims) return null
    return parsed
  } catch {
    return null
  }
}

/** Build the full link for the current page. */
export async function shareUrl(state: ShareState): Promise<string> {
  const { origin, pathname } = window.location
  return `${origin}${pathname}${PREFIX}${await encodeShare(state)}`
}

/**
 * Take the shared payload out of the URL.
 *
 * The strip is synchronous and happens before any decoding, so the address bar
 * is clean the instant the page loads rather than a few hundred milliseconds
 * later once a promise settles. That ordering is the point: until it runs, the
 * client's formulation is sitting in the URL, and anything that reads the URL
 * in between — a bookmark, a screenshot, a back-button entry — captures it.
 */
export function takeShareFromUrl(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith(PREFIX)) return null
  const payload = hash.slice(PREFIX.length)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return payload
}

/**
 * Captured once, at module load, before React mounts anything.
 *
 * This deliberately runs as a module side effect. Doing it inside an effect
 * means React's StrictMode double-mount strips the URL on the first pass and
 * then finds nothing on the second, losing the pack entirely — and it leaves
 * the record in the address bar until React gets round to it. Reading it here
 * happens once, earliest, and is immune to the component lifecycle.
 */
const initialPayload: string | null = typeof window === 'undefined' ? null : takeShareFromUrl()

/** The shared payload this page was opened with, if any. Safe to call repeatedly. */
export function initialShare(): string | null {
  return initialPayload
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
