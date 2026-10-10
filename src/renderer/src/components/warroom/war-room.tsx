import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@heroui/react'
import { IoCloseOutline, IoPulse } from 'react-icons/io5'
import { useTranslation } from 'react-i18next'
import LiveGlobe from './live-globe'
import ConnectionRadar from './connection-radar'
import TrafficSpectrum from './traffic-spectrum'
import SpeedOdometer from './speed-odometer'
import LogTicker from './log-ticker'

interface Props {
  onClose: () => void
}

// 多层平铺星点 + 底部星云辉光（与星图同款氛围）
const STARFIELD = {
  backgroundColor: '#04060d',
  backgroundImage: [
    'radial-gradient(1px 1px at 22% 28%, rgba(255,255,255,0.7) 50%, transparent 51%)',
    'radial-gradient(1px 1px at 68% 12%, rgba(255,255,255,0.5) 50%, transparent 51%)',
    'radial-gradient(1.5px 1.5px at 44% 64%, rgba(190,215,255,0.6) 50%, transparent 51%)',
    'radial-gradient(1px 1px at 86% 78%, rgba(255,255,255,0.45) 50%, transparent 51%)',
    'radial-gradient(1px 1px at 8% 82%, rgba(160,190,255,0.5) 50%, transparent 51%)',
    'radial-gradient(ellipse at 50% 135%, rgba(64,110,255,0.2), transparent 62%)'
  ].join(','),
  backgroundSize: '260px 260px, 340px 340px, 420px 420px, 500px 500px, 560px 560px, 100% 100%'
}

function extractDestIso(conn: IMihomoConnectionDetail): string | null {
  for (const code of conn.metadata.destinationGeoIP ?? []) {
    if (code && /^[a-zA-Z]{2}$/.test(code)) return code.toUpperCase()
  }
  return null
}

const WarRoomBase: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<IMihomoConnectionDetail[]>([])
  const [speeds, setSpeeds] = useState<Map<string, number>>(new Map())
  const [traffic, setTraffic] = useState({ up: 0, down: 0 })
  const [log, setLog] = useState<IMihomoLogInfo | null>(null)
  const [mounted, setMounted] = useState(false)

  const prevTotalsRef = useRef<Map<string, number>>(new Map())
  const lastTickRef = useRef(Date.now())

  // ESC 退出
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 挂载动画
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onConnections = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as IMihomoConnectionsInfo
      const list = info.connections ?? []
      const now = Date.now()
      const dt = Math.max(0.2, (now - lastTickRef.current) / 1000)
      lastTickRef.current = now

      const prev = prevTotalsRef.current
      const next = new Map<string, number>()
      const speeds = new Map<string, number>()
      for (const conn of list) {
        const total = conn.download + conn.upload
        const before = prev.get(conn.id)
        if (before !== undefined) {
          speeds.set(conn.id, Math.max(0, (total - before) / dt))
        }
        next.set(conn.id, total)
      }
      prevTotalsRef.current = next
      setConnections(list)
      setSpeeds(speeds)
    }
    const unsubConnections = window.electron.ipcRenderer.on('mihomoConnections', onConnections)

    const onTraffic = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as { up: number; down: number }
      setTraffic({ up: info.up ?? 0, down: info.down ?? 0 })
    }
    const unsubTraffic = window.electron.ipcRenderer.on('mihomoTraffic', onTraffic)

    const onLog = (_e: unknown, ...args: unknown[]): void => {
      const entry = args[0] as IMihomoLogInfo
      setLog({ ...entry, time: new Date().toLocaleString() })
    }
    const unsubLogs = window.electron.ipcRenderer.on('mihomoLogs', onLog)

    return (): void => {
      unsubConnections()
      unsubTraffic()
      unsubLogs()
    }
  }, [])

  // 活跃目的地聚合：iso → 连接数
  const activeByIso = useMemo(() => {
    const map = new Map<string, number>()
    for (const conn of connections) {
      const iso = extractDestIso(conn)
      if (!iso) continue
      map.set(iso, (map.get(iso) ?? 0) + 1)
    }
    return map
  }, [connections])

  const stop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <motion.div
      key="warroom"
      className="fixed inset-0 z-[95] select-none"
      style={STARFIELD}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 顶栏：标题 + 翻牌速率 + 退出 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={mounted ? { x: 0, opacity: 1 } : {}}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          className="pointer-events-auto rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white backdrop-blur-md"
          style={{ boxShadow: '0 0 24px rgba(64,110,255,0.25)' }}
        >
          <div className="flex items-center gap-2 text-base font-semibold tracking-[0.15em]">
            <IoPulse className="text-primary" />
            {t('warroom.title')}
          </div>
          <div className="mt-0.5 text-xs text-white/50">
            {t('warroom.connections')}: {connections.length}
          </div>
        </motion.div>

        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={mounted ? { y: 0, opacity: 1 } : {}}
          transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.08 }}
          className="pointer-events-auto flex items-center gap-8 rounded-xl border border-white/10 bg-black/40 px-8 py-3 text-white backdrop-blur-md"
        >
          <SpeedOdometer value={traffic.up} label={t('warroom.speed.up')} color="#34d399" />
          <div className="h-10 w-px bg-white/15" />
          <SpeedOdometer value={traffic.down} label={t('warroom.speed.down')} color="#60a5fa" />
        </motion.div>

        <div className="pointer-events-auto">
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            radius="full"
            className="mt-1 bg-black/40 text-white"
            onPress={onClose}
            title={`${t('warroom.exit')} (ESC)`}
          >
            <IoCloseOutline className="text-xl" />
          </Button>
        </div>
      </div>

      {/* 主区：雷达 | 实时地球 | 频谱 */}
      <motion.div
        className="absolute inset-x-0 bottom-[52px] top-[92px] grid grid-cols-[300px_1fr_300px] items-stretch gap-4 px-4"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={mounted ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.45, delay: 0.15 }}
      >
        <div
          className="flex min-h-0 items-center justify-center rounded-2xl border border-white/5 bg-black/25 p-3 backdrop-blur-sm"
          onClick={stop}
        >
          <ConnectionRadar connections={connections} speeds={speeds} />
        </div>
        <div className="relative min-h-0" onClick={stop}>
          <LiveGlobe activeByIso={activeByIso} />
        </div>
        <div
          className="flex min-h-0 items-center rounded-2xl border border-white/5 bg-black/25 p-3 backdrop-blur-sm"
          onClick={stop}
        >
          <TrafficSpectrum speeds={speeds} />
        </div>
      </motion.div>

      {/* 底栏：日志 ticker */}
      <motion.div
        className="absolute bottom-3 left-4 right-4 z-10"
        initial={{ y: 30, opacity: 0 }}
        animate={mounted ? { y: 0, opacity: 1 } : {}}
        transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.2 }}
      >
        <LogTicker log={log} />
      </motion.div>
    </motion.div>
  )
}

const WarRoom = memo(WarRoomBase)
WarRoom.displayName = 'WarRoom'

export default WarRoom
