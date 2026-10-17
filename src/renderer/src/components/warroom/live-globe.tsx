import React, { memo, useEffect, useRef } from 'react'
import type { GlobeInstance } from 'globe.gl'
import { useTranslation } from 'react-i18next'
import { getRegionByIso, type RegionInfo } from '@renderer/utils/region'
import countriesUrl from '@renderer/assets/geo/countries-110m.json?url'

interface LiveGlobeProps {
  /** 活跃连接的目的地地区聚合：iso → 连接数 */
  activeByIso: Map<string, number>
}

interface BucketPoint {
  lat: number
  lng: number
  name: string
  count: number
  isHome?: boolean
}

interface OrbitRing {
  points: { lat: number; lng: number }[]
  color: string
}

// 本机位置的装饰性原点（与星图保持一致）
const HOME = { lat: 32, lng: 106 }

// 装饰性卫星轨道：绕原点倾斜的等纬度圈，用虚线流动模拟在轨运动
function buildOrbit(inclinationDeg: number, radiusDeg: number, color: string): OrbitRing {
  const inc = (inclinationDeg * Math.PI) / 180
  const a = (radiusDeg * Math.PI) / 180
  const points: { lat: number; lng: number }[] = []
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * Math.PI * 2
    const x = Math.sin(a) * Math.cos(th)
    const y = Math.sin(a) * Math.sin(th)
    const z = Math.cos(a)
    const y2 = y * Math.cos(inc) - z * Math.sin(inc)
    const z2 = y * Math.sin(inc) + z * Math.cos(inc)
    points.push({
      lat: (Math.asin(z2) * 180) / Math.PI,
      lng: (Math.atan2(y2, x) * 180) / Math.PI
    })
  }
  return { points, color }
}

const ORBITS: OrbitRing[] = [
  buildOrbit(26, 64, 'rgba(125,211,252,0.55)'),
  buildOrbit(-48, 76, 'rgba(96,165,250,0.45)'),
  buildOrbit(74, 52, 'rgba(167,139,250,0.45)')
]

function acc<T, Out>(fn: (d: T) => Out): (obj: object) => Out {
  return (obj) => fn(obj as T)
}

function countToColor(count: number): string {
  if (count >= 20) return '#f87171'
  if (count >= 8) return '#fbbf24'
  if (count >= 2) return '#34d399'
  return '#60a5fa'
}

