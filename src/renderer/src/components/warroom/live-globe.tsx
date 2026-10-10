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

// 本机位置的装饰性原点（与星图保持一致）
const HOME = { lat: 32, lng: 106 }

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

      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.4
      globe.pointOfView({ lat: 26, lng: 106, altitude: 1.7 }, 0)
      applyBuckets(globe)
      globeRef.current = globe

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

  return <div ref={containerRef} className="h-full w-full" />
}

const LiveGlobe = memo(LiveGlobeBase)
LiveGlobe.displayName = 'LiveGlobe'

export default LiveGlobe
