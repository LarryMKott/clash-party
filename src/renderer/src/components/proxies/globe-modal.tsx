import React, { memo, useEffect, useMemo, useRef } from 'react'
import type { GlobeInstance } from 'globe.gl'
import { Button } from '@heroui/react'
import { IoCloseOutline } from 'react-icons/io5'
import { useTranslation } from 'react-i18next'
import { resolveRegion, type RegionInfo } from '@renderer/utils/region'
import countriesUrl from '@renderer/assets/geo/countries-110m.json?url'

interface GlobeNode {
  name: string
  delay: number
}

interface GlobePoint {
  lat: number
  lng: number
  name: string
  count: number
  delay: number
  isHome?: boolean
}

// 本机位置的装饰性原点
const HOME = { lat: 32, lng: 106 }

// globe.gl 访问器参数类型是 object，包一层收窄回具体数据类型
function acc<T, Out>(fn: (d: T) => Out): (obj: object) => Out {
  return (obj) => fn(obj as T)
}

function delayToColor(delay: number): string {
  if (delay <= 0) return '#60a5fa'
  if (delay < 300) return '#34d399'
  if (delay < 800) return '#fbbf24'
  return '#f87171'
}

function delayToGlow(delay: number): string {
  if (delay <= 0) return 'rgba(96,165,250,0.55)'
  if (delay < 300) return 'rgba(52,211,153,0.55)'
  if (delay < 800) return 'rgba(251,191,36,0.55)'
  return 'rgba(248,113,113,0.55)'
}

// 多层平铺星点 + 底部星云辉光的纯 CSS 星空
const STARFIELD = {
  backgroundColor: '#04060d',
  backgroundImage: [
    'radial-gradient(1px 1px at 22% 28%, rgba(255,255,255,0.7) 50%, transparent 51%)',
    'radial-gradient(1px 1px at 68% 12%, rgba(255,255,255,0.5) 50%, transparent 51%)',
    'radial-gradient(1.5px 1.5px at 44% 64%, rgba(190,215,255,0.6) 50%, transparent 51%)',
    'radial-gradient(1px 1px at 86% 78%, rgba(255,255,255,0.45) 50%, transparent 51%)',
    'radial-gradient(1px 1px at 8% 82%, rgba(160,190,255,0.5) 50%, transparent 51%)',
    'radial-gradient(ellipse at 50% 135%, rgba(64,110,255,0.22), transparent 62%)'
  ].join(','),
  backgroundSize: '260px 260px, 340px 340px, 420px 420px, 500px 500px, 560px 560px, 100% 100%'
}

