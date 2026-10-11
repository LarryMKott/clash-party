import React, { memo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fireConfetti } from '@renderer/utils/confetti'
import { toast } from '@renderer/components/base/toast'
import { calcTraffic } from '@renderer/utils/calc'

// 会话累计流量里程碑（字节）：跨档即全屏撒花，每档只庆祝一次
const MILESTONES = [
  100 * 1024 * 1024,
  500 * 1024 * 1024,
  1024 * 1024 * 1024,
  2 * 1024 * 1024 * 1024,
  5 * 1024 * 1024 * 1024,
  10 * 1024 * 1024 * 1024
]

const SESSION_KEY = 'milestone-celebrated'

const MilestoneCelebrationBase: React.FC = () => {
  const { t } = useTranslation()

  useEffect(() => {
    let bytes = 0
    let lastTick = performance.now()
    let nextIndex = 0
    // 恢复本会话已庆祝的档位（页面刷新不重复庆祝）
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) nextIndex = MILESTONES.filter((m) => m <= Number(saved)).length
    } catch {
      // sessionStorage 不可用时从零开始，最多多庆祝一次
    }

    const onTraffic = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as { up: number; down: number }
      const now = performance.now()
      const dt = Math.min(5, (now - lastTick) / 1000)
      lastTick = now
      bytes += ((info.up ?? 0) + (info.down ?? 0)) * dt

      while (nextIndex < MILESTONES.length && bytes >= MILESTONES[nextIndex]) {
        const milestone = MILESTONES[nextIndex]
        nextIndex += 1
        try {
          sessionStorage.setItem(SESSION_KEY, String(milestone))
        } catch {
          // 同上，无法持久化也不影响庆祝
        }
        fireConfetti(0.5, 0.4)
        setTimeout(() => fireConfetti(0.25, 0.35, 100), 350)
        setTimeout(() => fireConfetti(0.75, 0.35, 100), 550)
        toast.success(t('milestone.reached', { traffic: calcTraffic(milestone) }))
      }
    }
    return window.electron.ipcRenderer.on('mihomoTraffic', onTraffic)
  }, [t])

  return null
}

const MilestoneCelebration = memo(MilestoneCelebrationBase)
MilestoneCelebration.displayName = 'MilestoneCelebration'

export default MilestoneCelebration
