import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Dimensions, PackFormat, ProductRecord } from '../core/types'
import { type BrandKit, type PanelRole, renderPanelArt } from './artwork'
import { buildPackMesh, disposePack } from './geometry'

interface Props {
  format: PackFormat
  dims: Dimensions
  product: ProductRecord
  kit: BrandKit
  showGuides: boolean
  spin: boolean
}

/**
 * Turntable preview. Deliberately hand-rolled rather than react-three-fiber:
 * the whole scene is rebuilt only when geometry or artwork actually changes,
 * and the drag/zoom is a dozen lines, so there is nothing else to keep in sync.
 */
export function PackPreview({ format, dims, product, kit, showGuides, spin }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const state = useRef<{
    renderer?: THREE.WebGLRenderer
    scene?: THREE.Scene
    camera?: THREE.PerspectiveCamera
    pack?: ReturnType<typeof buildPackMesh>
    yaw: number
    pitch: number
    dist: number
    /** Height the camera looks at, so the pack sits centred in frame. */
    target: number
    spin: boolean
    raf?: number
  }>({ yaw: 0.5, pitch: 0.1, dist: 40, target: 0, spin: true })

  // ── one-time scene setup ────────────────────────────────────────────────
  useEffect(() => {
    const el = host.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    el.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.cursor = 'grab'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000)

    // Soft studio: key, fill, rim, plus a ground bounce.
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(14, 22, 18)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 120
    const c = key.shadow.camera as THREE.OrthographicCamera
    c.left = -30; c.right = 30; c.top = 30; c.bottom = -30
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xffffff, 0.7)
    fill.position.set(-18, 8, 12)
    scene.add(fill)

    const rim = new THREE.DirectionalLight(0xcfe3ff, 1.1)
    rim.position.set(-6, 12, -20)
    scene.add(rim)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.55))

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    state.current.renderer = renderer
    state.current.scene = scene
    state.current.camera = camera

    // ── interaction ───────────────────────────────────────────────────────
    let dragging = false
    let lastX = 0
    let lastY = 0
    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      state.current.spin = false
      renderer.domElement.setPointerCapture(e.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      state.current.yaw += (e.clientX - lastX) * 0.008
      state.current.pitch = Math.max(-0.9, Math.min(1.1, state.current.pitch + (e.clientY - lastY) * 0.006))
      lastX = e.clientX
      lastY = e.clientY
    }
    const up = (e: PointerEvent) => {
      dragging = false
      renderer.domElement.releasePointerCapture?.(e.pointerId)
      renderer.domElement.style.cursor = 'grab'
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      state.current.dist = Math.max(8, Math.min(180, state.current.dist * (1 + e.deltaY * 0.0012)))
    }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointermove', move)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('pointercancel', up)
    renderer.domElement.addEventListener('wheel', wheel, { passive: false })

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let t = 0
    const loop = () => {
      state.current.raf = requestAnimationFrame(loop)
      t += 0.005
      if (state.current.spin) state.current.yaw += 0.0045
      const { yaw, pitch, dist, target } = state.current
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * dist,
        target + Math.sin(pitch) * dist,
        Math.cos(yaw) * Math.cos(pitch) * dist,
      )
      camera.lookAt(0, target, 0)
      renderer.render(scene, camera)
    }
    loop()
    void t

    return () => {
      if (state.current.raf) cancelAnimationFrame(state.current.raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointermove', move)
      renderer.domElement.removeEventListener('pointerup', up)
      renderer.domElement.removeEventListener('wheel', wheel)
      if (state.current.pack) disposePack(state.current.pack)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    state.current.spin = spin
  }, [spin])

  // ── rebuild geometry + textures when anything meaningful changes ────────
  useEffect(() => {
    const s = state.current
    if (!s.scene) return
    let cancelled = false

    if (s.pack) {
      s.scene.remove(s.pack.object)
      disposePack(s.pack)
      s.pack = undefined
    }

    const pack = buildPackMesh(format, dims)
    // Sit the pack on the ground plane and frame it from its real bounds, not
    // from a nominal height — the formats differ too much for one fudge factor.
    const box = new THREE.Box3().setFromObject(pack.object)
    pack.object.position.y = -box.min.y
    s.scene.add(pack.object)
    s.pack = pack

    const size = box.getSize(new THREE.Vector3())
    s.target = size.y / 2
    const radius = Math.max(size.x, size.y, size.z) / 2
    const fov = (32 * Math.PI) / 180
    s.dist = (radius / Math.sin(fov / 2)) * 1.45

    // Panel pixel sizes follow the real millimetre dimensions.
    const faceSizes: Record<PanelRole, { w: number; h: number }> = {
      front: { w: dims.width, h: dims.height },
      back: { w: dims.width, h: dims.height },
      side: { w: dims.depth, h: dims.height },
      top: { w: dims.width, h: dims.depth },
      bottom: { w: dims.width, h: dims.depth },
    }
    if (format === 'jar-wrap-label' || format === 'bottle-wrap-label') {
      const circ = Math.PI * (dims.diameter ?? dims.width)
      faceSizes.front = { w: circ, h: dims.height }
    }
    if (format === 'stand-up-pouch' || format === 'stick-pack') {
      faceSizes.front = { w: dims.width, h: dims.height }
      faceSizes.back = { w: dims.width, h: dims.height }
    }

    ;(async () => {
      for (const role of Object.keys(pack.slots) as PanelRole[]) {
        const mats = pack.slots[role]
        if (!mats?.length) continue
        const size = faceSizes[role]
        const canvas = await renderPanelArt({
          role,
          wMm: size.w,
          hMm: size.h,
          product,
          kit,
          showGuides,
          safeMm: dims.safeMargin,
        })
        if (cancelled) return
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        // Wrapped formats: the flat art runs right round, so repeat in u.
        if (format === 'jar-wrap-label' || format === 'bottle-wrap-label') {
          tex.wrapS = THREE.RepeatWrapping
          tex.offset.x = 0.25
        }
        for (const m of mats) {
          m.map?.dispose()
          m.map = tex
          m.color.set('#ffffff')
          m.needsUpdate = true
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [format, dims, product, kit, showGuides])

  return <div ref={host} style={{ width: '100%', height: '100%', minHeight: 320 }} />
}
