import React, { memo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useTranslation } from 'react-i18next'

interface TrendPoint {
  timestamp: number
  upload: number
  download: number
}

interface Props {
  data: TrendPoint[]
  bucketSizeMs: number
}

const MAX_BARS = 60
const BAR_W = 0.6
const GAP = 0.22
const ROW_GAP = 1.6
const MAX_HEIGHT = 5.2

function sample(data: TrendPoint[]): TrendPoint[] {
  if (data.length <= MAX_BARS) return data
  const step = data.length / MAX_BARS
  const out: TrendPoint[] = []
  for (let i = 0; i < MAX_BARS; i++) {
    out.push(data[Math.floor(i * step)])
  }
  return out
}

const TrafficSkylineBase: React.FC<Props> = ({ data, bucketSizeMs }) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || data.length === 0) return
    const width = el.clientWidth
    const height = el.clientHeight
    if (!width || !height) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
    camera.position.set(9, 7, 12)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(width, height)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.5
    controls.minDistance = 6
    controls.maxDistance = 30
    controls.maxPolarAngle = Math.PI / 2.05
    controls.target.set(0, 1.2, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(6, 12, 8)
    scene.add(dir)

    // 地面网格
    const points = sample(data)
    const gridW = points.length * (BAR_W + GAP)
    const grid = new THREE.GridHelper(Math.max(gridW, ROW_GAP * 4) + 4, 24, 0x3b82f6, 0x1e293b)
    ;(grid.material as THREE.Material).opacity = 0.25
    ;(grid.material as THREE.Material).transparent = true
    scene.add(grid)

    const maxVal = Math.max(1, ...points.map((p) => Math.max(p.upload, p.download)))
    const group = new THREE.Group()
    scene.add(group)

    const upColor = new THREE.Color('#22c55e')
    const downColor = new THREE.Color('#3b82f6')

    points.forEach((p, i) => {
      const x = i * (BAR_W + GAP) - gridW / 2 + BAR_W / 2
      const rows: [number, number, THREE.Color][] = [
        [p.upload, -ROW_GAP / 2, upColor],
        [p.download, ROW_GAP / 2, downColor]
      ]
      for (const [value, z, color] of rows) {
        if (value <= 0) continue
        const h = Math.max(0.04, (value / maxVal) * MAX_HEIGHT)
        const geo = new THREE.BoxGeometry(BAR_W, h, BAR_W)
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.88,
          roughness: 0.35,
          metalness: 0.1
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, h / 2, z)
        group.add(mesh)

        // 柱顶亮片
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(BAR_W + 0.06, 0.03, BAR_W + 0.06),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
        )
        cap.position.set(x, h + 0.015, z)
        group.add(cap)
      }
    })

    // 时间轴标签：首/中/末三个刻度点（小光柱标记）
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.5
    })
    for (const idx of [0, Math.floor(points.length / 2), points.length - 1]) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, ROW_GAP + 0.6), markerMat)
      marker.position.set(idx * (BAR_W + GAP) - gridW / 2 + BAR_W / 2, 0.04, 0)
      group.add(marker)
    }

    let raf = 0
    const animate = (): void => {
      raf = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const observer = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    observer.observe(el)

    return (): void => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mat = obj.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat.dispose()
        }
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
    // 数据由父级在切换时间范围/维度时刷新，这里只在挂载时构建一次场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, bucketSizeMs])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute right-2 top-1 flex gap-3 text-[11px] text-foreground/60">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: '#22c55e' }} />↑{' '}
          {t('traffic.upload')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: '#3b82f6' }} />↓{' '}
          {t('traffic.download')}
        </span>
      </div>
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/40">
          —
        </div>
      )}
    </div>
  )
}

const TrafficSkyline = memo(TrafficSkylineBase)
TrafficSkyline.displayName = 'TrafficSkyline'

export default TrafficSkyline
