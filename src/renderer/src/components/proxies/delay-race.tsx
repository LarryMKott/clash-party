import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface RaceNode {
  name: string
  delay: number
}

interface Props {
  groupName: string
  nodes: RaceNode[]
  onClose: () => void
}

const MAX_RACERS = 12
const TICK_MS = 800
const MEDALS = ['🥇', '🥈', '🥉']

// 延迟排位赛：以真实测速延迟为起点的波动模拟，低延迟节点保持领先，
// 纯观赏用。motion layout 负责名次交换时的平滑位移。
const DelayRaceBase: React.FC<Props> = ({ groupName, nodes, onClose }) => {
  const { t } = useTranslation()
  const seeded = useMemo(() => {
    return [...nodes]
      .filter((n) => n.delay > 0)
      .sort((a, b) => a.delay - b.delay)
      .slice(0, MAX_RACERS)
  }, [nodes])

  const baseRef = useRef<Map<string, number>>(new Map(seeded.map((n) => [n.name, n.delay])))
  const [values, setValues] = useState<Map<string, number>>(
    new Map(seeded.map((n) => [n.name, n.delay]))
  )

  // 波动模拟：围绕真实基准 ±25% 内随机游走
  useEffect(() => {
    if (seeded.length === 0) return
    const timer = window.setInterval(() => {
      setValues((prev) => {
        const next = new Map(prev)
        for (const node of seeded) {
          const base = baseRef.current.get(node.name) ?? node.delay
          const cur = prev.get(node.name) ?? base
          const drift = base * (Math.random() - 0.5) * 0.16
          const lo = base * 0.75
          const hi = base * 1.3
          next.set(node.name, Math.min(hi, Math.max(lo, cur + drift)))
        }
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [seeded])

  const ranked = useMemo(() => {
    const maxDelay = Math.max(100, ...Array.from(values.values()))
    return seeded
      .map((n) => {
        const delay = values.get(n.name) ?? n.delay
        const length = Math.max(4, ((maxDelay - delay) / maxDelay) * 100)
        return { name: n.name, delay: Math.round(delay), length }
      })
      .sort((a, b) => b.length - a.length)
  }, [values, seeded])

  const barColor = (delay: number): string => {
    if (delay < 300) return '#34d399'
    if (delay < 800) return '#fbbf24'
    return '#f87171'
  }

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="relative w-[min(560px,94vw)] overflow-hidden rounded-2xl border border-white/10 bg-content1 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-center text-xs tracking-[0.3em] text-foreground/45">
          {t('proxies.race.title')}
        </div>
        <div className="mb-4 truncate text-center text-sm font-semibold text-foreground/85">
          {groupName}
        </div>
        <div className="flex flex-col gap-1.5">
          {ranked.map((r, i) => (
            <motion.div
              key={r.name}
              layout
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="flex items-center gap-2"
            >
              <span className="w-6 shrink-0 text-center text-sm">{MEDALS[i] ?? `${i + 1}`}</span>
              <span className="w-28 shrink-0 truncate text-[11px] text-foreground/70">
                {r.name}
              </span>
              <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-md bg-default-100">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    background: `linear-gradient(to right, ${barColor(r.delay)}66, ${barColor(r.delay)})`,
                    boxShadow: i === 0 ? `0 0 12px ${barColor(r.delay)}88` : undefined
                  }}
                  animate={{ width: `${r.length}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 24 }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/60">
                {r.delay}ms
              </span>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 text-center text-[11px] text-foreground/35">
          {t('proxies.race.note')}
        </div>
      </motion.div>
    </div>
  )
}

const DelayRace = memo(DelayRaceBase)
DelayRace.displayName = 'DelayRace'

export default DelayRace
