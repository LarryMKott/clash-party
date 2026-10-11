import React, { memo, useMemo } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { extractFlag, getRegionByIso } from '@renderer/utils/region'

interface Props {
  names: string[]
}

const MAX_FLAGS = 5

interface RibbonEntry {
  iso: string
  emoji: string
  count: number
}

// 组卡片上的国旗占比丝带：按节点名中的国旗 emoji 聚合，展示前几名
const FlagRibbonBase: React.FC<Props> = ({ names }) => {
  const { t } = useTranslation()

  const top = useMemo(() => {
    const counts = new Map<string, { emoji: string; count: number }>()
    for (const name of names) {
      const flag = extractFlag(name)
      if (!flag) continue
      const entry = counts.get(flag.iso)
      if (entry) {
        entry.count += 1
      } else {
        counts.set(flag.iso, { emoji: flag.emoji, count: 1 })
      }
    }
    const list: RibbonEntry[] = Array.from(counts.entries())
      .map(([iso, { emoji, count }]) => ({ iso, emoji, count }))
      .sort((a, b) => b.count - a.count)
    const total = list.reduce((s, e) => s + e.count, 0)
    return { list: list.slice(0, MAX_FLAGS), rest: list.length - MAX_FLAGS, total }
  }, [names])

  if (top.list.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        className="flex items-center gap-1"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {top.list.map(({ iso, emoji, count }) => (
          <motion.span
            key={iso}
            variants={{
              hidden: { opacity: 0, y: 6, scale: 0.6 },
              show: { opacity: 1, y: 0, scale: 1 }
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 20 }}
            className="flex items-center gap-0.5 rounded-md bg-default-100 px-1 text-[11px] leading-4"
            title={t('proxies.ribbon.tooltip', {
              region: getRegionByIso(iso)?.name ?? iso,
              count
            })}
          >
            <span className="flag-emoji">{emoji}</span>
            <span className="text-foreground/45">{count}</span>
          </motion.span>
        ))}
      </motion.div>
      {top.rest > 0 && (
        <span className="text-[10px] text-foreground/35" title={String(top.total)}>
          +{top.rest}
        </span>
      )}
    </div>
  )
}

const FlagRibbon = memo(FlagRibbonBase)
FlagRibbon.displayName = 'FlagRibbon'

export default FlagRibbon
