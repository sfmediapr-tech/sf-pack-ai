---
name: sf-pack-ai
description: Build and check a supplement pack with the SF Pack AI engine — fill a ProductRecord from a client brief, email, formulation document or spec sheet, then run the die line, facts panel, compliance and PDF/X-4 code rather than reasoning any of it by hand. Use whenever someone asks for a pack, a die line, a facts panel, a %NRV or %DV figure, a compliance check, a print file, or "is this artwork OK" — and whenever a value is about to be written onto packaging.
---

# Driving SF Pack AI

The engine lives in `src/core` and has no browser dependency. It computes die
lines, facts panels, nutrient percentages, barcode check digits and PDF/X-4
files deterministically. **Use it. Do not recompute any of it in your head or in
prose** — the code is right more often than you are, and it is the same code the
client sees in the browser.

Your job is the part the code cannot do: reading messy source material and
turning it into a `ProductRecord` without inventing anything.

## The one rule

> **Nothing on a pack comes from a model.**
> Every value traces to a document, an email or a person. A value with no source
> is a blocker, never a guess.

This is not a style preference. A well-known AI packaging tool, asked for "a UK
food supplement pouch", returned a pack for a brand that does not exist carrying
an ingredient list nobody supplied. That output is unlawful and unusable. The
whole point of this codebase is to be the opposite of it.

Concretely, when you cannot source something:

- **Never** fill a brand name, product name, ingredient, dose, claim, address,
  GTIN or registration number you were not given.
- **Do** record it as a gap with a question and a one-line reason it matters.
- **Do** say plainly in your reply what is still missing and who has to supply it.

## What the code already does — do not redo it

| Need | Call | Never |
|---|---|---|
| Brief → record operations | `extractBrief(text)` from `core/brief/extract` | Parse dimensions or doses by eye |
| Apply operations to a record | `applyOps(record, ops)` from `core/brief/ops` | Hand-edit fields and lose the source |
| An empty record | `blankRecord()` from `core/brief/blank` | Start from a sample record |
| Die line geometry | `buildDieline(format, dims)` from `core/dielines` | Draw or describe a die line yourself |
| Format list and defaults | `FORMATS`, `formatMeta(id)` from `core/dielines` | Invent pack dimensions |
| Facts panel | `renderFactsPanel(record, widthMm)` from `core/panels/factsPanel` | Lay out a Supplement Facts box by hand |
| % NRV / % DV | `percentNrv(key, amount, unit)`, `formatNrvPercent(pct)` from `core/panels/nrv` | Do the arithmetic yourself |
| Compliance | `runCompliance(record)` from `core/compliance/rules` | Give a regulatory opinion in prose |
| Findings file | `toFindingsMarkdown(record, report)` from `core/compliance/report` | Invent a report format |
| Barcode validity | `checkGtin(gtin)` from `core/compliance/barcode` | Eyeball a check digit |
| Print file | `dielineToPdfX(dieline, opts)` from `core/pdf/dielineToPdf` | Describe what the PDF would contain |
| PDF conformance | `preflightDielinePdf(input)` from `core/pdf/preflight` | Claim a file is print-ready |

## Running the engine headlessly

Imports are extensionless bundler-style, so bare `node` cannot resolve them.
Bundle first:

```bash
npx esbuild ./script.mts --bundle --platform=node --format=esm --outfile=/tmp/s.mjs --log-level=error && node /tmp/s.mjs
```

A typical script:

```ts
import { extractBrief } from './src/core/brief/extract.ts'
import { applyOps } from './src/core/brief/ops.ts'
import { blankRecord } from './src/core/brief/blank.ts'
import { runCompliance } from './src/core/compliance/rules.ts'

const ex = extractBrief(briefText)
const record = applyOps(blankRecord(), ex.ops)
const report = runCompliance(record)
```

Write scratch scripts into the scratchpad directory, not the project.

## Workflow

1. **Gather the real source.** A client email, the formulation document at its
   exact version string, the spec sheet, the printer's artwork guide. Review the
   source file, not a JPEG — JPEGs hide typos.
2. **Extract, do not interpret.** Run `extractBrief` on typed briefs. For
   documents, read them and fill the record field by field, noting for each one
   where it came from.
3. **Record the gaps.** Everything unsourced becomes a question. Formulation
   version is almost always missing and is always a blocker.
4. **Run `runCompliance`.** Report its findings; do not add your own regulatory
   conclusions to them.
5. **Route.** The report names the reviewer. Respect it — UK/EU compliance does
   **not** cover the US, and no software here signs anything off.
6. **Only then** generate the die line, panel or print file.

## Market routing

Setting the market through `applyOps` carries the legal category, panel type,
statutory name and languages with it. Do not set those separately — you will
create findings the client never caused.

| Market | Category | Panel | Descriptor |
|---|---|---|---|
| GB / EU | food supplement | back-of-pack nutrition + % NRV | "Food Supplement" |
| US | dietary supplement | Supplement Facts | "Dietary Supplement" |
| CA | NHP | medicinal / non-medicinal split, EN + FR | "Natural Health Product" |

One market, one label, one findings file. Never blur two markets in one output.

## Traps this codebase has already been bitten by

- **Cut versus crease.** On a carton, the top edge creases where a flap hinges
  and **cuts** where the panel is open. A die that cuts a fold line produces a
  carton that falls apart. `buildDieline` computes this; never override it.
- **Net quantity units.** A weight descriptor with a volume unit ("NET WT 300ML")
  is a mislabelling offence. Rule C2 catches it — do not "tidy" the wording past it.
- **The warnings box.** Storage text in the warnings box, with no warnings, has
  shipped. Rule C4 catches it.
- **Placeholders.** `XXXXXXXX`, a placeholder NPN, a filler barcode block. Major
  at concept, blocker at proof — the stage field decides, so set it honestly.
- **Near-duplicate spellings.** One pack carried two spellings of the same
  branded ingredient on one face. Rule B4 catches it; so does the URL check.
- **RGB to CMYK.** Never convert brand colours from hex without a colour
  management system. Declare press colours as CMYK or named spots, or leave them
  out. The PDF exporter deliberately omits artwork for this reason.
- **"Print-ready".** A PDF/X-4 file is only conforming with an embedded output
  intent ICC profile. Without one, say so — `preflightDielinePdf` already will.

## What to say, and what not to

Report what the engine found, in plain language: what is built, what is missing,
who has to answer. State the verdict without softening it — a blocker means the
artwork cannot go to the client, and that sentence goes at the top.

Do not write legal wording, do not classify a claim yourself, and do not tell
anyone a pack is compliant. The engine finds problems and frames questions. The
opinion belongs to a qualified reviewer, and the finding says which one.

## Related

The six process skills — brief, claims check, artwork review, SKU matrix, print
handoff, quote prep — live in
`Digital Packaging_Project 1/packaging-agent/.claude/skills/`. This skill is the
code-driving counterpart: they describe the process, this one runs the engine.
