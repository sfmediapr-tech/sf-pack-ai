import * as THREE from 'three'
import type { Dimensions, PackFormat } from '../core/types'

/**
 * Parametric pack geometry. Five formats, driven by the same millimetre
 * dimensions that generate the die line — so the 3D preview and the print file
 * can never drift apart, which is the whole point of doing it this way rather
 * than keeping a library of fixed mockups.
 *
 * Scene units are centimetres (mm / 10) to keep the camera numbers sane.
 */
const S = 0.1

export interface PackMesh {
  object: THREE.Object3D
  /** Materials by panel role, so textures can be swapped without rebuilding. */
  slots: Partial<Record<'front' | 'back' | 'side' | 'top' | 'bottom', THREE.MeshStandardMaterial[]>>
  /** Bounding height in scene units, for framing the camera. */
  height: number
}

function mat(color = '#dddddd', roughness = 0.55, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

export function buildPackMesh(format: PackFormat, d: Dimensions): PackMesh {
  switch (format) {
    case 'tuck-end-carton':
      return carton(d)
    case 'stand-up-pouch':
      return pouch(d)
    case 'stick-pack':
      return stick(d)
    case 'jar-wrap-label':
      return jar(d)
    case 'bottle-wrap-label':
      return bottle(d)
  }
}

// ── Carton ───────────────────────────────────────────────────────────────
function carton(d: Dimensions): PackMesh {
  const w = d.width * S
  const h = d.height * S
  const dp = d.depth * S

  const geo = new THREE.BoxGeometry(w, h, dp, 1, 1, 1)
  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
  const right = mat()
  const left = mat()
  const top = mat()
  const bottom = mat()
  const front = mat()
  const back = mat()
  const mesh = new THREE.Mesh(geo, [right, left, top, bottom, front, back])
  mesh.castShadow = true
  mesh.receiveShadow = true

  // A faint crease highlight along the vertical folds reads as board, not plastic.
  for (const m of [right, left, front, back]) m.roughness = 0.68

  const group = new THREE.Group()
  group.add(mesh)
  return {
    object: group,
    slots: { front: [front], back: [back], side: [left, right], top: [top], bottom: [bottom] },
    height: h,
  }
}

// ── Lofted half-shell ────────────────────────────────────────────────────
/**
 * Loft one half of a flexible pack between two angles, with its own UV space
 * running 0..1 across that half.
 *
 * Building the two halves separately is what makes the artwork land correctly:
 * a single wrapped UV would spread one texture round the whole loop, so each
 * face would show only half its own artwork.
 */
function loftHalf(o: {
  layers: number
  radial: number
  aStart: number
  aEnd: number
  height: number
  widthAt: (t: number) => number
  depthAt: (t: number) => number
  /** Superellipse exponent — higher is flatter-faced. */
  n: number
}): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  // Which end of the x axis this half starts at: +1 for the front sweep
  // (0 → π), -1 for the back sweep (π → 2π).
  const xs = Math.sign(Math.cos(o.aStart)) || 1

  for (let iy = 0; iy <= o.layers; iy++) {
    const t = iy / o.layers
    const y = o.height / 2 - t * o.height
    const hw = o.widthAt(t) / 2
    const hd = o.depthAt(t) / 2
    for (let ir = 0; ir <= o.radial; ir++) {
      const k = ir / o.radial
      const a = o.aStart + (o.aEnd - o.aStart) * k
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / o.n) * hw
      positions.push(x, y, Math.sign(sa) * Math.pow(Math.abs(sa), 2 / o.n) * hd)

      // u follows the flat face width, not the curved perimeter. Artwork is
      // printed flat and then the pack is formed, so mapping by angle would
      // magnify the front face and squeeze the art round the shoulders.
      const kx = hw > 0 ? (xs > 0 ? (hw - x) / (2 * hw) : (x + hw) / (2 * hw)) : k
      // World +x is on screen right in the front view and world -x in the back
      // view, so both halves read left to right with u = 1 - kx.
      uvs.push(1 - kx, 1 - t)
    }
  }
  for (let iy = 0; iy < o.layers; iy++) {
    for (let ir = 0; ir < o.radial; ir++) {
      const a = iy * (o.radial + 1) + ir
      const b = a + o.radial + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ── Stand-up pouch ───────────────────────────────────────────────────────
/**
 * Depth varies with height: pinched flat at the top seal, fullest just above
 * the gusset, flaring at the base where the gusset opens out. That profile is
 * what makes a doypack read as a doypack rather than as a flat bag.
 */
function pouch(d: Dimensions): PackMesh {
  const w = d.width * S
  const h = d.height * S
  const g = (d.gusset ?? d.depth / 2) * S
  const maxDepth = g * 1.5

  const depthAt = (t: number) => {
    if (t < 0.05) return maxDepth * 0.05
    const k = (t - 0.05) / 0.95
    const rise = Math.pow(Math.min(k / 0.3, 1), 0.65)
    const base = 0.84 + 0.16 * Math.pow(k, 2.2)
    return maxDepth * rise * base
  }
  const widthAt = (t: number) => (t < 0.05 ? w * (0.94 + t) : w * (0.985 + 0.015 * Math.sin(t * Math.PI)))

  const common = { layers: 44, radial: 28, height: h, widthAt, depthAt, n: 3.2 }
  const frontGeo = loftHalf({ ...common, aStart: 0, aEnd: Math.PI })
  const backGeo = loftHalf({ ...common, aStart: Math.PI, aEnd: Math.PI * 2 })

  const front = mat('#eeeeee', 0.42, 0.06)
  const back = mat('#eeeeee', 0.42, 0.06)
  front.side = THREE.DoubleSide
  back.side = THREE.DoubleSide

  const group = new THREE.Group()
  const fm = new THREE.Mesh(frontGeo, front)
  const bm = new THREE.Mesh(backGeo, back)
  fm.castShadow = true
  bm.castShadow = true
  group.add(fm, bm)

  // Top seal strip.
  const seal = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.99, h * 0.022, maxDepth * 0.14),
    mat('#dcdcdc', 0.62),
  )
  seal.position.y = h / 2 - h * 0.006
  group.add(seal)

  return { object: group, slots: { front: [front], back: [back] }, height: h }
}

