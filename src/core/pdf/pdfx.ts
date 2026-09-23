import { type Cmyk, type SpotColour, cmykOperands } from './colour'
import { PdfDoc, type Ref, array, dict, makeFileId, name, pdfDate, refStr, str } from './objects'

/**
 * PDF/X-4 document assembly (ISO 15930-7).
 *
 * The parts that matter and that general libraries make hard:
 *  · Separation colour spaces with a real tint transform, so a spot separates.
 *  · An OutputIntent carrying an embedded ICC profile.
 *  · Optional content groups whose Print state is OFF, which is how a die line
 *    says "I am geometry, do not put ink down for me".
 *  · MediaBox ⊇ BleedBox ⊇ TrimBox, and /Trapped stated rather than unknown.
 */

export const MM_TO_PT = 72 / 25.4

export interface OutputIntentSpec {
  /** Registered characterisation, e.g. "FOGRA39L". */
  identifier: string
  /** Human readable condition, e.g. "Coated FOGRA39 (ISO 12647-2:2004)". */
  info: string
  registryName?: string
  /**
   * The ICC profile bytes. Without these the file is NOT a conforming PDF/X-4 —
   * preflight says so rather than the export pretending otherwise.
   */
  iccProfile?: Uint8Array
  /** Colour components in the profile. 4 = CMYK. */
  components?: number
}

export interface LayerSpec {
  /** Stable id used in the content stream, e.g. "CUT". */
  id: string
  label: string
  /** false → /Usage /Print /PrintState /OFF. Die lines and guides are false. */
  printing: boolean
}

export interface PdfXSpec {
  title: string
  creator: string
  producer: string
  /** Sheet size in millimetres, including bleed. */
  sheet: { w: number; h: number }
  /** Trim box in millimetres, top-left origin, same space as the die line. */
  trim: { x: number; y: number; w: number; h: number }
  /** Bleed box in millimetres, top-left origin. Defaults to the whole sheet. */
  bleed?: { x: number; y: number; w: number; h: number }
  spots: SpotColour[]
  layers: LayerSpec[]
  outputIntent: OutputIntentSpec
  /** Extra lines for the document info / XMP description. */
  subject?: string
}

export interface BuiltPdf {
  bytes: Uint8Array
  /** Resource names the content stream may use. */
  spotName: (spot: string) => string
  layerName: (id: string) => string
}

/** Resource names are derived, so the content builder and the doc agree. */
export const spotResourceName = (spots: SpotColour[], n: string) => `S${spots.findIndex((s) => s.name === n)}`
export const layerResourceName = (layers: LayerSpec[], id: string) => `OC${layers.findIndex((l) => l.id === id)}`

