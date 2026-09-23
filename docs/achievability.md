# Packify / Pacdora — what is actually achievable for SF Pack AI

Researched 23 September 2026 from packify.ai and pacdora.com.

## 1. What you are actually looking at

The two sites are **one company**. The footer of packify.ai reads
"© Copyright PACDORA PTE. LTD." — Packify is Pacdora's AI front end, not a competitor to it.

| | Pacdora | Packify |
|---|---|---|
| What it is | Asset library + browser editor | Conversational AI layer on top |
| Scale claimed | 5,000+ mockups, 3,000+ dieline templates | 200,000+ brands & designers |
| Core tools | Mockup generator, dieline template maker, 3D modelling, AI background | AI packaging design, print-ready dielines, AI photoshoot, logo integration, label generator, nutrition facts generator, API |
| Human layer | — | 20+ in-house designers, "2,000+ custom design projects" |
| Manufacturing | — | "Connect with verified packaging manufacturers worldwide" |

### Their pricing (annual rates)

| Plan | Monthly | Credits/mo | Notable |
|---|---|---|---|
| Free | £0 | 100 one-time | Trial only, does not refresh |
| Basic | $14.9 | 1,000 | Personal licence |
| Pro | $19.9 | 2,500 | Priority queue, premium image models |
| Business | $29.9 | 3,500 | Company licence, **API**, **editable dieline export**, team seats |
| Enterprise | $69.9 | 10,000 | 4 seats, custom design services |

Credits: AI Design/Edit 10, AI Photoshoot 5, roughly **10 credits per generated image**.

**Read that pricing carefully, because it tells you the business model.** Dieline export
is gated behind the $29.9 tier. They are not selling packaging — they are selling
image generations, and the dieline is the upsell. SF is in the opposite business.

## 2. Achievability, tiered honestly

### Tier 1 — done, in this repository

These were the parts worth proving rather than estimating, so they are built and running:

- **Parametric dieline generation.** Pacdora's "3,000+ templates" is a library. For a
  supplement contract manufacturer the format universe is about eight shapes, and each
  is a page of geometry. Five generators are implemented: tuck-end carton (reverse and
  straight), stand-up pouch, stick pack, jar wrap label, bottle wrap label / shrink sleeve.
  Output is layered SVG with cut, crease, perf, glue, seal, bleed and safe on named spot
  layers.
- **Live 3D preview driven by the same numbers.** The preview and the die line cannot
  drift because they read one `Dimensions` object. This is the structural advantage over
  a fixed mockup library.
- **Facts panel generation.** US Supplement Facts and GB/EU nutrition declaration, built
  from the ingredient deck, with **%NRV and %DV calculated, not typed**.
- **A deterministic compliance engine.** Twenty-eight executable rules over a structured
  product record, covering the A–E checklist in `claims-and-warning-check`. No model call,
  no credits, no hallucination, same answer every time.
- **Handoff exports.** `compliance-findings.md` in the exact format the existing skill
  specifies, plus die line SVG, panel SVG, `print-spec.md` and the record as JSON.

### Tier 2 — ordinary engineering, roughly one to three months

Nothing here is research. It is all known work with known libraries.

| Capability | Approach | Effort |
|---|---|---|
| **PDF/X-4 export** with true CMYK, spot separations, 3 mm bleed, outlined fonts | `pdf-lib` or Ghostscript for the writing; an ICC profile per printer | 3–4 weeks |
| **Real barcode symbols** — EAN-13 / UPC-A at correct magnification with bar-width reduction and quiet zones | `bwip-js`; the check-digit maths is already in `core/compliance/barcode.ts` | 3–5 days |
| **Preflight of uploaded PDFs** — fonts embedded, image ppi, colour space, spot names, die line on its own layer | Wrap `pdffonts`, `pdfimages`, `pdfinfo` — the same tools `packaging-artwork-review` already calls | 2 weeks |
| **Brand kits** — logo upload, licensed fonts, colour tokens, layout templates per format | Asset store + a template system over the existing canvas renderer | 3 weeks |
| **Projects, versions and approval gates** | Mirror `plugins/packaging-design-orchestrator` — brief, specs, tasks, review-log, gates G0–G6 | 3–4 weeks |
| **Photoreal rendering** — HDRI environment, substrate maps for matt, gloss, foil, soft-touch | Swap the three-point rig for an HDRI; add roughness/normal maps | 2 weeks |
| **Hive integration** — pull the formulation version and quote, push a comment | The MCP tools are already in this environment | 1–2 weeks |

