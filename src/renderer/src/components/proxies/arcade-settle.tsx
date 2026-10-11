import React, { memo } from 'react'
import { motion } from 'motion/react'
import { Switch } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { calcTraffic } from '@renderer/utils/calc'
import { isArcadeSoundEnabled, setArcadeSoundEnabled } from '@renderer/utils/arcade-audio'

export interface ArcadeSettleData {
  groupName: string
  total: number
  hits: number
  maxCombo: number
  /** 命中节点的中位延迟（ms），无命中为 0 */
  medianDelay: number
  rating: 'S' | 'A' | 'B' | 'C'
}

const RATING_STYLE: Record<string, { color: string; glow: string }> = {
  S: { color: '#fbbf24', glow: 'rgba(251,191,36,0.55)' },
  A: { color: '#34d399', glow: 'rgba(52,211,153,0.5)' },
  B: { color: '#60a5fa', glow: 'rgba(96,165,250,0.45)' },
  C: { color: 'rgba(160,180,200,0.85)', glow: 'rgba(160,180,200,0.3)' }
}

interface Props {
  data: ArcadeSettleData
  onClose: () => void
}

const ArcadeSettleBase: React.FC<Props> = ({ data, onClose }) => {
  const { t } = useTranslation()
  const style = RATING_STYLE[data.rating]
  const survival = data.total > 0 ? Math.round((data.hits / data.total) * 100) : 0

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -3 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        className="relative w-[min(420px,92vw)] overflow-hidden rounded-2xl border border-white/10 bg-content1 p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* S 级金色扫光 */}
        {data.rating === 'S' && (
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ x: '-120%' }}
            animate={{ x: '120%' }}
            transition={{ duration: 1.2, delay: 0.3, ease: 'easeInOut' }}
            style={{
              background:
                'linear-gradient(105deg, transparent 40%, rgba(251,191,36,0.18) 50%, transparent 60%)'
            }}
          />
        )}
        <div className="text-xs tracking-[0.3em] text-foreground/45">
          {t('arcade.settle.title')}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-foreground/80">
          {data.groupName}
        </div>

        <motion.div
          className="my-3 text-[96px] font-black leading-none"
          style={{ color: style.color, textShadow: `0 0 42px ${style.glow}` }}
          initial={{ scale: 2.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }}
        >
          {data.rating}
        </motion.div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-default-100 px-2 py-2.5">
            <div className="text-lg font-bold">{survival}%</div>
            <div className="text-[11px] text-foreground/50">{t('arcade.settle.hits')}</div>
          </div>
          <div className="rounded-xl bg-default-100 px-2 py-2.5">
            <div className="text-lg font-bold">×{data.maxCombo}</div>
            <div className="text-[11px] text-foreground/50">{t('arcade.settle.maxCombo')}</div>
          </div>
          <div className="rounded-xl bg-default-100 px-2 py-2.5">
            <div className="text-lg font-bold">
              {data.medianDelay > 0 ? `${data.medianDelay}ms` : calcTraffic(0)}
            </div>
            <div className="text-[11px] text-foreground/50">{t('arcade.settle.median')}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-foreground/50">
          <Switch
            size="sm"
            defaultSelected={isArcadeSoundEnabled()}
            onValueChange={(v) => setArcadeSoundEnabled(v)}
            aria-label={t('arcade.sound')}
          />
          {t('arcade.sound')}
        </div>
      </motion.div>
    </div>
  )
}

const ArcadeSettle = memo(ArcadeSettleBase)
ArcadeSettle.displayName = 'ArcadeSettle'

export default ArcadeSettle
