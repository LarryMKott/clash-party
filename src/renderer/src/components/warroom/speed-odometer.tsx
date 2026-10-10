import React, { memo, useMemo } from 'react'
import { motion } from 'motion/react'

interface Props {
  /** 速率，字节/秒 */
  value: number
  label: string
  color: string
}

function formatSpeed(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) bytes = 0
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes
  let unit = 0
  while (v >= 1024 && unit < units.length - 1) {
    v /= 1024
    unit++
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[unit]}`
}

const DigitRoll: React.FC<{ char: string }> = ({ char }) => {
  const digit = Number(char)
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ width: '0.62em', height: '1.1em' }}
    >
      <motion.span
        className="absolute left-0 top-0 flex flex-col items-center leading-[1.1]"
        initial={false}
        animate={{ y: `-${digit}em` }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} style={{ height: '1.1em' }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

const SpeedOdometerBase: React.FC<Props> = ({ value, label, color }) => {
  const chars = useMemo(() => formatSpeed(value).split(''), [value])

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center text-[44px] font-bold tabular-nums leading-none"
        style={{ color, textShadow: `0 0 18px ${color}55` }}
      >
        {chars.map((ch, i) =>
          /\d/.test(ch) ? (
            <DigitRoll key={`${chars.length}-${i}`} char={ch} />
          ) : (
            <span
              key={`${chars.length}-${i}`}
              className="inline-block"
              style={{ width: ch === ' ' ? '0.3em' : undefined }}
            >
              {ch}
            </span>
          )
        )}
        <span className="ml-1 text-[18px] font-semibold opacity-80">/s</span>
      </div>
      <span className="text-xs tracking-[0.2em] text-foreground/50">{label}</span>
    </div>
  )
}

const SpeedOdometer = memo(SpeedOdometerBase)
SpeedOdometer.displayName = 'SpeedOdometer'

export default SpeedOdometer
