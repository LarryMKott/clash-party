import React, { memo, useEffect, useRef } from 'react'

// 边缘氛围灯：上下边由下行驱动（蓝色系），左右边由上行驱动（绿色系），
// 各自独立四级变色 + 正弦呼吸；空闲时统一慢呼吸。
interface Level {
  max: number
  color: string
  speed: number
  base: number
  amp: number
}

const DOWN_LEVELS: Level[] = [
  { max: 256 * 1024, color: '96,165,250', speed: 0.7, base: 0.16, amp: 0.1 },
  { max: 2 * 1024 * 1024, color: '56,189,248', speed: 1.1, base: 0.26, amp: 0.16 },
  { max: 8 * 1024 * 1024, color: '125,211,252', speed: 1.8, base: 0.34, amp: 0.2 },
  { max: Infinity, color: '96,165,250', speed: 3.2, base: 0.42, amp: 0.3 }
]

const UP_LEVELS: Level[] = [
  { max: 128 * 1024, color: '110,231,183', speed: 0.7, base: 0.14, amp: 0.09 },
  { max: 1024 * 1024, color: '52,211,153', speed: 1.1, base: 0.24, amp: 0.15 },
  { max: 6 * 1024 * 1024, color: '167,243,208', speed: 1.8, base: 0.32, amp: 0.19 },
  { max: Infinity, color: '52,211,153', speed: 3.2, base: 0.4, amp: 0.28 }
]

const THICKNESS = 42

const AmbientLightBase: React.FC = () => {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastTraffic = { up: 0, down: 0 }

    const onTraffic = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as { up: number; down: number }
      lastTraffic = { up: info.up ?? 0, down: info.down ?? 0 }
    }
    const unsub = window.electron.ipcRenderer.on('mihomoTraffic', onTraffic)

    const pickLevel = (levels: Level[], traffic: number): Level => {
      for (const level of levels) {
        if (traffic <= level.max) return level
      }
      return levels[levels.length - 1]
    }

    const paint = (
      el: HTMLDivElement | null,
      level: Level,
      phase: number,
      time: number,
      gradient: (c: string) => string
    ): void => {
      if (!el) return
      const pulse =
        level.base + level.amp * (0.5 + 0.5 * Math.sin(time * level.speed * Math.PI + phase))
      el.style.opacity = pulse.toFixed(3)
      el.style.background = gradient(level.color)
    }

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const time = now / 1000
      const down = pickLevel(DOWN_LEVELS, lastTraffic.down)
      const up = pickLevel(UP_LEVELS, lastTraffic.up)

      // 上下边：下行（蓝色系），相位相对；左右边：上行（绿色系）
      paint(
        topRef.current,
        down,
        0,
        time,
        (c) => `linear-gradient(to bottom, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      )
      paint(
        bottomRef.current,
        down,
        Math.PI,
        time,
        (c) => `linear-gradient(to top, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      )
      paint(
        leftRef.current,
        up,
        Math.PI / 2,
        time,
        (c) => `linear-gradient(to right, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      )
      paint(
        rightRef.current,
        up,
        -Math.PI / 2,
        time,
        (c) => `linear-gradient(to left, rgba(${c},0.5), rgba(${c},0.12) 55%, transparent)`
      )
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