### Tier 3 — achievable, but read the caveat first

**AI artwork generation (text → pack concept).** Yes, you can do this. But be clear about
what Packify is really doing, because their own feature list gives it away: "AI packaging
design", "Logo integration", "Smart design edit", "Label generator" and "Nutrition facts"
are *separate* tools. Image models cannot produce print-ready vector artwork with
accurate, legible, correctly-spelled text — so the working architecture is:

> generate **imagery** with a model → composite **real vector text, a real panel and a
> real die line** over it → export.

That is exactly the architecture already in this repository; the missing half is the
image-generation step. Build it that way and the text on the pack stays correct and
checkable. Try to generate the whole pack as one image and you will ship a proof with a
misspelled trademark, which is already on your lessons list.

**AI photoshoot / background swap.** Commodity, a few days on top of an image API.

**Manufacturer marketplace.** Skip it — see below.

### Tier 4 — do not build

- **A 5,000-mockup library.** That is Pacdora's asset moat, built over years. You need
  about eight formats and you generate them parametrically instead.
- **A $19.9/month self-serve design SaaS.** Wrong customer, wrong margin, and it competes
  with your own design team for the same work.
- **Shrink-sleeve pre-distortion.** You cannot compute it generically; it needs the
  converter's shrink map. The tool should say so and hand off, which it does.

## 3. The strategic point, which matters more than the feature list

Packify monetises **credits** from 200,000 self-serve users. Supplement Factory monetises
**manufacturing**. Copying their product without copying their business model produces a
tool that loses money.

SF Pack AI should not be a paid design tool. It should be a **free front door to the
factory** that:

1. shortens quote-to-artwork by letting a client see their pack the same day they enquire;
2. kills revision rounds by catching compliance faults before artwork reaches Dieter;
3. makes SF the path of least resistance, because the die line it produces is the die line
   SF's printers already run.

Packify has to find manufacturers. **You are the manufacturer.** That inverts the funnel.

## 4. The moat Pacdora cannot copy

Packify will cheerfully generate a pouch that says `NET WT 300ML`. It has no idea that a
weight descriptor with a volume unit is a mislabelling offence, that a warnings box
containing only storage text is a failure, or that Gabriel signs off GB/EU but **not** the
US.

Supplement Factory already has that knowledge written down — in the six-skill pack and in
the ten "lessons already paid for" in `docs/workflow-map.md`. This repository turns those
lessons into code that runs on every keystroke. A Singapore mockup company cannot copy
that, because it is not software; it is ten years of paid-for mistakes plus Gabriel and
Ryan standing behind the answer.

**That is the product.** The 3D is how you get the client to look at it.

## 5. Caveats to hold on to

- The compliance engine **finds problems and frames questions**. It does not issue the
  regulatory opinion, and it must never be allowed to look as if it does. Same rule as the
  skill it is built from.
- The NRV table and the market profiles need a named owner and a review date. Regulations
  move; hard-coded values rot quietly.
- Do not let the 3D preview become a de facto approval. It is a concept tool. Approval
  happens against a PDF proof, in writing, at the exact version — gate G4.
- "Print-ready" in this repository currently means a correct die line, not a PDF/X file.
  Tier 2 closes that gap; until it does, say so plainly to clients.
