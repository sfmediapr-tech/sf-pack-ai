import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { formatMeta } from './core/dielines'
import type { Dimensions, PackFormat, ProductRecord } from './core/types'
import { KITS } from './sampleData'
import { blankRecord } from './core/brief/blank'
import { Landing } from './views/Landing'

/**
 * The landing page is the first thing a client loads, and it does not need a
 * 3D engine to render a headline. Chat and Studio pull Three.js, GSAP's
 * timeline work and the PDF writer with them, so both are split out and
 * fetched only when someone actually opens the tool.
 */
const Chat = lazy(() => import('./views/Chat').then((m) => ({ default: m.Chat })))
const Studio = lazy(() => import('./views/Studio').then((m) => ({ default: m.Studio })))
import { decodeShare, initialShare, type ShareState } from './share/link'

type View = 'landing' | 'chat' | 'studio'

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [record, setRecord] = useState<ProductRecord>(blankRecord)
  const [format, setFormat] = useState<PackFormat>('stand-up-pouch')
  const [dims, setDims] = useState<Dimensions>(formatMeta('stand-up-pouch').defaults)
  const [kitName, setKitName] = useState('Premium dark')
  const [hasPack, setHasPack] = useState(false)
  const [restoring, setRestoring] = useState(true)

  const kit = useMemo(() => KITS[kitName], [kitName])

  // A shared link opens straight onto that pack, skipping the landing page —
  // the person following it was sent a specific pack, not an advert.
  useEffect(() => {
    // The URL was already read and stripped at module load; this only decodes.
    const payload = initialShare()
    if (!payload) {
      setRestoring(false)
      return
    }
    let live = true
    void decodeShare(payload).then((shared) => {
      if (!live) return
      if (shared) {
        setRecord(shared.record)
        setFormat(shared.format)
        setDims(shared.dims)
        if (KITS[shared.kit]) setKitName(shared.kit)
        setHasPack(true)
        setView('chat')
      }
      setRestoring(false)
    })
    return () => {
      live = false
    }
  }, [])

  const shareState = (): ShareState => ({ v: 1, record, format, dims, kit: kitName })

  const acceptBrief = (r: ProductRecord, f: PackFormat, d: Dimensions) => {
    setRecord(r)
    setFormat(f)
    setDims(d)
    setHasPack(true)
  }

  const reset = () => {
    setRecord(blankRecord())
    setFormat('stand-up-pouch')
    setDims(formatMeta('stand-up-pouch').defaults)
    setHasPack(false)
  }

  // Nothing renders until the link has been read, so a shared pack never
  // flashes the landing page first.
  if (restoring) return <div className="booting" aria-busy="true" />

  if (view === 'landing') return <Landing onStart={() => setView('chat')} />

  if (view === 'studio') {
    return (
      <Suspense fallback={<div className="booting" aria-busy="true" />}>
      <Studio
        record={record}
        setRecord={setRecord}
        format={format}
        setFormat={setFormat}
        dims={dims}
        setDims={setDims}
        kitName={kitName}
        setKitName={setKitName}
        onExit={() => setView('chat')}
      />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="booting" aria-busy="true" />}>
    <Chat
      record={record}
      dims={dims}
      format={format}
      kit={kit}
      hasPack={hasPack}
      onBrief={acceptBrief}
      onOpenStudio={() => setView('studio')}
      onReset={reset}
      shareState={shareState}
    />
    </Suspense>
  )
}
