import type { Finding, ProductRecord, Severity } from '../types'
import { descriptorImplies, measureKind } from '../units'
import { checkGtin } from './barcode'
import { MARKETS, categoryBelongsToMarket, expectedPanel } from './markets'
import { findNearDuplicateTerms, findPlaceholders } from './placeholders'

export interface Rule {
  id: string
  /** A–E, matching claims-and-warning-check. */
  area: 'A' | 'B' | 'C' | 'D' | 'E'
  title: string
  /** Return null when the rule passes. */
  run: (p: ProductRecord) => Omit<Finding, 'id' | 'area'> | null
}

const severity = (s: Severity) => s

/** Stage decides whether a placeholder is fatal. Concept may carry them; a proof may not. */
function placeholderSeverity(p: ProductRecord): Severity {
  return p.stage === 'concept' ? 'MAJOR' : 'BLOCKER'
}

export const RULES: Rule[] = [
  // ── A · Classification and panel type — the gate ────────────────────────
  {
    id: 'A0',
    area: 'A',
    title: 'Legal category settled for this market',
    run: (p) => {
      if (p.category === 'unsettled') {
        return {
          finding: `Legal category is not settled for ${MARKETS[p.market].label}. Everything below this line is conditional.`,
          severity: severity('BLOCKER'),
          proposedFix: `Get the category confirmed in writing by ${MARKETS[p.market].reviewerLabel} before any artwork goes out.`,
          owner: MARKETS[p.market].reviewer,
          rationale: 'The category decides which panel is lawful; building a panel first means rebuilding it later.',
        }
      }
      if (!categoryBelongsToMarket(p.category, p.market)) {
        return {
          finding: `Category "${p.category}" does not belong to ${MARKETS[p.market].label}. The market or the category is wrong.`,
          severity: severity('BLOCKER'),
          proposedFix: 'Reconcile the brief: one market, one category, one label.',
          owner: 'ops',
          rationale: 'A panel built for the wrong market is a full rebuild, not an amend.',
        }
      }
      return null
    },
  },
  {
    id: 'A1',
    area: 'A',
    title: 'Panel format matches the category',
    run: (p) => {
      const want = expectedPanel(p.category)
      if (!want || p.panelType === want) return null
      return {
        finding: `Panel is "${p.panelType}" but category "${p.category}" requires "${want}".`,
        severity: severity('BLOCKER'),
        proposedFix: `Rebuild the panel as ${want}.`,
        owner: 'design',
        rationale: 'A pack built for one market after the client changed market is on the lessons list already.',
      }
    },
  },
  {
    id: 'A2',
    area: 'A',
    title: 'US conventional food — every functional ingredient GRAS',
    run: (p) => {
      if (p.category !== 'us-conventional-food') return null
      const actives = p.ingredients.filter((i) => i.active)
      if (!actives.length) return null
      return {
        finding: `Conventional food in the US: each of ${actives.length} functional ingredient(s) needs a GRAS or approved-use basis — ${actives
          .map((i) => i.name)
          .join(', ')}.`,
        severity: severity('QUESTION'),
        proposedFix: 'Ask the US regulatory reviewer to confirm a GRAS basis by ingredient, in writing.',
        owner: 'us-regulatory',
        rationale: 'Branded nootropics and novel ingredients frequently are not GRAS for food use.',
      }
    },
  },

  // ── B · Ingredient deck ─────────────────────────────────────────────────
  {
    id: 'B0',
    area: 'B',
    title: 'Formulation version recorded',
    run: (p) =>
      p.formulationVersion.trim()
        ? null
        : {
            finding: 'No formulation version string on the record.',
            severity: severity('BLOCKER'),
            proposedFix: 'Get the exact version from formulation and record it in the brief before reviewing copy.',
            owner: 'formulation',
            rationale: 'Without a version you cannot say which formulation the pack was checked against.',
          },
  },
  {
    id: 'B1',
    area: 'B',
    title: 'Every on-pack ingredient is in the confirmed formulation',
    run: (p) => {
      const stray = p.ingredients.filter((i) => i.inFormulation === false).map((i) => i.name)
      if (!stray.length) return null
      return {
        finding: `On pack but not in ${
          p.formulationVersion ? `formulation ${p.formulationVersion}` : 'the confirmed formulation'
        }: ${stray.join(', ')}.`,
        severity: severity('BLOCKER'),
        proposedFix: 'Either the pack is wrong or the formulation moved on. Reconcile with formulation before proof.',
        owner: 'formulation',
        rationale: 'A declared ingredient the product does not contain is a mislabelling offence.',
      }
    },
  },
  {
    id: 'B2',
    area: 'B',
    title: 'Actives and excipients split correctly',
    run: (p) => {
      if (!p.ingredients.length) {
        return {
          finding: 'No ingredients on the record.',
          severity: severity('BLOCKER'),
          proposedFix: 'Load the ingredient deck from the confirmed formulation.',
          owner: 'formulation',
          rationale: 'There is no panel without a deck.',
        }
      }
      const actives = p.ingredients.filter((i) => i.active)
      if (!actives.length) {
        return {
          finding: 'Every ingredient is marked as an excipient — nothing would appear in the facts panel.',
          severity: severity('BLOCKER'),
          proposedFix: 'Mark the functional ingredients as actives.',
          owner: 'formulation',
          rationale: 'Magnesium malate, citicoline and the B-vitamins are actives, not "other ingredients".',
        }
      }
      return null
    },
  },
  {
    id: 'B3',
    area: 'B',
    title: 'Actives carry a per-serving amount',
    run: (p) => {
      const missing = p.ingredients.filter((i) => i.active && (i.amount === null || !i.unit)).map((i) => i.name)
      if (!missing.length) return null
      return {
        finding: `Active(s) with no per-serving amount: ${missing.join(', ')}.`,
        severity: severity('BLOCKER'),
        proposedFix: 'Add the quantity per serving from the formulation.',
        owner: 'formulation',
        rationale: 'A facts panel without amounts cannot be printed and no claim can be supported.',
      }
    },
  },
  {
    id: 'B4',
    area: 'B',
    title: 'Branded ingredients spelled consistently and marked',
    run: (p) => {
      const branded = p.ingredients.filter((i) => i.branded)
      const names = p.ingredients.map((i) => i.name)
      const dupes = findNearDuplicateTerms(names, 2)
      if (dupes.length) {
        return {
          finding: `Two near-identical ingredient spellings on one deck: ${dupes
            .map(([a, b]) => `"${a}" vs "${b}"`)
            .join('; ')}.`,
          severity: severity('BLOCKER'),
          proposedFix: 'Pick the licensor’s exact spelling and use it everywhere.',
          owner: 'design',
          rationale: 'One pack shipped a proof carrying "Cognizin" and "Cogitzin" on the same face.',
        }
      }
      const unattributed = branded.filter((i) => i.branded?.attributionRequired && !i.branded.licensor).map((i) => i.name)
      if (unattributed.length) {
        return {
          finding: `Branded ingredient(s) needing an attribution line with no licensor recorded: ${unattributed.join(', ')}.`,
          severity: severity('MAJOR'),
          proposedFix: 'Get the licensor’s required attribution wording and add it to the back panel.',
          owner: 'compliance-uk-eu',
          rationale: 'Licence agreements usually make the attribution line a condition of using the mark.',
        }
      }
      return null
    },
  },

  // ── C · Mandatory statements ────────────────────────────────────────────
  {
    id: 'C1',
    area: 'C',
    title: 'Statutory name present',
    run: (p) => {
      const want = MARKETS[p.market].statutoryNames
      const got = p.statutoryName.toLowerCase()
      if (want.some((w) => got.includes(w))) return null
      return {
        finding: `Statutory name "${p.statutoryName || '(blank)'}" does not contain any of: ${want.join(' / ')}.`,
        severity: severity('BLOCKER'),
        proposedFix: `Add the descriptor "${want[0]}" to the front panel.`,
        owner: 'design',
        rationale: 'The legal descriptor is mandatory and is not the same thing as the brand name.',
      }
    },
  },
  {
    id: 'C2',
    area: 'C',
    title: 'Net quantity unit matches the kind of measure declared',
    run: (p) => {
      if (!p.netQuantity) {
        return {
          finding: 'No net quantity declaration.',
          severity: severity('BLOCKER'),
          proposedFix: 'Add net quantity to the front panel.',
          owner: 'design',
          rationale: 'Net quantity is mandatory in every market here.',
        }
      }
      const { declaredAs, unit } = p.netQuantity
      const kindOfUnit = measureKind(unit)
      const kindOfWords = descriptorImplies(declaredAs)
      if (kindOfWords && kindOfUnit && kindOfWords !== kindOfUnit) {
        return {
          finding: `"${declaredAs}" declares a ${kindOfWords} but the unit "${unit}" is a ${kindOfUnit}.`,
          severity: severity('BLOCKER'),
          proposedFix:
            kindOfWords === 'weight'
              ? `Use a weight unit (g / oz), or change the wording to a volume declaration.`
              : `Use a volume unit (ml / fl oz), or change the wording to a weight declaration.`,
          owner: 'design',
          rationale: 'This exact fault shipped once as "NET WT 30ML" — it is on the lessons list.',
        }
      }
      return null
    },
  },
  {
    id: 'C3',
    area: 'C',
    title: 'Directions include a daily maximum',
    run: (p) => {
      if (!p.directions.trim()) {
        return {
          finding: 'No directions / recommended use.',
          severity: severity('BLOCKER'),
          proposedFix: 'Add directions including the daily maximum.',
          owner: 'compliance-uk-eu',
          rationale: 'Directions are mandatory and the maximum is what makes the dose enforceable.',
        }
      }
      if (!/\b(per day|daily|a day|per 24)\b/i.test(p.directions)) {
        return {
          finding: 'Directions do not state a daily amount or maximum.',
          severity: severity('MAJOR'),
          proposedFix: 'State servings per day and the maximum not to be exceeded.',
          owner: 'compliance-uk-eu',
          rationale: 'Without a stated daily figure, "do not exceed the recommended dose" refers to nothing.',
        }
      }
      return null
    },
  },
  {
    id: 'C4',
    area: 'C',
    title: 'Warnings box contains actual warnings, not storage text',
    run: (p) => {
      if (!p.warnings.length) {
        return {
          finding: 'Warnings box is empty.',
          severity: severity('BLOCKER'),
          proposedFix: 'Populate with the market’s mandatory warnings.',
          owner: 'compliance-uk-eu',
          rationale: 'A warnings box with no warnings is the fault that started this checklist.',
        }
      }
      const storageLike = /\b(store|storage|cool|dry place|away from direct sunlight|refrigerat)/i
      const warningLike = /\b(do not exceed|keep out of reach|not a substitute|consult|pregnan|medication|allerg|discontinue)/i
      const storageLines = p.warnings.filter((w) => storageLike.test(w))
      const realWarnings = p.warnings.filter((w) => warningLike.test(w))
      if (storageLines.length && !realWarnings.length) {
        return {
          finding: `The warnings box contains only storage text: ${storageLines.map((s) => `"${s}"`).join('; ')}.`,
          severity: severity('BLOCKER'),
          proposedFix: 'Move storage text to its own statement and put real warnings in the box.',
          owner: 'design',
          rationale: 'Shipped once already: a warnings box holding storage text and no warnings.',
        }
      }
      if (storageLines.length) {
        return {
          finding: `Storage text is sitting inside the warnings box: ${storageLines.map((s) => `"${s}"`).join('; ')}.`,
          severity: severity('MAJOR'),
          proposedFix: 'Move it to the storage statement.',
          owner: 'design',
          rationale: 'Mixing the two dilutes the warnings and fails a careful enforcement read.',
        }
      }
      return null
    },
  },
  {
    id: 'C5',
    area: 'C',
    title: "Market's mandatory statements all present",
    run: (p) => {
      const hay = [...p.warnings, p.directions, p.storage].join(' \n ')
      const missing = MARKETS[p.market].mandatoryStatements.filter((s) => !s.match.test(hay))
      if (!missing.length) return null
      return {
        finding: `Missing mandatory statement(s) for ${MARKETS[p.market].label}: ${missing.map((m) => m.label).join('; ')}.`,
        severity: severity('BLOCKER'),
        proposedFix: 'Add the exact wording; do not paraphrase.',
        owner: MARKETS[p.market].reviewer,
        rationale: 'These are required by the market profile, not by house style.',
      }
    },
  },
  {
    id: 'C6',
    area: 'C',
    title: 'Storage statement present',
    run: (p) =>
      p.storage.trim()
        ? null
        : {
            finding: 'No storage statement.',
            severity: severity('MAJOR'),
            proposedFix: 'Add a storage statement outside the warnings box.',
            owner: 'design',
            rationale: 'Required in practice and it is what the warnings box keeps getting filled with instead.',
          },
  },
  {
    id: 'C7',
    area: 'C',
    title: 'Allergen statement or a written confirmation that none applies',
    run: (p) => {
      if (p.allergenStatement && p.allergenStatement.trim()) return null
      if (p.allergensConfirmedNone) return null
      return {
        finding: 'No allergen statement and no written confirmation that no allergen applies.',
        severity: severity('BLOCKER'),
        proposedFix: `Add a statement in the market format — ${MARKETS[p.market].allergenFormat}`,
        owner: MARKETS[p.market].reviewer,
        rationale: 'Silence is not a confirmation; someone has to put it in writing.',
      }
    },
  },
  {
    id: 'C8',
    area: 'C',
    title: 'Responsible party name and full address for the market',
    run: (p) => {
      if (!p.responsibleParty) {
        return {
          finding: 'No manufacturer / distributor / responsible-person details.',
          severity: severity('BLOCKER'),
          proposedFix: 'Add the responsible party name and a full address in the market of sale.',
          owner: 'account',
          rationale: 'Mandatory in every market this engine covers.',
        }
      }
      if (p.responsibleParty.lines.filter((l) => l.trim()).length < 2) {
        return {
          finding: `Address for ${p.responsibleParty.name} is only ${p.responsibleParty.lines.length} line(s) — not a full address.`,
          severity: severity('MAJOR'),
          proposedFix: 'Add street, town and postcode.',
          owner: 'account',
          rationale: 'A town-and-postcode-only address does not satisfy the requirement.',
        }
      }
      if (p.market === 'GB' && !/united kingdom|uk|england|scotland|wales/i.test(p.responsibleParty.country)) {
        return {
          finding: `GB pack carries a ${p.responsibleParty.country} address. A GB address is required.`,
          severity: severity('BLOCKER'),
          proposedFix: 'Add a GB FBO address.',
          owner: 'account',
          rationale: 'An EU-only address stopped being sufficient for GB after the transition.',
        }
      }
      return null
    },
  },
  {
    id: 'C9',
    area: 'C',
    title: 'Lot and best-before panel planned',
    run: (p) => {
      if (p.lotAndExpiryPanel?.present && p.lotAndExpiryPanel.method.trim()) return null
      return {
        finding: 'No space or method recorded for the lot code and best-before date.',
        severity: severity('MAJOR'),
        proposedFix: 'Reserve a clear, unvarnished area and record the coding method (inkjet, hot foil, embossed).',
        owner: 'design',
        rationale: 'If it is not reserved at artwork stage the filler codes over live artwork.',
      }
    },
  },
  {
    id: 'C10',
    area: 'C',
    title: 'GTIN is real and the check digit passes',
    run: (p) => {
      const v = checkGtin(p.gtin)
      if (v.ok) {
        const want = MARKETS[p.market].barcode
        if (v.symbology !== want) {
          return {
            finding: `GTIN is ${v.symbology} but ${MARKETS[p.market].label} retail expects ${want}.`,
            severity: severity('MAJOR'),
            proposedFix: `Supply a ${want} GTIN, or confirm the retailer accepts ${v.symbology}.`,
            owner: 'client',
            rationale: 'The wrong symbology gets the line rejected at the retailer, not at the printer.',
          }
        }
        return null
      }
      return {
        finding: `Barcode: ${v.reason}`,
        severity: v.placeholder ? placeholderSeverity(p) : severity('BLOCKER'),
        proposedFix: 'Get the allocated GTIN from the client and regenerate the symbol at the printer’s magnification.',
        owner: 'client',
        rationale: 'A placeholder barcode block has survived to a "proof" before.',
      }
    },
  },
  {
    id: 'C11',
    area: 'C',
    title: 'Registration number present and real where the market needs one',
    run: (p) => {
      const m = MARKETS[p.market]
      if (!m.registrationRequired) return null
      const n = p.registrationNumber ?? ''
      if (!n.trim()) {
        return {
          finding: `No ${m.registrationLabel} on pack.`,
          severity: severity('BLOCKER'),
          proposedFix: `Obtain the ${m.registrationLabel} before artwork goes to proof.`,
          owner: 'client',
          rationale: 'The number cannot be invented and the pack cannot ship without it.',
        }
      }
      if (/x{2,}|0{5,}|\bTBC\b/i.test(n)) {
        return {
          finding: `${m.registrationLabel} "${n}" is a placeholder.`,
          severity: placeholderSeverity(p),
          proposedFix: 'Replace with the issued number.',
          owner: 'client',
          rationale: 'A placeholder NPN reached a proof on a previous job.',
        }
      }
      return null
    },
  },
  {
    id: 'C12',
    area: 'C',
    title: 'No placeholders anywhere on the record',
    run: (p) => {
      const hits = findPlaceholders({
        'product name': p.productName,
        'statutory name': p.statutoryName,
        directions: p.directions,
        storage: p.storage,
        warnings: p.warnings.join(' | '),
        'allergen statement': p.allergenStatement,
        'serving size': p.servingSize,
        URLs: p.urlsOnPack.join(' | '),
        ingredients: p.ingredients.map((i) => i.name).join(' | '),
      })
      if (!hits.length) return null
      return {
        finding: `Placeholder content found: ${hits.map((h) => `${h.what} in ${h.where} ("${h.excerpt}")`).join('; ')}.`,
        severity: placeholderSeverity(p),
        proposedFix: 'Replace every placeholder with final approved copy.',
        owner: 'design',
        rationale: 'Every placeholder is a blocker for proof and a major at concept.',
      }
    },
  },

  // ── D · Claims ──────────────────────────────────────────────────────────
  {
    id: 'D1',
    area: 'D',
    title: 'No disease claims',
    run: (p) => {
      const bad = p.claims.filter((c) => c.kind === 'disease')
      if (!bad.length) return null
      return {
        finding: `Disease claim(s) on pack: ${bad.map((c) => `"${c.text}" (${c.location})`).join('; ')}.`,
        severity: severity('BLOCKER'),
        proposedFix: 'Remove entirely. There is no version of this that is lawful on a supplement.',
        owner: MARKETS[p.market].reviewer,
        rationale: 'A disease claim reclassifies the product as a medicine.',
      }
    },
  },
  {
    id: 'D2',
    area: 'D',
    title: 'Unclassified claims routed to the reviewer',
    run: (p) => {
      const un = p.claims.filter((c) => c.kind === 'unclassified')
      if (!un.length) return null
      return {
        finding: `${un.length} claim(s) not yet classified: ${un.map((c) => `"${c.text}" (${c.location})`).join('; ')}.`,
        severity: severity('QUESTION'),
        proposedFix: 'Classify each as authorised / nutrition / structure-function / disease, and cite the register entry.',
        owner: MARKETS[p.market].reviewer,
        rationale: 'An unclassified claim is an unassessed risk, not a minor note.',
      }
    },
  },
  {
    id: 'D3',
    area: 'D',
    title: 'Authorised claims meet their conditions of use at the dose on pack',
    run: (p) => {
      const need = p.claims.filter(
        (c) => (c.kind === 'authorised-health' || c.kind === 'nutrition') && c.conditionsMet !== true,
      )
      if (!need.length) return null
      const failed = need.filter((c) => c.conditionsMet === false)
      return {
        finding: failed.length
          ? `Claim(s) whose conditions of use are NOT met at the dose per serving: ${failed.map((c) => `"${c.text}"`).join('; ')}.`
          : `Claim(s) awaiting a conditions-of-use check: ${need.map((c) => `"${c.text}"`).join('; ')}.`,
        severity: failed.length ? severity('BLOCKER') : severity('QUESTION'),
        proposedFix: failed.length
          ? 'Either raise the dose to the authorised level or remove the claim.'
          : 'Confirm the per-serving dose against the register entry for each claim.',
        owner: MARKETS[p.market].reviewer,
        rationale: 'An authorised claim made below its threshold is an unauthorised claim.',
      }
    },
  },
  {
    id: 'D4',
    area: 'D',
    title: 'US structure/function claims carry the DSHEA disclaimer',
    run: (p) => {
      if (p.market !== 'US') return null
      const sf = p.claims.filter((c) => c.kind === 'structure-function')
      if (!sf.length) return null
      const hay = [...p.warnings, p.directions].join(' ')
      if (/has not been evaluated by the food and drug administration/i.test(hay)) return null
      return {
        finding: `${sf.length} structure/function claim(s) on pack with no DSHEA disclaimer found.`,
        severity: severity('BLOCKER'),
        proposedFix:
          'Add the boxed disclaimer: "This statement has not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease."',
        owner: 'us-regulatory',
        rationale: 'The disclaimer is what makes a structure/function claim lawful.',
      }
    },
  },
  {
    id: 'D5',
    area: 'D',
    title: 'Product name and imagery assessed as claims',
    run: (p) => {
      const suggestive = /\b(immune|immunity|performance|detox|slim|burn|energy|recovery|focus|calm|sleep|joint|heart|brain)\b/i
      const m = suggestive.exec(p.productName)
      if (!m) return null
      const alreadyListed = p.claims.some((c) => c.location.toLowerCase().includes('name'))
      if (alreadyListed) return null
      return {
        finding: `Product name "${p.productName}" contains "${m[0]}", which reads as a claim, and it is not on the claims list.`,
        severity: severity('QUESTION'),
        proposedFix: 'Add the product name to the claims list and classify it.',
        owner: MARKETS[p.market].reviewer,
        rationale: 'Imagery and the product name are claims too — they get assessed the same way.',
      }
    },
  },
  {
    id: 'D6',
    area: 'D',
    title: 'URLs on pack verified character by character',
    run: (p) => {
      if (!p.urlsOnPack.length) return null
      const suspicious = p.urlsOnPack.filter((u) => !/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(u.trim()))
      if (suspicious.length) {
        return {
          finding: `URL(s) that do not parse as a domain: ${suspicious.map((u) => `"${u}"`).join('; ')}.`,
          severity: severity('BLOCKER'),
          proposedFix: 'Correct and verify by typing the URL from the printed proof, not from the brief.',
          owner: 'design',
          rationale: 'A single-character URL typo, invisible in a JPEG proof, has reached print before.',
        }
      }
      const dupes = findNearDuplicateTerms(p.urlsOnPack, 2)
      if (dupes.length) {
        return {
          finding: `Two near-identical URLs on pack: ${dupes.map(([a, b]) => `"${a}" vs "${b}"`).join('; ')}.`,
          severity: severity('BLOCKER'),
          proposedFix: 'One of them is a typo. Establish which and correct it.',
          owner: 'design',
          rationale: 'Near-duplicate strings on one pack are almost always a transcription error.',
        }
      }
      return null
    },
  },

  // ── E · Language and typography ─────────────────────────────────────────
  {
    id: 'E1',
    area: 'E',
    title: 'All required languages present',
    run: (p) => {
      const need = MARKETS[p.market].requiredLanguages
      const have = p.languages.map((l) => l.toLowerCase())
      const missing = need.filter((l) => !have.includes(l))
      if (!missing.length) return null
      return {
        finding: `${MARKETS[p.market].label} requires ${need.join(' + ').toUpperCase()}; the pack is set up for ${
          have.join(', ').toUpperCase() || '(none recorded)'
        }.`,
        severity: severity('BLOCKER'),
        proposedFix: `Add ${missing.join(', ').toUpperCase()} for every mandatory particular — not just the front panel.`,
        owner: 'design',
        rationale: 'Bilingual requirements change the layout, so they cannot be retrofitted late.',
      }
    },
  },
  {
    id: 'E2',
    area: 'E',
    title: 'Servings per container declared',
    run: (p) =>
      p.servingsPerContainer && p.servingsPerContainer > 0
        ? null
        : {
            finding: 'Servings per container is not declared.',
            severity: severity('MAJOR'),
            proposedFix: 'Calculate from net quantity ÷ serving size and add it above the panel.',
            owner: 'design',
            rationale: 'Required on the facts panel and it is what consumers use to compare price per serving.',
          },
  },
]

