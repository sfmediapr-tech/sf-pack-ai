import { useMemo, useRef, useState } from 'react'
import { LAYERS, type Dieline, dielineToSvg } from '../core/dielines'

/** Flat die line viewer with layer toggles and a true-size readout. */
export function DielineView({ dieline }: { dieline: Dieline }) {
  const [labels, setLabels] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const hostRef = useRef<HTMLDivElement>(null)

  const svg = useMemo(() => dielineToSvg(dieline, { showPanelLabels: labels }), [dieline, labels])

  const visible = useMemo(() => {
    if (!hidden.size) return svg
    let out = svg
    for (const l of hidden) {
      out = out.replace(new RegExp(`(<g id="${l}"[^>]*)>`, 'g'), '$1 style="display:none">')
    }
    return out
  }, [svg, hidden])

  const used = useMemo(() => [...new Set(dieline.shapes.map((s) => s.layer))], [dieline])

  const toggle = (l: string) =>
    setHidden((h) => {
      const n = new Set(h)
      if (n.has(l)) n.delete(l)
      else n.add(l)
      return n
    })

  return (
    <div className="dieline">
      <div className="dieline-toolbar">
        {used.map((l) => (
          <button
            key={l}
            className={`chip ${hidden.has(l) ? 'chip-off' : ''}`}
            onClick={() => toggle(l)}
            title={`${LAYERS[l].spot} — ${LAYERS[l].printing ? 'printing' : 'non-printing'}`}
          >
            <span className="swatch" style={{ background: LAYERS[l].stroke }} />
            {l}
          </button>
        ))}
        <button className={`chip ${labels ? '' : 'chip-off'}`} onClick={() => setLabels((v) => !v)}>
          <span className="swatch" style={{ background: '#7a8699' }} />
          LABELS
        </button>
        <span className="dieline-size">
          {dieline.sheet.w.toFixed(1)} × {dieline.sheet.h.toFixed(1)} mm
        </span>
      </div>
      <div className="dieline-stage" ref={hostRef} dangerouslySetInnerHTML={{ __html: visible }} />
    </div>
  )
}
