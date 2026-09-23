import { useEffect, useMemo, useState } from 'react'
import { FORMATS, buildDieline, dielineToSvg, formatMeta } from '../core/dielines'
import { runCompliance } from '../core/compliance/rules'
import { toFindingsMarkdown } from '../core/compliance/report'
import { renderFactsPanel } from '../core/panels/factsPanel'
import { dielineToPdfX } from '../core/pdf/dielineToPdf'
import { preflightDielinePdf, preflightToMarkdown } from '../core/pdf/preflight'
import type { Dimensions, Market, PackFormat, ProductRecord, Stage } from '../core/types'
import { expectedPanel } from '../core/compliance/markets'
import { PackPreview } from '../three/PackPreview'
import { DielineView } from '../ui/DielineView'
import { FindingsTable } from '../ui/FindingsTable'
import { CLEAN_GB, FAULTY_GB, KITS } from '../sampleData'

type Tab = 'preview' | 'dieline' | 'panel' | 'record'

export interface StudioProps {
  record: ProductRecord
  setRecord: (r: ProductRecord) => void
  format: PackFormat
  setFormat: (f: PackFormat) => void
  dims: Dimensions
  setDims: (d: Dimensions) => void
  kitName: string
  setKitName: (k: string) => void
  onExit: () => void
}