const LiveGlobeBase: React.FC<LiveGlobeProps> = ({ activeByIso }) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  // 最新数据塞进 ref，不重建 WebGL 场景
  const activeRef = useRef(activeByIso)
  activeRef.current = activeByIso

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let disposed = false
    let globe: GlobeInstance | null = null
    let observer: ResizeObserver | null = null

    const applyBuckets = (g: GlobeInstance): void => {
      const buckets: { region: RegionInfo; count: number }[] = []
      activeRef.current.forEach((count, iso) => {
        const region = getRegionByIso(iso)
        if (region) buckets.push({ region, count })
      })
      const points: BucketPoint[] = buckets.map(({ region, count }) => ({
        lat: region.lat,
        lng: region.lng,
        name: region.name,
        count
      }))
      points.push({
        lat: HOME.lat,
        lng: HOME.lng,
        name: t('proxies.globe.home'),
        count: 1,
        isHome: true
      })
      g.pointsData(points)
      g.arcsData(buckets)
      g.ringsData(points)
    }

    import('globe.gl').then(({ default: Globe }) => {
      if (disposed) return
      globe = new Globe(el, { animateIn: true })
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#3d7bff')
        .atmosphereAltitude(0.16)
        .showGraticules(true)
        .polygonsData([])
        .polygonCapColor(() => 'rgba(12,32,72,0.32)')
        .polygonSideColor(() => 'rgba(40,100,220,0.08)')
        .polygonStrokeColor(() => 'rgba(96,160,255,0.55)')
        .polygonAltitude(0.006)
        .pointLat(acc((d: BucketPoint) => d.lat))
        .pointLng(acc((d: BucketPoint) => d.lng))
        .pointColor(acc((d: BucketPoint) => (d.isHome ? '#7dd3fc' : countToColor(d.count))))
        .pointAltitude(
          acc((d: BucketPoint) => (d.isHome ? 0.02 : 0.015 + Math.min(0.12, d.count * 0.012)))
        )
        .pointRadius(
          acc((d: BucketPoint) => (d.isHome ? 0.3 : 0.28 + Math.min(0.9, d.count * 0.05)))
        )
        .pointsMerge(false)
        .pointLabel(
          acc((d: BucketPoint) =>
            d.isHome
              ? `<div style="background:rgba(5,10,25,0.85);border:1px solid rgba(96,160,255,0.4);border-radius:6px;padding:4px 8px;color:#cfe4ff">${d.name}</div>`
              : `<div style="background:rgba(5,10,25,0.85);border:1px solid rgba(96,160,255,0.4);border-radius:6px;padding:4px 8px;color:#cfe4ff">${d.name} · ${d.count}</div>`
          )
        )
        .arcStartLat(() => HOME.lat)
        .arcStartLng(() => HOME.lng)
        .arcEndLat(acc((d: { region: RegionInfo }) => d.region.lat))
        .arcEndLng(acc((d: { region: RegionInfo }) => d.region.lng))
        .arcColor(
          acc((d: { count: number }) => [
            'rgba(79,124,255,0.12)',
            d.count >= 8
              ? 'rgba(248,113,113,0.75)'
              : d.count >= 2
                ? 'rgba(52,211,153,0.7)'
                : 'rgba(96,165,250,0.6)'
          ])
        )
        .arcAltitude(acc((d: { count: number }) => 0.1 + Math.min(0.26, d.count * 0.016)))
        .arcStroke(acc((d: { count: number }) => 0.16 + Math.min(1, d.count * 0.05)))
        .arcDashLength(0.4)
        .arcDashGap(0.22)
        .arcDashAnimateTime(1900)
        .arcLabel(
          acc((d: { region: RegionInfo; count: number }) => `${d.region.name} · ${d.count}`)
        )
        .ringLat(acc((d: BucketPoint) => d.lat))
        .ringLng(acc((d: BucketPoint) => d.lng))
        .ringColor(
          acc((d: BucketPoint) => (d.isHome ? 'rgba(125,211,252,0.75)' : 'rgba(96,165,250,0.5)'))
        )
        .ringMaxRadius(
          acc((d: BucketPoint) => (d.isHome ? 4.4 : 2.2 + Math.min(2, d.count * 0.14)))
        )
        .ringPropagationSpeed(acc((d: BucketPoint) => (d.isHome ? 1 : 1.7)))
        .ringRepeatPeriod(acc((d: BucketPoint) => (d.isHome ? 1800 : 1500)))
        .pathsData(ORBITS)
        .pathPoints(acc((d: OrbitRing) => d.points))
        .pathPointLat(acc((p: { lat: number }) => p.lat))
        .pathPointLng(acc((p: { lng: number }) => p.lng))
        .pathPointAlt(acc(() => 0.014))
        .pathColor(acc((d: OrbitRing) => [d.color, d.color]))
        .pathStroke(acc(() => 0.3))
        .pathDashLength(0.28)
        .pathDashGap(0.22)
        .pathDashAnimateTime(9000)
        .pathTransitionDuration(0)

      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.4
      globe.pointOfView({ lat: 26, lng: 106, altitude: 1.7 }, 0)
      applyBuckets(globe)
      globeRef.current = globe

      // 画布尺寸必须跟着容器走：窗口最大化/还原、侧栏断点换列都会改变容器大小，
      // 只按创建时尺寸渲染会让球心停在旧位置上，看起来就是「地球没居中」。
      const syncSize = (): void => {
        const g = globeRef.current
        if (!g) return
        const width = el.clientWidth
        const height = el.clientHeight
        if (width > 0 && height > 0) g.width(width).height(height)
      }
      observer = new ResizeObserver(syncSize)
      observer.observe(el)
      syncSize()

      fetch(countriesUrl)
        .then((r) => r.json())
        .then((data) => {
          if (!disposed && globe && data?.features) {
            globe.polygonsData(data.features)
          }
        })
        .catch(() => {})
    })

    return (): void => {
      disposed = true
      observer?.disconnect()
      globe?._destructor()
      globe = null
      globeRef.current = null
      el.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 数据变化只热更新图层数据，WebGL 场景保持稳定
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const buckets: { region: RegionInfo; count: number }[] = []
    activeByIso.forEach((count, iso) => {
      const region = getRegionByIso(iso)
      if (region) buckets.push({ region, count })
    })
    const points: BucketPoint[] = buckets.map(({ region, count }) => ({
      lat: region.lat,
      lng: region.lng,
      name: region.name,
      count
    }))
    points.push({
      lat: HOME.lat,
      lng: HOME.lng,
      name: t('proxies.globe.home'),
      count: 1,
      isHome: true
    })
    globe.pointsData(points)
    globe.arcsData(buckets)
    globe.ringsData(points)
  }, [activeByIso, t])

  return (
    // 外层 flex 居中 + 正方形视口：无论窗口多宽，球心都落在中列正中
    <div className="flex h-full w-full items-center justify-center">
      <div ref={containerRef} className="relative aspect-square h-full max-h-full max-w-full" />
    </div>
  )
}

const LiveGlobe = memo(LiveGlobeBase)
LiveGlobe.displayName = 'LiveGlobe'

export default LiveGlobe