export interface ComplianceReport {
  market: string
  reviewer: string
  stage: string
  generatedAt: string
  findings: Finding[]
  counts: Record<Severity, number>
  /** A BLOCKER anywhere means the artwork cannot go to the client. */
  verdict: 'NOT READY FOR CLIENT' | 'READY FOR CLIENT (with notes)' | 'READY FOR PRE-PRESS'
  headline: string
  marketNotes: string[]
}

export function runCompliance(p: ProductRecord): ComplianceReport {
  const findings: Finding[] = []
  for (const rule of RULES) {
    const hit = rule.run(p)
    if (hit) findings.push({ id: rule.id, area: rule.area, ...hit })
  }

  const counts: Record<Severity, number> = { BLOCKER: 0, MAJOR: 0, MINOR: 0, QUESTION: 0 }
  for (const f of findings) counts[f.severity]++

  const order: Severity[] = ['BLOCKER', 'MAJOR', 'MINOR', 'QUESTION']
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.id.localeCompare(b.id))

  let verdict: ComplianceReport['verdict']
  if (counts.BLOCKER > 0) verdict = 'NOT READY FOR CLIENT'
  else if (counts.MAJOR > 0 || counts.QUESTION > 0) verdict = 'READY FOR CLIENT (with notes)'
  else verdict = 'READY FOR PRE-PRESS'

  const headline =
    counts.BLOCKER > 0
      ? `${counts.BLOCKER} blocker${counts.BLOCKER === 1 ? '' : 's'} — this artwork cannot go to the client.`
      : counts.MAJOR + counts.QUESTION > 0
        ? `No blockers. ${counts.MAJOR} major and ${counts.QUESTION} question${counts.QUESTION === 1 ? '' : 's'} for ${MARKETS[p.market].reviewerLabel}.`
        : 'No findings. Ready for pre-press once the artwork review passes too.'

  return {
    market: MARKETS[p.market].label,
    reviewer: MARKETS[p.market].reviewerLabel,
    stage: p.stage,
    generatedAt: new Date().toISOString(),
    findings,
    counts,
    verdict,
    headline,
    marketNotes: MARKETS[p.market].notes,
  }
}
