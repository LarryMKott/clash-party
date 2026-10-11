import React, { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import MihomoIcon from './base/mihomo-icon'
import { getVersion, mihomoVersion } from '@renderer/utils/ipc'

// 全局启动点火序列：冷启动一次性开场（sessionStorage 防同会话重复）。
// 黑屏 → 终端逐行打印 → logo 点亮 → 整层揭起。任何时刻点击/按键可跳过。
const SHOWN_KEY = 'ignition-shown'
const LINE_INTERVAL = 220
const HOLD_AFTER_LOGO = 520

const IgnitionOverlayBase: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [version, setVersion] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const finishedRef = useRef(false)

  const finish = useRef(() => {})
  finish.current = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    sessionStorage.setItem(SHOWN_KEY, '1')
    onDone()
  }

  useEffect(() => {
    mihomoVersion()
      .then((v) => setVersion(v.version || ''))
      .catch(() => {})
    getVersion()
      .then(setAppVersion)
      .catch(() => {})
    const skip = (): void => finish.current()
    window.addEventListener('keydown', skip)
    window.addEventListener('mousedown', skip)
    return (): void => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('mousedown', skip)
    }
  }, [])

  useEffect(() => {
    // 5 行终端文案 + logo：走完移交
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= 5; i++) {
      timers.push(setTimeout(() => setStep(i), LINE_INTERVAL * i))
    }
    timers.push(setTimeout(() => finish.current(), LINE_INTERVAL * 5 + HOLD_AFTER_LOGO))
    return (): void => timers.forEach(clearTimeout)
  }, [])

  const lines: string[] = [
    t('ignition.l1'),
    t('ignition.l2'),
    version ? `mihomo core v${version}` : t('ignition.l3'),
    t('ignition.l4'),
    t('ignition.l5')
  ]

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: '#02040a' }}
      exit={{ y: '-100%' }}
      transition={{ duration: 0.45, ease: [0.7, 0, 0.3, 1] }}
      onClick={() => finish.current()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, filter: 'blur(6px)' }}
        animate={
          step >= 5 ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : { opacity: 0.25, scale: 0.85 }
        }
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
        style={{ filter: 'drop-shadow(0 0 22px rgba(64,110,255,0.55))' }}
      >
        <MihomoIcon className="h-20 w-20" />
      </motion.div>
      {appVersion && (
        <div className="mt-2 font-mono text-[11px] tracking-[0.3em] text-white/35">
          v{appVersion}
        </div>
      )}

      <div className="mt-5 w-[min(420px,80vw)] font-mono text-xs leading-6">
        {lines.slice(0, step).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[#4ade80]/85"
            style={{ textShadow: '0 0 8px rgba(74,222,128,0.4)' }}
          >
            <span className="mr-2 text-[#4ade80]/40">[ok]</span>
            {line}
          </motion.div>
        ))}
        {step < 5 && (
          <span className="inline-block h-3.5 w-2 animate-pulse bg-[#4ade80]/80 align-middle" />
        )}
      </div>
    </motion.div>
  )
}

const IgnitionOverlay = memo(IgnitionOverlayBase)
IgnitionOverlay.displayName = 'IgnitionOverlay'

export default IgnitionOverlay

/** 是否需要播放点火序列（冷启动一次，禁用动画时跳过） */
export function shouldPlayIgnition(disableAnimations: boolean): boolean {
  if (disableAnimations) return false
  try {
    return sessionStorage.getItem(SHOWN_KEY) !== '1'
  } catch {
    return false
  }
}
