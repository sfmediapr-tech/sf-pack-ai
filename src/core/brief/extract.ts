import type { Ingredient, Market, PackFormat } from '../types'
import { NRV } from '../panels/nrv'
import type { Extraction, Gap, RecordOp } from './ops'

/**
 * Deterministic brief extractor.
 *
 * It reads a typed brief and fills what it can actually find, quoting the
 * phrase it found it in. What it cannot find becomes a question, never a guess.
 *
 * This runs with no API key and no model, which makes it the honest baseline:
 * everything it produces is traceable to a substring of what the client wrote.
 * A language model can be dropped in behind the same `Extraction` contract to
 * handle looser phrasing — it would still be held to the same rule.
 */

const FORMAT_WORDS: [RegExp, PackFormat, string][] = [
  [/\b(stand.?up\s+pouch|doypack|pouch|bag)\b/i, 'stand-up-pouch', 'pouch'],
  [/\b(stick\s?pack|stickpack|sachet|single.?serve\s+stick)\b/i, 'stick-pack', 'stick pack'],
  [/\b(carton|folding\s+box|outer\s+box|tuck\s?end|sleeve|box)\b/i, 'tuck-end-carton', 'carton'],
  [/\b(jar|tub|capsule\s+pot)\b/i, 'jar-wrap-label', 'jar'],
  [/\b(bottle|dropper|liquid\s+bottle)\b/i, 'bottle-wrap-label', 'bottle'],
]

const MARKET_WORDS: [RegExp, Market][] = [
  [/\b(uk|u\.k\.|gb|great\s+britain|britain|british|england|scotland|wales)\b/i, 'GB'],
  [/\b(eu|e\.u\.|europe|european\s+union|germany|france|spain|italy|netherlands|ireland)\b/i, 'EU'],
  [/\b(us|u\.s\.|usa|united\s+states|america|american|fda|dshea)\b/i, 'US'],
  [/\b(canada|canadian|health\s+canada|nhp|npn)\b/i, 'CA'],
]

/** Ingredient names the engine can map to an NRV, so %NRV computes. */
const NRV_ALIASES: [RegExp, string][] = [
  [/\bmagnesium\b/i, 'magnesium'],
  [/\bzinc\b/i, 'zinc'],
  [/\biron\b/i, 'iron'],
  [/\bcalcium\b/i, 'calcium'],
  [/\bselenium\b/i, 'selenium'],
  [/\biodine\b/i, 'iodine'],
  [/\bcopper\b/i, 'copper'],
  [/\bmanganese\b/i, 'manganese'],
  [/\bchromium\b/i, 'chromium'],
  [/\bpotassium\b/i, 'potassium'],
  [/\bvitamin\s*a\b/i, 'vitamin-a'],
  [/\bvitamin\s*d3?\b/i, 'vitamin-d'],
  [/\bvitamin\s*e\b/i, 'vitamin-e'],
  [/\bvitamin\s*k2?\b/i, 'vitamin-k'],
  [/\bvitamin\s*c\b|ascorbic\s+acid/i, 'vitamin-c'],
  [/\bvitamin\s*b12\b|cobalamin/i, 'vitamin-b12'],
  [/\bvitamin\s*b6\b|pyridox/i, 'vitamin-b6'],
  [/\bthiamin/i, 'thiamin'],
  [/\briboflavin\b/i, 'riboflavin'],
  [/\bniacin\b/i, 'niacin'],
  [/\bfol(ate|ic)\b/i, 'folate'],
  [/\bbiotin\b/i, 'biotin'],
  [/\bpantothenic\b/i, 'pantothenic'],
]

const quote = (s: string) => s.trim().replace(/\s+/g, ' ')

