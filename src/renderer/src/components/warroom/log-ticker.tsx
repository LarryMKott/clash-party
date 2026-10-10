import React, { memo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface Props {
  log: IMihomoLogInfo | null
}

const typeColor: Record<string, string> = {
  error: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',
  debug: 'rgba(160,180,200,0.7)'
}

const LogTickerBase: React.FC<Props> = ({ log }) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/5 bg-black/30 px-4 py-2 backdrop-blur-md">
      <span className="shrink-0 text-[11px] tracking-[0.25em] text-foreground/45">
        {t('warroom.log')}
      </span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background: log ? (typeColor[log.type] ?? '#60a5fa') : 'rgba(96,165,250,0.4)',
          boxShadow: log ? `0 0 8px ${typeColor[log.type] ?? '#60a5fa'}` : undefined
        }}
      />
      <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-foreground/70">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={log ? `${log.time}-${log.payload}` : 'idle'}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {log ? (
              <>
                <span className="text-foreground/40">[{log.type.toUpperCase()}]</span> {log.payload}
              </>
            ) : (
              <span className="text-foreground/30">{t('warroom.waiting')}</span>
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

const LogTicker = memo(LogTickerBase)
LogTicker.displayName = 'LogTicker'

export default LogTicker