const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(
    d.getSeconds(),
  )}${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function xmpPacket(spec: PdfXSpec, now: Date): string {
  const t = iso(now)
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="SF Pack AI">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(spec.title)}</rdf:li></rdf:Alt></dc:title>
   ${spec.subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(spec.subject)}</rdf:li></rdf:Alt></dc:description>` : ''}
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreateDate>${t}</xmp:CreateDate>
   <xmp:ModifyDate>${t}</xmp:ModifyDate>
   <xmp:MetadataDate>${t}</xmp:MetadataDate>
   <xmp:CreatorTool>${xmlEsc(spec.creator)}</xmp:CreatorTool>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${xmlEsc(spec.producer)}</pdf:Producer>
   <pdf:Trapped>False</pdf:Trapped>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
   <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/** [llx lly urx ury] in points, converting from a top-left millimetre box. */
function boxArray(sheetH: number, b: { x: number; y: number; w: number; h: number }): string {
  const llx = b.x * MM_TO_PT
  const urx = (b.x + b.w) * MM_TO_PT
  // Flip: PDF y is measured up from the bottom of the sheet.
  const ury = (sheetH - b.y) * MM_TO_PT
  const lly = (sheetH - (b.y + b.h)) * MM_TO_PT
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString()
  return `[ ${f(llx)} ${f(lly)} ${f(urx)} ${f(ury)} ]`
}

export function buildPdfX(spec: PdfXSpec, content: string): Uint8Array {
  const doc = new PdfDoc()
  const now = new Date()

  // ── Separation colour spaces ────────────────────────────────────────────
  // Tint transform is a Type 2 exponential from no ink to the alternate CMYK,
  // which is what makes a spot preview and separate correctly.
  const spotRefs = spec.spots.map((s) => {
    const fn = doc.obj(
      dict({
        FunctionType: '2',
        Domain: '[ 0 1 ]',
        C0: '[ 0 0 0 0 ]',
        C1: `[ ${cmykOperands(s.alternate)} ]`,
        N: '1',
      }),
    )
    return doc.obj(`[ /Separation ${name(s.name)} /DeviceCMYK ${refStr(fn)} ]`)
  })

  // ── Optional content groups ─────────────────────────────────────────────
  const ocgRefs = spec.layers.map((l) =>
    doc.obj(
      dict({
        Type: '/OCG',
        Name: str(l.label),
        Usage: dict({
          Print: `<< /PrintState ${l.printing ? '/ON' : '/OFF'} /Subtype /Print >>`,
          View: '<< /ViewState /ON >>',
        }),
      }),
    ),
  )

  // ── Graphics states: overprint on for technical marks ───────────────────
  const gsOverprint = doc.obj(dict({ Type: '/ExtGState', OP: 'true', op: 'true', OPM: '1' }))
  const gsNormal = doc.obj(dict({ Type: '/ExtGState', OP: 'false', op: 'false' }))

  // ── Output intent ───────────────────────────────────────────────────────
  const oi = spec.outputIntent
  let destProfile: Ref | undefined
  if (oi.iccProfile && oi.iccProfile.length > 0) {
    destProfile = doc.stream({ N: String(oi.components ?? 4) }, oi.iccProfile)
  }
  const outputIntent = doc.obj(
    dict({
      Type: '/OutputIntent',
      S: '/GTS_PDFX',
      OutputConditionIdentifier: str(oi.identifier),
      OutputCondition: str(oi.info),
      Info: str(oi.info),
      RegistryName: str(oi.registryName ?? 'http://www.color.org'),
      DestOutputProfile: destProfile ? refStr(destProfile) : undefined,
    }),
  )

  // ── Page ────────────────────────────────────────────────────────────────
  const contentRef = doc.stream({}, content)
  const pagesRef = doc.ref()
  const pageRef = doc.ref()

  const resources = dict({
    ProcSet: '[ /PDF ]',
    ColorSpace: dict(
      Object.fromEntries(spec.spots.map((_, i) => [`S${i}`, refStr(spotRefs[i])] as const)),
    ),
    ExtGState: dict({ GSop: refStr(gsOverprint), GSnorm: refStr(gsNormal) }),
    Properties: dict(Object.fromEntries(spec.layers.map((_, i) => [`OC${i}`, refStr(ocgRefs[i])] as const))),
  })

  const bleedBox = spec.bleed ?? { x: 0, y: 0, w: spec.sheet.w, h: spec.sheet.h }

  doc.obj(
    dict({
      Type: '/Page',
      Parent: refStr(pagesRef),
      MediaBox: boxArray(spec.sheet.h, { x: 0, y: 0, w: spec.sheet.w, h: spec.sheet.h }),
      BleedBox: boxArray(spec.sheet.h, bleedBox),
      TrimBox: boxArray(spec.sheet.h, spec.trim),
      Resources: resources,
      Contents: refStr(contentRef),
    }),
    pageRef,
  )

  doc.obj(dict({ Type: '/Pages', Kids: `[ ${refStr(pageRef)} ]`, Count: '1' }), pagesRef)

  // ── Metadata and catalog ────────────────────────────────────────────────
  const metadata = doc.stream({ Type: '/Metadata', Subtype: '/XML' }, xmpPacket(spec, now))

  const ocProps = dict({
    OCGs: array(ocgRefs.map(refStr)),
    D: dict({
      Order: array(ocgRefs.map(refStr)),
      ON: array(ocgRefs.map(refStr)),
      OFF: '[ ]',
      AS: `[ << /Event /Print /Category [ /Print ] /OCGs ${array(ocgRefs.map(refStr))} >> ]`,
    }),
  })

  const catalog = doc.obj(
    dict({
      Type: '/Catalog',
      Version: '/1.6',
      Pages: refStr(pagesRef),
      Metadata: refStr(metadata),
      OutputIntents: `[ ${refStr(outputIntent)} ]`,
      OCProperties: ocProps,
    }),
  )

  const info = doc.obj(
    dict({
      Title: str(spec.title),
      Subject: spec.subject ? str(spec.subject) : undefined,
      Creator: str(spec.creator),
      Producer: str(spec.producer),
      CreationDate: str(pdfDate(now)),
      ModDate: str(pdfDate(now)),
      Trapped: '/False',
    }),
  )

  return doc.build(catalog, info, makeFileId(spec.title + now.toISOString()))
}

/** Convenience for callers building content streams. */
export const setSpot = (resName: string, tint: number) =>
  `/${resName} cs ${Math.round(tint * 1000) / 1000} scn`

export const setProcess = (v: Cmyk) => `${cmykOperands(v)} k`