export function extractBrief(text: string): Extraction {
  const ops: RecordOp[] = []
  const gaps: Gap[] = []
  const unparsed: string[] = []
  const t = text.trim()

  // ── Format ──────────────────────────────────────────────────────────────
  let format: PackFormat | null = null
  for (const [re, f, word] of FORMAT_WORDS) {
    const m = re.exec(t)
    if (m) {
      format = f
      ops.push({ op: 'setFormat', value: f, source: quote(m[0]) })
      void word
      break
    }
  }
  if (!format) {
    gaps.push({
      field: 'format',
      question: 'Which pack format — pouch, carton, stick pack, jar or bottle?',
      why: 'The format decides the die line, and every dimension hangs off it.',
      severity: 'required',
    })
  }

  // ── Market ──────────────────────────────────────────────────────────────
  let market: Market | null = null
  for (const [re, m] of MARKET_WORDS) {
    const hit = re.exec(t)
    if (hit) {
      market = m
      ops.push({ op: 'setMarket', value: m, source: quote(hit[0]) })
      break
    }
  }
  if (!market) {
    gaps.push({
      field: 'market',
      question: 'Which market is this being sold in — GB, EU, US or Canada?',
      why: 'One market, one label. The market decides which panel is lawful and who signs it off.',
      severity: 'required',
    })
  }

  // ── Explicit dimensions, e.g. "188 x 260" or "30 × 120 mm" ─────────────
  const dim = /(\d{2,3}(?:\.\d+)?)\s*(?:x|×|by)\s*(\d{2,3}(?:\.\d+)?)(?:\s*(?:x|×|by)\s*(\d{2,3}(?:\.\d+)?))?\s*(mm|cm)?/i.exec(t)
  if (dim) {
    const scale = dim[4]?.toLowerCase() === 'cm' ? 10 : 1
    ops.push({
      op: 'setDimensions',
      width: Number(dim[1]) * scale,
      height: Number(dim[2]) * scale,
      depth: dim[3] ? Number(dim[3]) * scale : undefined,
      source: quote(dim[0]),
    })
  }

  // ── Ingredients with doses, e.g. "400mg magnesium" ──────────────────────
  // Done before net quantity, and the matched spans are then blanked out, so a
  // per-serving dose is never re-read as the pack's net weight.
  const ingredients: Ingredient[] = []
  let residual = t
  for (const m of t.matchAll(
    /(\d+(?:\.\d+)?)\s*(mg|µg|mcg|ug|g|iu)\s*(?:of\s+)?([A-Za-z][A-Za-z0-9\s()'-]{2,40}?)(?=[,.;]|\s+(?:and|with|plus|per|each|daily)\b|$)/gi,
  )) {
    const amount = Number(m[1])
    const unit = m[2].toLowerCase().replace('mcg', 'µg').replace('ug', 'µg')
    const rawName = cleanIngredientName(m[3])
    if (!rawName) continue
    const nrvKey = NRV_ALIASES.find(([re]) => re.test(rawName))?.[1]
    ingredients.push({
      name: titleCase(rawName),
      amount,
      unit,
      active: true,
      nrvKey: nrvKey && NRV[nrvKey] ? nrvKey : undefined,
      inFormulation: undefined,
    })
    if (m.index !== undefined) {
      residual = residual.slice(0, m.index) + ' '.repeat(m[0].length) + residual.slice(m.index + m[0].length)
    }
  }

  // ── Net quantity ────────────────────────────────────────────────────────
  const vol = /(\d+(?:\.\d+)?)\s*(ml|millilitres?|l|litres?)\b/i.exec(residual)
  const wt = /(\d+(?:\.\d+)?)\s*(g|grams?|kg|mg)\b/i.exec(residual)
  const count = /(\d+)\s*(capsules?|caps|tablets?|tabs|sachets?|sticks?|servings?|gummies|softgels?)\b/i.exec(residual)

  if (count) {
    const n = Number(count[1])
    ops.push({
      op: 'setNetQuantity',
      value: n,
      unit: normaliseCount(count[2]),
      declaredAs: `${n} ${normaliseCount(count[2])}`,
      source: quote(count[0]),
    })
    ops.push({ op: 'setServings', value: n, source: quote(count[0]) })
  } else if (vol) {
    const n = Number(vol[1])
    const unit = /^l|litre/i.test(vol[2]) ? 'l' : 'ml'
    ops.push({
      op: 'setNetQuantity',
      value: n,
      unit,
      // Declared with a volume descriptor, because the unit is a volume. Getting
      // this pairing wrong is the "NET WT 300ML" failure the rules catch.
      declaredAs: `${n} ${unit} ℮`,
      source: quote(vol[0]),
    })
  } else if (wt) {
    const n = Number(wt[1])
    const unit = wt[2].toLowerCase().startsWith('k') ? 'kg' : wt[2].toLowerCase().startsWith('m') ? 'mg' : 'g'
    ops.push({
      op: 'setNetQuantity',
      value: n,
      unit,
      declaredAs: `NET WT ${n} ${unit} ℮`,
      source: quote(wt[0]),
    })
  } else {
    gaps.push({
      field: 'netQuantity',
      question: 'How much is in the pack — a weight, a volume, or a capsule count?',
      why: 'Net quantity is mandatory on the front panel in every market.',
      severity: 'required',
    })
  }

  // ── Brand ───────────────────────────────────────────────────────────────
  const brand =
    /(?:brand(?:\s+name)?(?:\s+is)?[:\s]+|\bfor\s+)["“']?([A-Z][\w&'’-]*(?:\s+[A-Z][\w&'’-]*){0,2})["”']?/.exec(t) ??
    /["“']([^"“”']{2,40})["”']/.exec(t)
  if (brand) {
    ops.push({ op: 'setBrand', value: brand[1].trim(), source: quote(brand[0]) })
  } else {
    gaps.push({
      field: 'brand',
      question: 'Whose brand is this?',
      why: 'The brand name goes on the front panel. It is not something this tool will make up for you.',
      severity: 'required',
    })
  }

  // Named nutrients with no dose — recorded as a gap, not invented.
  const namedNoDose = NRV_ALIASES.filter(
    ([re, key]) => re.test(t) && !ingredients.some((i) => i.nrvKey === key),
  )
  for (const ing of ingredients) ops.push({ op: 'addIngredient', value: ing, source: `${ing.amount} ${ing.unit} ${ing.name}` })

  if (namedNoDose.length) {
    gaps.push({
      field: 'doses',
      question: `What is the per-serving dose of ${namedNoDose.map(([, k]) => NRV[k].label).join(', ')}?`,
      why: 'Without a dose there is no facts panel, no %NRV, and no claim can be supported.',
      severity: 'required',
    })
  } else if (!ingredients.length) {
    gaps.push({
      field: 'ingredients',
      question: 'What is in it, and at what dose per serving?',
      why: 'The ingredient deck builds the facts panel. It has to come from your formulation, not from a model.',
      severity: 'required',
    })
  }

  // ── Product name ────────────────────────────────────────────────────────
  const named = /(?:called|named|product(?:\s+name)?(?:\s+is)?)[:\s]+["“']?([^"“”'.,;]{3,50})["”']?/i.exec(t)
  if (named) {
    ops.push({ op: 'setProductName', value: titleCase(named[1].trim()), source: quote(named[0]) })
  } else {
    gaps.push({
      field: 'productName',
      question: 'What is the product called?',
      why: 'The product name is a claim in its own right, so it gets assessed like one.',
      severity: 'required',
    })
  }

  // Always-required things a typed brief essentially never contains.
  gaps.push({
    field: 'formulationVersion',
    question: 'Which formulation version is this pack built against?',
    why: 'Without a version you cannot say which formulation the artwork was checked against.',
    severity: 'required',
  })

  // Echo back anything long that produced nothing, rather than silently dropping it.
  if (t.length > 20 && ops.length <= 1) unparsed.push(t)

  return { ops, gaps, unparsed }
}

/**
 * Trim the connective tail off a captured ingredient name, and reject captures
 * that are only a quantity phrase. "10mg zinc per serving" names zinc, and
 * "5g each" names nothing at all.
 */
const NOT_AN_INGREDIENT = /^(each|per\s+\w+|serving|servings|dose|daily|a\s+day|of|and|with|plus|net|total)$/i

function cleanIngredientName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+(per\s+\w+|each|daily|a\s+day|per)$/i, '')
    .trim()
  if (!name || NOT_AN_INGREDIENT.test(name)) return null
  if (name.length < 3) return null
  return name
}

const normaliseCount = (w: string) => {
  const s = w.toLowerCase()
  if (s.startsWith('cap') && !s.startsWith('caps')) return 'capsules'
  if (s.startsWith('cap')) return 'capsules'
  if (s.startsWith('tab')) return 'tablets'
  if (s.startsWith('sach')) return 'sachets'
  if (s.startsWith('stick')) return 'sticks'
  if (s.startsWith('serv')) return 'servings'
  if (s.startsWith('soft')) return 'capsules'
  return 'gummies'
}

const titleCase = (s: string) =>
  s
    .split(' ')
    .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
