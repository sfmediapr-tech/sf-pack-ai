# SF Pack AI

A supplement packaging tool for Supplement Factory: **one product record drives the die
line, the 3D preview, the facts panel and the compliance check**, so they cannot drift
apart.

Three views. A **landing page** for clients who have not used it. A **chat front door**
where a client describes a pack in a sentence. A **studio** behind it with every control,
for Dieter.

Built as the answer to "can we build Packify?" — see
[`docs/achievability.md`](docs/achievability.md) for the assessment of packify.ai and
pacdora.com, what is achievable at what cost, and what you should deliberately not build.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:5178.

Click through to the tool and pick one of the three starter briefs. Watch the readout: every
value it fills quotes the phrase it came from, and everything it cannot source is asked for
rather than guessed.

In the studio, **Load faulty record** is the thing to look at: it carries the faults from the
"lessons already paid for" list in the packaging agent's `docs/workflow-map.md`, and the
engine catches all of them — 13 blockers, including `NET WT 300ML`, a warnings box holding
only storage text, a placeholder barcode, "Cognizin" and "Cogitzin" on one deck, and
`p90labs.com` next to `p90laes.com`.

## What it does

| | |
|---|---|
| **Brief → record** | A typed sentence fills the record through typed operations, each carrying the substring it came from. Nothing without a source gets in. |
| **Die lines** | Five parametric formats — tuck-end carton, stand-up pouch, stick pack, jar wrap, bottle wrap / shrink sleeve. Layered SVG with cut, crease, perf, glue, seal, bleed and safe on named spot layers, at true millimetre size. |
| **3D preview** | Same dimensions, live. Artwork is drawn from the record, so the words on the pack are the words that were just checked. |
| **Facts panels** | US Supplement Facts and GB/EU nutrition declaration, generated from the ingredient deck. %NRV and %DV are calculated. |
| **Compliance** | 28 executable rules across the A–E checklist, market-aware (GB / EU / US / CA), stage-aware, routed to the right reviewer. |
| **PDF/X-4** | Die line as a real print file: DeviceCMYK page, Separation spot colours with Type 2 tint transforms, optional-content layers with Print state OFF, overprint, MediaBox ⊇ BleedBox ⊇ TrimBox, XMP `pdfxid:GTS_PDFXVersion`. Load the press ICC and it conforms; without it the preflight says so rather than pretending. |
| **Exports** | `compliance-findings.md`, die line SVG + PDF/X-4, panel SVG, PDF preflight report, `print-spec.md`, record JSON. |

## Layout

```
src/
├── core/                    ← no DOM, no React: this is the part that ports to a server
│   ├── types.ts             product record, dimensions, findings
│   ├── units.ts             mm/pt, and the weight-vs-volume distinction that catches "NET WT 30ML"
│   ├── dielines/            one module per format + the layered SVG serialiser
│   ├── compliance/          market profiles, the rule set, GTIN check digits, placeholder detection
│   ├── panels/              EU NRV table + the facts-panel renderer
│   ├── pdf/                 dependency-free PDF/X-4 writer: objects, separations, stroke font, preflight
│   └── brief/               typed record operations + the deterministic brief extractor
├── views/                   Landing, Chat, Studio
├── three/                   parametric geometry, canvas artwork, the preview component
├── ui/                      die line viewer, findings list
└── sampleData.ts            the clean record and the faulty one
```

`src/core` deliberately has no browser dependency — no DOM, no canvas, no React. The rule
engine, the die line maths and the panel renderer all run headless under any bundler or TS
runner, which is what makes an API endpoint or a batch SKU run a small job rather than a
rewrite. (Imports are extensionless bundler-style, so bare `node` needs esbuild, tsx or
`vite-node` in front of it.)

## The brief extractor

`src/core/brief` is the front door's engine. It reads a typed brief, fills what it can
actually find, and quotes the phrase it found each value in. What it cannot find becomes a
question with a reason attached — never a guess.

It runs with no API key and no model, which makes it the honest baseline: everything it
produces is traceable to a substring of what the client wrote. A language model drops in
behind the same `Extraction` contract to handle looser phrasing, filling the record through
the same typed operations, and is held to the same rule. That rule is the whole point: a
well-known AI packaging tool, given "a UK food supplement pouch", returned a pack for an
invented brand carrying an invented ingredient list. Neither is possible here.

## Concept art

The image model makes the **surface graphic only**. It never contributes a word: every
line of type on the pack is set from the product record and printed over the top, and the
prompt explicitly forbids text, lettering, logos, packaging and product photography.

That distinction is the entire design. Ask a model for "a supplement pouch" and you get a
photograph of a pouch with an invented brand and an invented ingredient list — which is
what the market leader actually returns. Ask for the decorative surface only, and you get
something that maps onto geometry this codebase computed, underneath type a human
supplied.

The generated image is drawn cover-fitted and then covered with a scrim of the brand
colour. The scrim is not styling: type set over an unmodified generated image is
unreadable at pack size, and legibility of the mandatory particulars is a legal
requirement.

```
prompt (core/concept/prompt.ts, pure)
   → POST /api/concept          ← server side; the API key never reaches the browser
   → provider (fal.ai | Replicate)
   → image fetched and returned as a data URL   ← a cross-origin image would taint
   → cover-fit, scrim, then real type on top       the canvas and WebGL would refuse it
```

### Providers, cheapest first

