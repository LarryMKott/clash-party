import React, { memo, useEffect, useRef } from 'react'

// 流量等级 → 边缘光颜色（空闲呼吸蓝 → 下载狂飙红色脉冲）
const LEVELS = [
  { max: 256 * 1024, color: '96,165,250', speed: 0.7, base: 0.16, amp: 0.1 },
  { max: 2 * 1024 * 1024, color: '56,189,248', speed: 1.1, base: 0.26, amp: 0.16 },
  { max: 8 * 1024 * 1024, color: '251,191,36', speed: 1.8, base: 0.34, amp: 0.2 },
  { max: Infinity, color: '248,113,113', speed: 3.2, base: 0.4, amp: 0.28 }
]

const THICKNESS = 42

const AmbientLightBase: React.FC = () => {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const edges = [
      { el: topRef.current, phase: 0, axis: 'y' as const },
      { el: bottomRef.current, phase: Math.PI, axis: 'y' as const },
      { el: leftRef.current, phase: Math.PI / 2, axis: 'x' as const },
      { el: rightRef.current, phase: -Math.PI / 2, axis: 'x' as const }
    ].filter((e) => e.el)

    let raf = 0
    let levelIndex = 0
    let levelBlend = 0
    let lastTraffic = 0

    const onTraffic = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as { up: number; down: number }
      lastTraffic = (info.up ?? 0) + (info.down ?? 0)
    }
    const unsub = window.electron.ipcRenderer.on('mihomoTraffic', onTraffic)

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const time = now / 1000
      const target = LEVELS.findIndex((l) => lastTraffic <= l.max)
      // 平滑过渡颜色等级，避免跳变
      levelBlend += (1 - levelBlend) * 0.06
      if (target !== levelIndex) {
        levelIndex = levelBlend > 0.95 ? target : levelIndex
      }
      const level = LEVELS[levelIndex]
      const pulse = level.base + level.amp * (0.5 + 0.5 * Math.sin(time * level.speed * Math.PI))

      for (const edge of edges) {
        const el = edge.el
        if (!el) continue
        el.style.opacity = pulse.toFixed(3)
        const c = level.color
        el.style.background =
          edge.axis === 'y'
            ? `linear-gradient(to bottom, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
            : `linear-gradient(to right, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      }
      // 对边用反向渐变
      if (edges[1].el) {
        const c = level.color
        edges[1].el.style.background = `linear-gradient(to top, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      }
      if (edges[3].el) {
        const c = level.color
        edges[3].el.style.background = `linear-gradient(to left, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [])

  return (
    <>
      <div
        ref={topRef}
        className="pointer-events-none fixed left-0 right-0 top-0 z-[60]"
        style={{ height: THICKNESS, opacity: 0 }}
      />
      <div
        ref={bottomRef}
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60]"
        style={{ height: THICKNESS, opacity: 0 }}
      />
      <div
        ref={leftRef}
        className="pointer-events-none fixed bottom-0 left-0 top-0 z-[60]"
        style={{ width: THICKNESS, opacity: 0 }}
      />
      <div
        ref={rightRef}
        className="pointer-events-none fixed bottom-0 right-0 top-0 z-[60]"
        style={{ width: THICKNESS, opacity: 0 }}
      />
    </>
  )
}

const AmbientLight = memo(AmbientLightBase)
AmbientLight.displayName = 'AmbientLight'

export default AmbientLight
