# SF Pack AI — architecture, AI stack, and the road from zero

Written 23 September 2026, after testing Packify's live design-chat on Dieter's account
and auditing this Mac.

---

## 1. What the Packify test actually proved

One prompt — *"Stand-up pouch for a UK food supplement, 300ml immune support powder.
Premium dark green and gold, minimal, retail shelf."* — cost **11 credits** and about
40 seconds. It returned a photoreal lifestyle shot of a dark green pouch with gold
botanical foiling.

It is a beautiful image. It is also **not a pack**:

| What it did | Why it matters |
|---|---|
| Invented the brand name "VITAL GROVE" | Your clients already have a brand. |
| Invented the claim "Vitamin C, Zinc & Botanical Blend" | Nobody told it the formulation. That is a fabricated ingredient deck on a food label. |
| No statutory name, net quantity, warnings, address, allergens or barcode | Unlawful as a GB food supplement on at least six counts. |
| Output is a **photograph**, not a flat, a die line or a vector file | There is no path from this to a printer. |
| Follow-ups are "Edit the product title **on this image**" | You stay in raster forever. |

So the honest read: **Packify sells mood, not manufacture.** It is a superb concept and
pitch tool and a poor packaging tool. The distance from that image to something Unette can
print is the entire job — and that job is what Supplement Factory already does.

That is the thesis the whole architecture below is built on:

> **The image model decorates. It never authors content.**
> Every word on the pack comes from a structured record that a human or a document filled in.

---

## 2. Your machine — what it can and cannot do

```
Mac mini (Mac16,10) · Apple M4 · 10 cores (4P + 6E) · 16 GB unified memory
Free disk: 15 GB          ← the binding constraint
Node 26.8.2 · npm 11.19.1 · git 2.50.1
Python 3.9.6 (system python, pip 21 — old)
Ollama 0.34.2 · qwen3.5:9b, hermes-qwen:9b, hermes-omnicoder:9b, omnicoder-9b (all ~6 GB text models)
Adobe Illustrator / InDesign / Photoshop 2025 + 2026 · full Affinity suite
No Docker, no Deno/Bun, no image-generation models
```

**Three conclusions, in order of importance:**

1. **Do not run image generation locally.** FLUX.1-dev is about 24 GB of weights; SDXL plus
   ComfyUI is 10–15 GB. You have 15 GB free. Even if you cleared space, 16 GB of unified
   memory makes SDXL slow (roughly 30–60 s an image) and FLUX painful. Use hosted APIs.
2. **Do not use the local Ollama models for compliance.** A 9B model will produce confident,
   fluent, wrong answers about GB labelling law. Getting compliance subtly wrong is worse
   than not attempting it. They are fine for offline drafting and for developing without
   burning API spend.
3. **Adobe 2026 is an asset Packify does not have.** Illustrator is scriptable (UXP /
   ExtendScript). The final step — drop the generated die line and panel into a working
   `.ai` file with correct layers and spot swatches — can run on this Mac. That is a real
   moat: Packify cannot hand Dieter a native file.

**One thing to fix early:** system Python 3.9 with pip 21 will fight you. `brew install
python@3.13` and use a venv if any Python enters the stack. Also free some disk — 15 GB is
tight for a Node project with build caches.

---

## 3. The AI stack — which model does which job

The mistake to avoid is "an AI makes the packaging". Three different jobs need three
different kinds of model, and one of them needs no model at all.

### Layer 1 — Reasoning: brief → structured record

**Use Claude.** Sonnet 5 for the routine turns, Opus 5 where compliance reasoning is hard.

Its job is *extraction and interrogation*, never invention: read the client's email, the
formulation PDF and the spec sheet, and fill a `ProductRecord`. Anything it cannot source
becomes a **blocker**, not a guess. That single constraint is what stops you shipping
"VITAL GROVE · Vitamin C, Zinc & Botanical Blend".

Implement it as **tool calling against a JSON schema**, not free text: Claude calls
`setIngredient`, `setNetQuantity`, `flagMissing`. The record is the contract.

You already have Claude access configured (`ANTHROPIC_BASE_URL` is set in this environment).

### Layer 2 — Visual: the graphic element, not the pack

Pick **one** to start. All are hosted; none run on this Mac.

| Model | Why you'd pick it | Watch out for |
|---|---|---|
| **Google Gemini 3 Pro Image** | Strong prompt adherence, very good text rendering | General purpose, not packaging-aware |
| **OpenAI gpt-image-1** | Best instruction following; masked editing is excellent for iterating one panel | Cost per image adds up |
| **FLUX.1 Kontext** (Black Forest Labs) | Best at *editing* an existing image while preserving everything else — the real need when a client says "same but warmer" | Editing-first, less strong from scratch |
| **Ideogram v3** | Historically the best typography in raster images | Narrower editing story |
| **Recraft V3** | **Outputs real SVG vector.** Uniquely relevant — a vector graphic element can go straight into Illustrator | Style range narrower than the others |

**Advice:** go through **fal.ai** or **Replicate** rather than each vendor directly. One
interface, swap models with a string, no rewrite when something better lands in six months.
Start with Gemini 3 Pro Image or gpt-image-1 for concepts; add Recraft when you want the
graphic as vector.

Pricing moves constantly — check current rates before you model the economics. Order of
magnitude is cents per image, so a client concept round is pennies, not pounds.

### Layer 3 — Deterministic: no AI at all