| Provider | Cost | Model |
|---|---|---|
| **Cloudflare Workers AI** (default) | **Free** — 10,000 Neurons/day, no card. About 58 Neurons per 1024×1024 four-step image, so roughly **170 images a day**. | FLUX.1 [schnell] |
| fal.ai | Paid per image | FLUX.1 [schnell] |
| Replicate | Paid per image | FLUX.1 [schnell] |

Auto-detected in that order; pin one with `IMAGE_PROVIDER`.

**The licence matters more than the price.** FLUX.1 **[schnell]** is Apache 2.0, so it is
free to use on paid client work. FLUX.1 **[dev]** is not — commercial use needs a licence
from Black Forest Labs, and a contract manufacturer producing artwork for customers is
squarely commercial use. This codebase only ever names schnell, and any model you
substitute should be checked the same way.

**To switch it on:** add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to the Vercel
project's environment variables (Production scope) and redeploy. See `.env.example`. With
no key the app works exactly as before and says so in the interface — a missing provider
is a normal state, not an error.

In `vite dev` a procedural placeholder answers `/api/concept` instead, so the whole path
can be exercised without a key and without spending credits. It is a `apply: 'serve'`
plugin and never reaches the production build.

## Driving it from Claude Code

`.claude/skills/sf-pack-ai/SKILL.md` teaches Claude to use this engine rather than
reason about packaging in prose: fill a `ProductRecord` from a client email or a
formulation document, run `runCompliance`, read the findings, route them to the named
reviewer — and never write a value it cannot trace to a source. It also lists the traps
this codebase has already been bitten by, including cut-versus-crease topology and the
net-quantity unit failure.

It complements the six process skills in
`Digital Packaging_Project 1/packaging-agent/.claude/skills/`: those describe the process,
this one runs the engine.

## Design

The stage colour is the neutral grey of an ISO 3664 colour-viewing booth — the surround a
printer judges a proof against, chosen because it biases nothing. Chrome is graphite, like
press machinery, and content sits on a white sheet with registration marks.

Colour carries meaning and is not allowed to decorate: **magenta only ever means a cut,
cyan only ever means a crease**, and a finding is marked in the red of the grease pencil a
rejected proof gets. One typeface, Archivo, worked across its width axis — wide and heavy
for display, condensed for technical callouts.

## How the compliance engine is meant to be used

It **finds problems and frames questions**. It does not issue the regulatory opinion —
that belongs to Gabriel for UK/EU and to a qualified US reviewer or the client's FSVP agent
for the US, and the engine routes each finding accordingly. A BLOCKER anywhere means the
artwork cannot go to the client, and the verdict says so without softening.

Severity depends on stage: a placeholder is MAJOR at concept and a BLOCKER at proof.

## Adding a rule

Rules live in [`src/core/compliance/rules.ts`](src/core/compliance/rules.ts) as an array.
Each returns `null` on a pass, or a finding with a severity, a proposed fix, an owner and a
one-line reason it matters. That last field is what ends up on the reviewer's question
sheet, so it is worth writing properly.

```ts
{
  id: 'C13',
  area: 'C',
  title: 'Country of origin where required',
  run: (p) => p.countryOfOrigin ? null : {
    finding: 'No country of origin.',
    severity: 'MAJOR',
    proposedFix: 'Add it to the back panel.',
    owner: 'compliance-uk-eu',
    rationale: 'Required where omission would mislead as to true origin.',
  },
}
```

## Adding a format

Write a module in `src/core/dielines/` returning a `Dieline` (shapes, panels, notes,
warnings), add a `FormatMeta` entry to `FORMATS`, and add a branch to `buildPackMesh` in
`src/three/geometry.ts`. The panel list is what maps artwork onto the right face in 3D.

## The PDF/X-4 export

`src/core/pdf` is a small PDF writer rather than a library dependency, because PDF/X-4
needs three things the general libraries either hide or fight you over: Separation colour
spaces with real tint transforms, an OutputIntent carrying an embedded ICC profile, and
optional content groups whose print state is OFF.

Three deliberate decisions:

- **The ICC profile is yours to supply.** A conforming file must embed one. Synthesising a
  plausible-looking profile would silently mis-describe the press condition, so the export
  refuses to: load the printer's `.icc` (or a free ECI profile) and it conforms; without
  one, preflight reports a blocker and the file is labelled a die line reference.
- **No fonts.** Labels are stroked vector paths, so there is nothing to embed and no
  licence to breach. It is also how die lines have always looked.
- **No artwork.** The preview artwork is RGB canvas raster. Converting it to CMYK without
  a colour management system is exactly the silent wrongness this tool exists to catch, so
  the print file is geometry only and says so.

Cut-versus-crease topology is computed, not decorative: on a reverse tuck the top edge is a
crease across the back and both sides and a **cut** across the front, because there is no
flap there. A die that cuts a fold line produces a carton that falls apart.

## Known limits

- The barcode drawn on the 3D back panel is a **placeholder footprint**, not a scannable
  symbol. The check digit is verified; the bars are not real. `bwip-js` closes this.
- The Canada NHP panel renders in the GB shape and says so. It needs the medicinal /
  non-medicinal split and bilingual copy before it is usable.
- Shrink sleeves render undistorted. Pre-distortion needs the converter's shrink map.
- NRV values and market profiles are hard-coded and need an owner and a review date.
