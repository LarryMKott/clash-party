import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface Props {
  onDone: () => void
}

const DURATION = 1450
const HOLD = 260

const STEP_KEYS = [
  'warroom.boot.l1',
  'warroom.boot.l2',
  'warroom.boot.l3',
  'warroom.boot.l4',
  'warroom.boot.l5'
]

const BootSequenceBase: React.FC<Props> = ({ onDone }) => {
  const { t } = useTranslation()
  const [progress, setProgress] = useState(0)
  const finishedRef = useRef(false)

  const finish = useCallback((): void => {
    if (finishedRef.current) return
    finishedRef.current = true
    onDone()
  }, [onDone])

  // 进度条驱动：走完即移交控制权
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    let holdTimer = 0
    const tick = (now: number): void => {
      const p = Math.min(100, ((now - start) / DURATION) * 100)
      setProgress(p)
      if (p >= 100) {
        holdTimer = window.setTimeout(finish, HOLD)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return (): void => {
      cancelAnimationFrame(raf)
      clearTimeout(holdTimer)
    }
  }, [finish])

  // 点击 / 任意按键跳过自检
  useEffect(() => {
    const skip = (): void => finish()
    window.addEventListener('keydown', skip)
    window.addEventListener('mousedown', skip)
    return (): void => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('mousedown', skip)
    }
  }, [finish])

  const revealed = Math.min(STEP_KEYS.length, Math.floor((progress / 100) * (STEP_KEYS.length + 1)))

  return (
    <motion.div
      className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-[#04060d]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
      onClick={finish}
    >
      {/* 自检期间保留极淡的网格氛围 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(96,160,255,0.05) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(96,160,255,0.05) 1px, transparent 1px)'
          ].join(','),
          backgroundSize: '48px 48px, 48px 48px'
        }}
      />

      <div className="relative w-[560px] max-w-[82%]">
        <div className="flex items-baseline justify-between font-mono text-[11px] tracking-[0.3em] text-[#7dd3fc]">
          <span>{t('warroom.boot.title')}</span>
          <span className="tabular-nums text-[#9fc4ff]/80">{Math.round(progress)}%</span>
        </div>

        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg,#2f5bff,#60a5fa,#7dd3fc)',
              boxShadow: '0 0 14px rgba(96,165,250,0.85)'
            }}
          />
        </div>

        <div className="mt-5 min-h-[124px] space-y-1.5 font-mono text-[12px] leading-5">
          {STEP_KEYS.slice(0, revealed).map((key, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: Math.max(0, (i - 1) * 0.03) }}
              className="flex items-center gap-2"
            >
              <span style={{ color: '#3f6dff' }}>›</span>
              <span style={{ color: 'rgba(190,215,255,0.82)' }}>{t(key)}</span>
              <span className="flex-1 overflow-hidden">
                <span
                  className="inline-block h-px w-full align-middle"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, rgba(96,160,255,0.35) 0 2px, transparent 2px 6px)'
                  }}
                />
              </span>
              <span style={{ color: '#34d399' }}>OK</span>
            </motion.div>
          ))}
          {revealed >= STEP_KEYS.length ? (
            <div
              className="pt-1 font-mono text-[11px] tracking-[0.25em]"
              style={{ color: '#7dd3fc' }}
            >
              {t('warroom.boot.ready')}
            </div>
          ) : (
            <span
              className="inline-block h-3.5 w-2 align-middle"
              style={{
                background: '#7dd3fc',
                animation: 'warroom-caret 1s steps(1, end) infinite'
              }}
            />
          )}
        </div>

        <div
          className="mt-4 text-center font-mono text-[10px] tracking-[0.3em]"
          style={{ color: 'rgba(125,211,252,0.32)' }}
        >
          {t('warroom.boot.hint')}
        </div>
      </div>
    </motion.div>
  )
}

const BootSequence = memo(BootSequenceBase)
BootSequence.displayName = 'BootSequence'

export default BootSequence
