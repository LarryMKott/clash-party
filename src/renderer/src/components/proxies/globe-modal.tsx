import React, { memo, useEffect, useMemo, useRef } from 'react'
import type { GlobeInstance } from 'globe.gl'
import { Button } from '@heroui/react'
import { IoCloseOutline } from 'react-icons/io5'
import { useTranslation } from 'react-i18next'
import { resolveRegion, type RegionInfo } from '@renderer/utils/region'

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
}

// 本机位置的装饰性原点
const HOME = { lat: 32, lng: 106 }

function delayToColor(delay: number): string {
  if (delay <= 0) return '#60a5fa'
  if (delay < 300) return '#34d399'
  if (delay < 800) return '#fbbf24'
  return '#f87171'
}

interface Props {
  nodes: GlobeNode[]
  onClose: () => void
}

// globe.gl 的访问器参数类型是 object，包一层收窄回 GlobePoint
function acc<Out>(fn: (d: GlobePoint) => Out): (obj: object) => Out {
  return (obj) => fn(obj as GlobePoint)
}

const GlobeModalBase: React.FC<Props> = ({ nodes, onClose }) => {
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
    return Array.from(regions.values()).map(({ region, delays }) => {
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
  }, [nodes])

  const resolvedCount = useMemo(() => points.reduce((sum, p) => sum + p.count, 0), [points])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let disposed = false
    let globe: GlobeInstance | null = null
    let cancelled = false
    import('globe.gl').then(({ default: Globe }) => {
      if (disposed || cancelled) return
      globe = new Globe(el, { animateIn: true })
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#4f7cff')
        .atmosphereAltitude(0.16)
        .pointsData(points)
        .pointLat(acc((d) => d.lat))
        .pointLng(acc((d) => d.lng))
        .pointColor(acc((d) => delayToColor(d.delay)))
        .pointAltitude(acc((d) => 0.012 + Math.min(0.1, d.count * 0.008)))
        .pointRadius(acc((d) => 0.3 + Math.min(1.1, d.count * 0.06)))
        .pointsMerge(false)
        .arcsData(points.map((p) => ({ ...p })))
        .arcStartLat(() => HOME.lat)
        .arcStartLng(() => HOME.lng)
        .arcEndLat(acc((d) => d.lat))
        .arcEndLng(acc((d) => d.lng))
        .arcColor(acc((d) => ['#4f7cff', delayToColor(d.delay)]))
        .arcAltitude(acc((d) => 0.12 + Math.min(0.28, d.count * 0.018)))
        .arcStroke(acc((d) => 0.18 + Math.min(0.9, d.count * 0.04)))
        .arcDashLength(0.35)
        .arcDashGap(0.2)
        .arcDashAnimateTime(2200)
        .arcLabel(acc((d) => `${d.name} · ${d.count}`))
      globe.controls().autoRotate = true
      globe.controls().autoRotateSpeed = 0.65
      globe.pointOfView({ lat: HOME.lat, lng: HOME.lng, altitude: 1.85 }, 0)
    })
    return (): void => {
      disposed = true
      cancelled = true
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
        className="relative flex flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-content1 shadow-2xl"
        style={{ width: 'min(960px, 94vw)', height: 'min(660px, 86vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
          <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white backdrop-blur-md">
            <div className="text-sm font-semibold">{t('proxies.globe.title')}</div>
            <div className="text-xs text-white/60">
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
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{
            background:
              'radial-gradient(ellipse at 50% 120%, rgba(79,124,255,0.22), transparent 55%), #05070f'
          }}
        />
      </div>
    </div>
  )
}

const GlobeModal = memo(GlobeModalBase)
GlobeModal.displayName = 'GlobeModal'

export default GlobeModal