// ── Stick pack ───────────────────────────────────────────────────────────
function stick(d: Dimensions): PackMesh {
  const w = d.width * S
  const h = d.height * S
  const depth = Math.max(w * 0.45, 0.4)

  // Crimped flat at both ends, full in the middle.
  const depthAt = (t: number) => {
    const crimp = Math.min(t / 0.09, 1) * Math.min((1 - t) / 0.09, 1)
    return depth * Math.pow(Math.max(crimp, 0.03), 0.6)
  }
  const widthAt = () => w

  const common = { layers: 30, radial: 20, height: h, widthAt, depthAt, n: 2.8 }
  const frontGeo = loftHalf({ ...common, aStart: 0, aEnd: Math.PI })
  const backGeo = loftHalf({ ...common, aStart: Math.PI, aEnd: Math.PI * 2 })

  const front = mat('#f0f0f0', 0.35, 0.18)
  const back = mat('#f0f0f0', 0.35, 0.18)
  front.side = THREE.DoubleSide
  back.side = THREE.DoubleSide

  const group = new THREE.Group()
  const fm = new THREE.Mesh(frontGeo, front)
  const bm = new THREE.Mesh(backGeo, back)
  fm.castShadow = true
  bm.castShadow = true
  group.add(fm, bm)

  return { object: group, slots: { front: [front], back: [back] }, height: h }
}

// ── Jar ──────────────────────────────────────────────────────────────────
function jar(d: Dimensions): PackMesh {
  const dia = (d.diameter ?? d.width) * S
  const labelH = d.height * S
  const bodyH = labelH * 1.35
  const r = dia / 2

  const group = new THREE.Group()

  const bodyMat = mat('#ffffff', 0.35, 0.02)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.985, bodyH, 64, 1, false), bodyMat)
  body.castShadow = true
  group.add(body)

  // Label band, very slightly proud of the body so it does not z-fight.
  const label = mat('#eeeeee', 0.5, 0.01)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.004, r * 1.004, labelH, 64, 1, true), label)
  band.position.y = -bodyH * 0.06
  group.add(band)

  // Screw cap.
  const capH = bodyH * 0.16
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, capH, 64), mat('#1a1a1a', 0.45))
  cap.position.y = bodyH / 2 + capH / 2
  cap.castShadow = true
  group.add(cap)

  return { object: group, slots: { front: [label] }, height: bodyH + capH }
}

// ── Bottle ───────────────────────────────────────────────────────────────
function bottle(d: Dimensions): PackMesh {
  const dia = (d.diameter ?? d.width) * S
  const labelH = d.height * S
  const r = dia / 2
  const bodyH = labelH * 1.5
  const group = new THREE.Group()

  const glass = mat('#f2f4f3', 0.18, 0.05)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, bodyH, 64), glass)
  body.castShadow = true
  group.add(body)

  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r, bodyH * 0.22, 64), glass)
  shoulder.position.y = bodyH / 2 + bodyH * 0.11
  group.add(shoulder)

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.36, bodyH * 0.16, 48), glass)
  neck.position.y = bodyH / 2 + bodyH * 0.22 + bodyH * 0.08
  group.add(neck)

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, bodyH * 0.14, 48), mat('#151515', 0.4))
  cap.position.y = bodyH / 2 + bodyH * 0.22 + bodyH * 0.16 + bodyH * 0.04
  cap.castShadow = true
  group.add(cap)

  const label = mat('#eeeeee', 0.5, 0.01)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.005, r * 1.005, labelH, 64, 1, true), label)
  band.position.y = -bodyH * 0.05
  group.add(band)

  return { object: group, slots: { front: [label] }, height: bodyH * 1.5 }
}

export function disposePack(pm: PackMesh) {
  pm.object.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
    for (const mm of mats) {
      const sm = mm as THREE.MeshStandardMaterial
      sm.map?.dispose()
      sm.dispose()
    }
  })
}