const GlobeModalBase: React.FC<{
  nodes: GlobeNode[]
  onClose: () => void
}> = ({ nodes, onClose }) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  const points = useMemo<GlobePoint[]>(() => {
    const regions = new Map<string, { region: RegionInfo; delays: number[] }>()
    for (const node of nodes) {
      const region = resolveRegion(node.name)
      if (!region) continue
      const entry = regions.get(region.iso)
      if (entry) {
        entry.delays.push(node.delay)
      } else {
        regions.set(region.iso, { region, delays: [node.delay] })
      }
    }
    const list: GlobePoint[] = Array.from(regions.values()).map(({ region, delays }) => {
      const valid = delays.filter((d) => d > 0)
      const avg = valid.length > 0 ? valid.reduce((s, d) => s + d, 0) / valid.length : 0
      return {
        lat: region.lat,
        lng: region.lng,
        name: region.name,
        count: delays.length,
        delay: Math.round(avg)
      }
    })
    list.push({
      lat: HOME.lat,
      lng: HOME.lng,
      name: t('proxies.globe.home'),
      count: 1,
      delay: 0,
      isHome: true
    })
    return list
  }, [nodes, t])

  const resolvedCount = useMemo(
    () => points.reduce((sum, p) => sum + (p.isHome ? 0 : p.count), 0),
    [points]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let disposed = false
    let globe: GlobeInstance | null = null
    let flyTimer: ReturnType<typeof setTimeout> | null = null

    import('globe.gl').then(({ default: Globe }) => {
      if (disposed) return
      globe = new Globe(el, { animateIn: true })
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#3d7bff')
        .atmosphereAltitude(0.18)
        // 精细地图：真实国界线 + 经纬网格
        .polygonsData([])
        .polygonCapColor(() => 'rgba(12,32,72,0.32)')
        .polygonSideColor(() => 'rgba(40,100,220,0.08)')
        .polygonStrokeColor(() => 'rgba(96,160,255,0.6)')
        .polygonAltitude(0.006)
        .showGraticules(true)
        // 节点光柱
        .pointsData(points)
        .pointLat(acc((d: GlobePoint) => d.lat))
        .pointLng(acc((d: GlobePoint) => d.lng))
        .pointColor(acc((d: GlobePoint) => (d.isHome ? '#7dd3fc' : delayToColor(d.delay))))
        .pointAltitude(
          acc((d: GlobePoint) => (d.isHome ? 0.02 : 0.012 + Math.min(0.1, d.count * 0.008)))
        )
        .pointRadius(
          acc((d: GlobePoint) => (d.isHome ? 0.32 : 0.3 + Math.min(1.1, d.count * 0.06)))
        )
        .pointsMerge(false)
        .pointLabel(
          acc((d: GlobePoint) =>
            d.isHome
              ? `<div style="background:rgba(5,10,25,0.85);border:1px solid rgba(96,160,255,0.4);border-radius:6px;padding:4px 8px;color:#cfe4ff">${d.name}</div>`
              : `<div style="background:rgba(5,10,25,0.85);border:1px solid rgba(96,160,255,0.4);border-radius:6px;padding:4px 8px;color:#cfe4ff">${d.name} · ${d.count} · ${d.delay > 0 ? d.delay + 'ms' : '-'}</div>`
          )
        )
        // 本机 → 各地区的流动弧线
        .arcsData(points.filter((p) => !p.isHome))
        .arcStartLat(() => HOME.lat)
        .arcStartLng(() => HOME.lng)
        .arcEndLat(acc((d: GlobePoint) => d.lat))
        .arcEndLng(acc((d: GlobePoint) => d.lng))
        .arcColor(acc((d: GlobePoint) => ['rgba(79,124,255,0.15)', delayToGlow(d.delay)]))
        .arcAltitude(acc((d: GlobePoint) => 0.12 + Math.min(0.28, d.count * 0.018)))
        .arcStroke(acc((d: GlobePoint) => 0.18 + Math.min(0.9, d.count * 0.04)))
        .arcDashLength(0.4)
        .arcDashGap(0.25)
        .arcDashAnimateTime(acc((d: GlobePoint) => 1800 + ((d.count * 370) % 1200)))
        .arcLabel(acc((d: GlobePoint) => `${d.name} · ${d.count}`))
        // 地区脉冲光环
        .ringsData(points)
        .ringLat(acc((d: GlobePoint) => d.lat))
        .ringLng(acc((d: GlobePoint) => d.lng))
        .ringColor(
          acc((d: GlobePoint) => (d.isHome ? 'rgba(125,211,252,0.8)' : delayToGlow(d.delay)))
        )
        .ringMaxRadius(acc((d: GlobePoint) => (d.isHome ? 5 : 2.6 + Math.min(2.4, d.count * 0.18))))
        .ringPropagationSpeed(acc((d: GlobePoint) => (d.isHome ? 1.1 : 1.8)))
        .ringRepeatPeriod(acc((d: GlobePoint) => (d.isHome ? 1800 : 1500)))

      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.6
      globe.pointOfView({ lat: 6, lng: 150, altitude: 3.1 }, 0)
      flyTimer = setTimeout(() => {
        if (!disposed && globe) {
          globe.pointOfView({ lat: 26, lng: 106, altitude: 1.6 }, 2400)
        }
      }, 350)

      // 国界 GeoJSON 异步加载（静态资源，体积约 250KB）
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
      if (flyTimer) clearTimeout(flyTimer)
      globe?._destructor()
      globe = null
      el.innerHTML = ''
    }
    // points 仅在弹窗打开期间由父级一次性传入，无需随节点抖动重建 WebGL 场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl border border-foreground/10 shadow-2xl"
        style={{ width: 'min(1720px, 96vw)', height: 'min(940px, 92vh)', ...STARFIELD }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部信息栏 */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
          <div
            className="rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white backdrop-blur-md"
            style={{ boxShadow: '0 0 24px rgba(64,110,255,0.25)' }}
          >
            <div className="text-base font-semibold tracking-wide">{t('proxies.globe.title')}</div>
            <div className="mt-0.5 text-xs text-white/60">
              {resolvedCount} / {nodes.length}
            </div>
          </div>
          <div className="pointer-events-auto">
            <Button
              isIconOnly
              size="sm"
              variant="flat"
              radius="full"
              className="bg-black/40 text-white"
              onPress={onClose}
              title={t('common.close')}
            >
              <IoCloseOutline className="text-xl" />
            </Button>
          </div>
        </div>

        {/* 底部图例 */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex justify-center p-4">
          <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/40 px-5 py-2 text-xs text-white/75 backdrop-blur-md">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#34d399' }} />
              &lt;300ms
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#fbbf24' }} />
              300-800ms
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#f87171' }} />
              &gt;800ms
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#60a5fa' }} />
              {t('proxies.globe.untested')}
            </span>
            <span className="text-white/30">|</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: '#7dd3fc' }} />
              {t('proxies.globe.home')}
            </span>
            <span className="text-white/30">|</span>
            <span className="text-white/50">{t('proxies.globe.legend')}</span>
          </div>
        </div>

        <div ref={containerRef} className="h-full w-full" />

        {/* 边缘暗角，聚焦球体 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 140px rgba(2,4,12,0.75)' }}
        />
      </div>
    </div>
  )
}

const GlobeModal = memo(GlobeModalBase)
GlobeModal.displayName = 'GlobeModal'

export default GlobeModal