Die lines, the facts panel, %NRV, GTIN check digits, the compliance rules, PDF/X-4. This is
**already built** in `src/core`. It is pure maths and encoded law.

This layer is the product. It costs nothing to run, returns the same answer every time, and
cannot hallucinate. Every hour spent here beats an hour spent on prompt engineering.

---

## 4. The architecture

```
                        ┌──────────────────────────────┐
   Client browser ─────►│  Next.js app  (Vercel)       │
   Dieter's browser     └──────────────┬───────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  ┌───────────┐                 ┌─────────────┐                ┌────────────┐
  │ Chat      │                 │ Studio      │                │ Concepts   │
  │ front door│                 │ (built)     │                │            │
  └─────┬─────┘                 └──────┬──────┘                └─────┬──────┘
        │ tool calls                   │ pure functions              │
        ▼                              ▼                             ▼
  ┌───────────┐              ┌──────────────────┐            ┌──────────────┐
  │  Claude   │              │  src/core        │            │ fal.ai /     │
  │ Sonnet 5  │─────────────►│  dielines        │            │ Replicate    │
  │ Opus 5    │  fills       │  compliance      │            │  → image     │
  └───────────┘  the record  │  panels · pdf    │            └──────────────┘
                             └──────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
          ┌──────────────────┐                  ┌──────────────────┐
          │ Postgres (Neon)  │                  │ Object store (R2)│
          │ records,versions │                  │ uploads, renders │
          │ approvals, log   │                  │ PDFs, ICC files  │
          └──────────────────┘                  └──────────────────┘
```

**The load-bearing idea:** `ProductRecord` is the single source of truth. The chat writes
to it. The studio edits it. The compliance engine reads it. The 3D preview renders it. The
PDF exports it. Nothing anywhere else holds pack content — so the 3D the client approves
and the file the printer receives cannot disagree.

The image model sits **outside** that loop. It returns a background or a graphic element,
which is composited *underneath* the real text layer. It never supplies a word.

---

## 5. Zero to hero

Phase 0 is done. Each phase after it is shippable on its own.

| Phase | What you get | Rough effort |
|---|---|---|
| **0 · Engine** ✅ | Die lines, 3D, facts panels, 28 compliance rules, exports | done |
| **1 · Chat front door** | Claude tool-calling fills the record from a typed brief; studio stays behind an "Open in studio" button | ~1 week |
| **2 · Visual concepts** | One image API for the graphic element, composited under real text | ~1 week |
| **3 · Persistence** | Postgres, auth, projects, versions, share links for clients | ~1.5 weeks |
| **4 · Deploy** | Vercel, custom domain, marketing page | ~3 days |
| **5 · Print handoff** | PDF/X-4 with real CMYK + spot separations *(in progress)*, Illustrator script | ~2 weeks |
| **6 · Factory loop** | Hive quote/spec integration, approval gates G0–G6, review log | ~2 weeks |

**Build phase 1 before phase 2.** The temptation is to wire up an image model first because
it demos well. Resist it: without the record, you have built Packify, and Packify already
exists and is better at being Packify than you will be.

### The simplest version that is genuinely useful

If you want one thing on a client's screen next week, it is not the AI:

1. Client picks a format and types their dimensions.
2. They see the pack in 3D and the die line, at true size.
3. They paste their ingredient deck; the panel builds itself with real %NRV.
4. The compliance panel tells them, live, what is missing before they have paid anyone.
5. They hit "Send to Supplement Factory" and it lands as a structured brief, not an email.

That is phases 0 + 3 + 4, no image model at all, and it already does something Packify
cannot.

---

## 6. Sharing it with clients

**Do not serve it from this Mac mini.** 15 GB free disk, it sleeps, it is on home
broadband, there is no failover, and client formulation data sitting on a desk machine is a
GDPR conversation you do not want.

| Option | Use it for | Reality |
|---|---|---|
| **Vercel** ✅ | Production | Free tier is enough to start. `git push` deploys. Custom domain, HTTPS, previews per branch. The app is already Vite/React — moving to Next.js is a day, or deploy the static build plus small API routes. |
| **Cloudflare Tunnel** | A demo this afternoon | Public HTTPS URL to localhost without opening a port. Fine for showing a client live; not production. |
| **Tailscale** | Internal only | Dieter and Gabriel reach it, nobody else. Good for the pre-launch period. |

Put the API keys in Vercel environment variables. Never in the repo, never in the browser
bundle — every image-model call goes through your own server route so the key stays server
side and you can meter spend per client.

---

## 7. What this costs to run

- **Claude** — pennies per brief. The reasoning layer runs a handful of turns per project.
- **Image model** — cents per image via fal.ai or Replicate. A concept round of four images
  is small change. Meter it per project so one client cannot run up a bill.
- **Hosting** — Vercel free tier, Neon free tier, Cloudflare R2 effectively free at this
  volume. Realistically £0 until you have real traffic.
- **The deterministic core** — free. Forever. It is maths.

Compare that with Packify at $29.9/month for 3,500 credits, where a single design costs 11.
That is roughly 300 generations a month, and none of them are legal to print.

---

## 8. The two rules to hold on to

1. **Nothing on the pack comes from a model.** Content comes from the record; the record
   comes from a document or a person. A model may *read* a document to fill the record, and
   the record shows its source. If there is no source, it is a blocker.
2. **The compliance engine finds problems and frames questions. It never issues the
   opinion.** Gabriel signs off UK/EU. A qualified US reviewer signs off the US. The
   software's job is to make sure they are asked the right question, with evidence attached.
