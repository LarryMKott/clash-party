import React, { memo, useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { getRegionByIso } from '@renderer/utils/region'

interface Props {
  /** 活跃目的地聚合：iso → 连接数 */
  activeByIso: Map<string, number>
}

const MAX_ROWS = 5

function isoToEmoji(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

// 活跃地区 TOP 榜：地球光柱的文字对应版，连接越多条形越长
const RegionTopsBase: React.FC<Props> = ({ activeByIso }) => {
  const { t } = useTranslation()

  const rows = useMemo(() => {
    const list: { iso: string; count: number }[] = []
    activeByIso.forEach((count, iso) => {
      if (getRegionByIso(iso)) list.push({ iso, count })
    })
    list.sort((a, b) => b.count - a.count)
    return {
      top: list.slice(0, MAX_ROWS),
      max: Math.max(1, list[0]?.count ?? 1),
      hidden: list.length - Math.min(MAX_ROWS, list.length)
    }
  }, [activeByIso])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-1 pb-1">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.top.map(({ iso, count }) => {
          const region = getRegionByIso(iso)
          return (
            <motion.div
              key={iso}
              layout
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="shrink-0"
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="flag-emoji w-5 shrink-0 text-center text-[13px] leading-none">
                  {isoToEmoji(iso)}
                </span>
                <span className="w-11 shrink-0 truncate text-foreground/70">
                  {region?.name ?? iso}
                </span>
                <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      background:
                        'linear-gradient(to right, rgba(59,130,246,0.55), rgba(125,211,252,0.95))',
                      boxShadow: '0 0 8px rgba(96,165,250,0.4)'
                    }}
                    initial={false}
                    animate={{ width: `${(count / rows.max) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono tabular-nums text-foreground/60">
                  {count}
                </span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
      {rows.top.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-[11px] text-foreground/30">
          {t('warroom.waiting')}
        </div>
      )}
      {rows.hidden > 0 && (
        <span className="shrink-0 text-right text-[10px] text-foreground/35">+{rows.hidden}</span>
      )}
    </div>
  )
}

const RegionTops = memo(RegionTopsBase)
RegionTops.displayName = 'RegionTops'

export default RegionTops