export function Studio({
  record,
  setRecord,
  format,
  setFormat,
  dims,
  setDims,
  kitName,
  setKitName,
  onExit,
}: StudioProps) {
  const [tab, setTab] = useState<Tab>('preview')
  const [showGuides, setShowGuides] = useState(false)
  const [spin, setSpin] = useState(true)
  const [icc, setIcc] = useState<{ bytes: Uint8Array; fileName: string } | null>(null)
  const [intentId, setIntentId] = useState('FOGRA39L')

  const meta = useMemo(() => formatMeta(format), [format])
  const kit = KITS[kitName]

  // Keep the record's format in step with the selector — the compliance engine
  // reads it, and a mismatch between the 3D pack and the record is exactly the
  // sort of drift this tool exists to prevent.
  useEffect(() => {
    if (record.format !== format) setRecord({ ...record, format })
  }, [format, record, setRecord])

  const dieline = useMemo(() => buildDieline(format, dims), [format, dims])
  const report = useMemo(() => runCompliance(record), [record])
  const panel = useMemo(() => renderFactsPanel(record, 62), [record])

  const outputIntent = useMemo(
    () => ({
      identifier: intentId,
      info: INTENTS[intentId] ?? intentId,
      components: 4,
      iccProfile: icc?.bytes,
    }),
    [intentId, icc],
  )
  const preflight = useMemo(
    () => preflightDielinePdf({ dieline, outputIntent, requiredBleed: 3 }),
    [dieline, outputIntent],
  )

  const exportPdf = () => {
    const bytes = dielineToPdfX(dieline, {
      title: `${record.brand} ${record.productName} — ${dieline.format}`,
      outputIntent,
      panelLabels: true,
    })
    downloadBytes(`${slug(record)}_dieline_PDFX4.pdf`, bytes, 'application/pdf')
  }

  const loadIcc = async (file: File | undefined) => {
    if (!file) return
    const buf = new Uint8Array(await file.arrayBuffer())
    setIcc({ bytes: buf, fileName: file.name })
  }

  const pickFormat = (f: PackFormat) => {
    setFormat(f)
    setDims(formatMeta(f).defaults)
  }

  const loadSample = (r: ProductRecord) => {
    setRecord(r)
    setFormat(r.format)
    setDims(formatMeta(r.format).defaults)
  }

  const setMarket = (m: Market) => {
    const category =
      m === 'GB' ? 'gb-food-supplement' : m === 'EU' ? 'eu-food-supplement' : m === 'US' ? 'us-dietary-supplement' : 'ca-nhp'
    setRecord({ ...record, market: m, category, panelType: expectedPanel(category) ?? 'none' })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="back" onClick={onExit} aria-label="Back to the brief">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Brief
          </button>
          <div className="studio-title">
            <h1>{record.brand} {record.productName}</h1>
            <p>{dieline.format} · {record.market} · {record.stage.replace('-', ' ')}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => loadSample(CLEAN_GB)}>
            Load clean record
          </button>
          <button className="btn ghost" onClick={() => loadSample(FAULTY_GB)}>
            Load faulty record
          </button>
          <div className={`status status-${report.counts.BLOCKER ? 'bad' : report.counts.MAJOR + report.counts.QUESTION ? 'warn' : 'good'}`}>
            {report.counts.BLOCKER ? `${report.counts.BLOCKER} blockers` : report.counts.MAJOR + report.counts.QUESTION ? 'Notes' : 'Clear'}
          </div>
        </div>
      </header>

      <div className="layout">
        {/* ── left rail ───────────────────────────────────────────────── */}
        <aside className="rail">
          <Section title="Pack format">
            <div className="formats">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  className={`format ${format === f.id ? 'on' : ''}`}
                  onClick={() => pickFormat(f.id)}
                  title={f.blurb}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="hint">{meta.blurb}</p>
          </Section>

          <Section title="Dimensions (mm)">
            {meta.fields.map((f) => {
              const value = (dims[f.key] as number) ?? 0
              return (
                <label className="slider" key={String(f.key)}>
                  <span className="slider-label">
                    {f.label}
                    <input
                      className="num"
                      type="number"
                      value={value}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      onChange={(e) => setDims({ ...dims, [f.key]: Number(e.target.value) })}
                    />
                  </span>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={value}
                    onChange={(e) => setDims({ ...dims, [f.key]: Number(e.target.value) })}
                  />
                </label>
              )
            })}
            {dieline.warnings.length > 0 && (
              <ul className="geo-warnings">
                {dieline.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Brand kit">
            <div className="kits">
              {Object.keys(KITS).map((k) => (
                <button key={k} className={`kit ${kitName === k ? 'on' : ''}`} onClick={() => setKitName(k)}>
                  <span className="kit-sw" style={{ background: KITS[k].primary }} />
                  <span className="kit-sw" style={{ background: KITS[k].accent }} />
                  <span className="kit-sw" style={{ background: KITS[k].secondary }} />
                  {k}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Market and stage">
            <div className="segmented">
              {(['GB', 'EU', 'US', 'CA'] as Market[]).map((m) => (
                <button key={m} className={record.market === m ? 'on' : ''} onClick={() => setMarket(m)}>
                  {m}
                </button>
              ))}
            </div>
            <div className="segmented">
              {(['concept', 'client-proof', 'pre-press'] as Stage[]).map((s) => (
                <button key={s} className={record.stage === s ? 'on' : ''} onClick={() => setRecord({ ...record, stage: s })}>
                  {s.replace('-', ' ')}
                </button>
              ))}
            </div>
            <p className="hint">
              Stage decides how hard a placeholder bites: a concept may carry them, a proof may not.
            </p>
          </Section>

          <Section title="Print handoff">
            <label className="field">
              <span>Output intent</span>
              <select value={intentId} onChange={(e) => setIntentId(e.target.value)}>
                {Object.entries(INTENTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className={`icc ${icc ? 'icc-on' : ''}`}>
              <input
                type="file"
                accept=".icc,.icm"
                onChange={(e) => void loadIcc(e.target.files?.[0])}
                style={{ display: 'none' }}
              />
              {icc ? `✓ ${icc.fileName}` : 'Load press ICC profile…'}
            </label>

            <div className={`pf pf-${preflight.conforming ? 'good' : 'bad'}`}>
              <strong>{preflight.conforming ? 'Conforming PDF/X-4' : 'Not conforming'}</strong>
              <span>{preflight.claim}</span>
            </div>

            <button className="btn" onClick={exportPdf}>
              Die line PDF/X-4
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                download(`${slug(record)}_pdf-preflight.md`, preflightToMarkdown(preflight, record.productName), 'text/markdown')
              }
            >
              PDF preflight report
            </button>
          </Section>

          <Section title="Export">
            <button
              className="btn"
              onClick={() => download(`${slug(record)}_dieline.svg`, dielineToSvg(dieline, { showPanelLabels: false }), 'image/svg+xml')}
            >
              Die line SVG
            </button>
            <button
              className="btn"
              onClick={() => download(`${slug(record)}_compliance-findings.md`, toFindingsMarkdown(record, report), 'text/markdown')}
            >
              compliance-findings.md
            </button>
            <button className="btn" onClick={() => download(`${slug(record)}_panel.svg`, panel.svg, 'image/svg+xml')}>
              Facts panel SVG
            </button>
            <button
              className="btn ghost"
              onClick={() => download(`${slug(record)}_record.json`, JSON.stringify({ record, dims, format }, null, 2), 'application/json')}
            >
              Product record JSON
            </button>
            <button
              className="btn ghost"
              onClick={() => download(`${slug(record)}_print-spec.md`, printSpec(record, dieline.notes, dims), 'text/markdown')}
            >
              print-spec.md
            </button>
          </Section>
        </aside>

        {/* ── centre stage ────────────────────────────────────────────── */}
        <main className="stage">
          <nav className="tabs">
            {(['preview', 'dieline', 'panel', 'record'] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t === 'preview' ? '3D preview' : t === 'dieline' ? 'Die line' : t === 'panel' ? 'Facts panel' : 'Record'}
              </button>
            ))}
            <div className="tabs-right">
              {tab === 'preview' && (
                <>
                  <label className="toggle">
                    <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
                    Safe area
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} />
                    Spin
                  </label>
                </>
              )}
            </div>
          </nav>

          <div className="stage-body">
            {tab === 'preview' && (
              <div className="preview-wrap">
                <PackPreview format={format} dims={dims} product={record} kit={kit} showGuides={showGuides} spin={spin} />
                <p className="stage-note">
                  Drag to rotate, scroll to zoom. Every word on this pack comes from the record below — so what the
                  client sees here is what the compliance engine just checked.
                </p>
              </div>
            )}

            {tab === 'dieline' && (
              <div className="scroll">
                <DielineView dieline={dieline} />
                <div className="notes">
                  <h3>Build notes</h3>
                  <ul>
                    {dieline.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {tab === 'panel' && (
              <div className="scroll panel-view">
                <div className="panel-paper" dangerouslySetInnerHTML={{ __html: panel.svg }} />
                <div className="notes">
                  <h3>Panel</h3>
                  <p>
                    {panel.widthMm.toFixed(0)} × {panel.heightMm.toFixed(0)} mm at true size, generated from the
                    ingredient deck. %NRV is calculated, not typed.
                  </p>
                  {panel.warnings.length > 0 && (
                    <ul className="geo-warnings">
                      {panel.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {tab === 'record' && <RecordEditor record={record} onChange={setRecord} />}
          </div>
        </main>

        {/* ── right: compliance ───────────────────────────────────────── */}
        <aside className="inspector">
          <h2>Compliance</h2>
          <FindingsTable report={report} />
        </aside>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rail-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function RecordEditor({ record, onChange }: { record: ProductRecord; onChange: (r: ProductRecord) => void }) {
  const [text, setText] = useState(() => JSON.stringify(record, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(record, null, 2))
    setError(null)
  }, [record])

  const apply = () => {
    try {
      const parsed = JSON.parse(text) as ProductRecord
      setError(null)
      onChange(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  return (
    <div className="record">
      <div className="record-quick">
        <Field label="Brand" value={record.brand} onChange={(v) => onChange({ ...record, brand: v })} />
        <Field label="Product name" value={record.productName} onChange={(v) => onChange({ ...record, productName: v })} />
        <Field label="Statutory name" value={record.statutoryName} onChange={(v) => onChange({ ...record, statutoryName: v })} />
        <Field
          label="Net quantity as declared"
          value={record.netQuantity?.declaredAs ?? ''}
          onChange={(v) =>
            onChange({
              ...record,
              netQuantity: record.netQuantity ? { ...record.netQuantity, declaredAs: v } : { value: 0, unit: 'g', declaredAs: v },
            })
          }
        />
        <Field label="GTIN" value={record.gtin ?? ''} onChange={(v) => onChange({ ...record, gtin: v || null })} />
        <Field
          label="Formulation version"
          value={record.formulationVersion}
          onChange={(v) => onChange({ ...record, formulationVersion: v })}
        />
      </div>

      <label className="json-label">
        Full record — edit and apply
        <textarea className="json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      {error && <p className="json-error">{error}</p>}
      <button className="btn" onClick={apply}>
        Apply record
      </button>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function slug(r: ProductRecord) {
  return `${r.brand}_${r.productName}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
}

/** Registered print characterisations we offer by name. */
const INTENTS: Record<string, string> = {
  FOGRA39L: 'Coated FOGRA39 (ISO 12647-2:2004)',
  FOGRA51: 'PSO Coated v3 (FOGRA51)',
  FOGRA52: 'PSO Uncoated v3 (FOGRA52)',
  'FOGRA47L': 'Uncoated FOGRA47 (ISO 12647-2:2004)',
  CGATS21_2_CRPC6: 'GRACoL 2013 / CRPC6 (US sheetfed)',
  JapanColor2001Coated: 'Japan Color 2001 Coated',
}

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const url = URL.createObjectURL(new Blob([ab], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function printSpec(r: ProductRecord, notes: string[], d: Dimensions): string {
  return [
    `# print-spec — ${r.brand} ${r.productName}`,
    '',
    `Component: ${r.format}`,
    `Market: ${r.market}`,
    `Stage: ${r.stage}`,
    `Formulation version: ${r.formulationVersion || '**TBC — this is a blocker**'}`,
    '',
    '## Geometry',
    '',
    ...Object.entries(d)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `- ${k}: ${v} mm`),
    '',
    '## Build notes',
    '',
    ...notes.map((n) => `- ${n}`),
    '',
    '## Still to fill before this goes to a printer',
    '',
    '- Printer and press method',
    '- Substrate and finish',
    '- Colours: CMYK plus spots by name',
    '- Quantity and delivery',
    '',
    '*A TBC in this file is a blocker at handoff.*',
    '',
  ].join('\n')
}
