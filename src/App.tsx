import { useMemo, useState } from 'react'
import { formatMeta } from './core/dielines'
import type { Dimensions, PackFormat, ProductRecord } from './core/types'
import { KITS } from './sampleData'
import { blankRecord } from './core/brief/blank'
import { Chat } from './views/Chat'
import { Landing } from './views/Landing'
import { Studio } from './views/Studio'

type View = 'landing' | 'chat' | 'studio'

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [record, setRecord] = useState<ProductRecord>(blankRecord)
  const [format, setFormat] = useState<PackFormat>('stand-up-pouch')
  const [dims, setDims] = useState<Dimensions>(formatMeta('stand-up-pouch').defaults)
  const [kitName, setKitName] = useState('Premium dark')
  const [hasPack, setHasPack] = useState(false)

  const kit = useMemo(() => KITS[kitName], [kitName])

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

  if (view === 'landing') return <Landing onStart={() => setView('chat')} />

  if (view === 'studio') {
    return (
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
    )
  }

  return (
    <Chat
      record={record}
      dims={dims}
      format={format}
      kit={kit}
      hasPack={hasPack}
      onBrief={acceptBrief}
      onOpenStudio={() => setView('studio')}
      onReset={reset}
    />
  )
}
