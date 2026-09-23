/** GS1 check-digit verification for EAN-13 / UPC-A, and placeholder detection. */

export type BarcodeVerdict =
  | { ok: true; symbology: 'EAN-13' | 'UPC-A'; gtin: string }
  | { ok: false; reason: string; placeholder: boolean }

const PLACEHOLDER_PATTERNS = [
  /^0+$/,
  /^(\d)\1+$/,          // 1111111111111
  /^1234567/,
  /^0123456/,
  /^9{6,}/,
  /x/i,
]

export function checkGtin(raw: string | null): BarcodeVerdict {
  if (!raw || !raw.trim()) {
    return { ok: false, reason: 'No GTIN on the record.', placeholder: false }
  }
  const s = raw.replace(/[\s-]/g, '')

  if (/[^0-9]/.test(s)) {
    return { ok: false, reason: `"${raw}" is not all digits — looks like a placeholder block.`, placeholder: true }
  }
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(s))) {
    return { ok: false, reason: `"${raw}" is a placeholder sequence, not an allocated GTIN.`, placeholder: true }
  }
  if (s.length !== 13 && s.length !== 12) {
    return { ok: false, reason: `${s.length} digits — expected 13 (EAN-13) or 12 (UPC-A).`, placeholder: false }
  }

  const symbology = s.length === 13 ? 'EAN-13' : 'UPC-A'
  if (!checkDigitValid(s)) {
    return {
      ok: false,
      reason: `Check digit fails. Last digit is ${s.slice(-1)}, should be ${computeCheckDigit(s.slice(0, -1))}.`,
      placeholder: false,
    }
  }
  return { ok: true, symbology, gtin: s }
}

export function computeCheckDigit(body: string): number {
  // Weight 3 and 1 alternating, from the right of the body.
  let sum = 0
  const digits = body.split('').map(Number).reverse()
  digits.forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1)
  })
  return (10 - (sum % 10)) % 10
}

export function checkDigitValid(full: string): boolean {
  return computeCheckDigit(full.slice(0, -1)) === Number(full.slice(-1))
}
