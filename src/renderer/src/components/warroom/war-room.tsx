import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@heroui/react'
import { IoCloseOutline, IoPulse } from 'react-icons/io5'
import { useTranslation } from 'react-i18next'
import LiveGlobe from './live-globe'
import ConnectionRadar from './connection-radar'
import TrafficSpectrum from './traffic-spectrum'
import SpeedOdometer from './speed-odometer'
import LogTicker from './log-ticker'
import NodeMatrix from './node-matrix'
import HudOverlay from './hud-overlay'
import BootSequence from './boot-sequence'
import PanelShell from './panel-shell'
import RegionTops from './region-tops'
import AmbientParticles from './ambient-particles'
import AuroraGlow from './aurora-glow'

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

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtBps(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B/s'
  if (bytes < 1024) return `${Math.round(bytes)} B/s`
  const units = ['KB/s', 'MB/s', 'GB/s', 'TB/s']
  let v = bytes
  let unit = 0
  while (v >= 1024 && unit < units.length - 1) {
    v /= 1024
    unit++
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[unit]}`
}

// 顶栏状态簇：LIVE 心跳 + 系统时钟 + 战情室在线时长
const StatusCluster: React.FC = () => {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const startRef = useRef(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const date = new Date(now)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  const elapsed = Math.max(0, Math.floor((now - startRef.current) / 1000))
  const uptime = `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor((elapsed % 3600) / 60))}:${pad(elapsed % 60)}`

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-2 font-mono backdrop-blur-md">
      <span className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: '#f87171',
            boxShadow: '0 0 8px #f87171',
            animation: 'warroom-caret 1.6s steps(1, end) infinite'
          }}
        />
        <span className="text-[11px] tracking-[0.25em]" style={{ color: '#f87171' }}>
          {t('warroom.live')}
        </span>
      </span>
      <span className="text-[13px] tabular-nums tracking-[0.12em] text-white/85">{clock}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] tracking-[0.25em] text-foreground/40">
          {t('warroom.uptime')}
        </span>
        <span className="text-[12px] tabular-nums text-foreground/70">{uptime}</span>
      </span>
    </div>
  )
}

const WarRoomBase: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<IMihomoConnectionDetail[]>([])
  const [speeds, setSpeeds] = useState<Map<string, number>>(new Map())
  const [traffic, setTraffic] = useState({ up: 0, down: 0 })
  const [peak, setPeak] = useState({ up: 0, down: 0 })
  const [log, setLog] = useState<IMihomoLogInfo | null>(null)
  const [booting, setBooting] = useState(true)
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

  // 自检结束 → 收起自检层，主界面入场
  const handleBootDone = useCallback((): void => {
    setBooting(false)
    setMounted(true)
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
      const up = info.up ?? 0
      const down = info.down ?? 0
      setTraffic({ up, down })
      setPeak((prev) => ({
        up: Math.max(prev.up, up),
        down: Math.max(prev.down, down)
      }))
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
      className="fixed inset-0 z-[95] select-none overflow-hidden"
      style={STARFIELD}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 极光带：背景大尺度漂移色带 */}
      <AuroraGlow />

      {/* HUD 装饰层：网格 / 刻度 / 角括号 / 扫描线 / 暗角 */}
      <HudOverlay />

      {/* 环境粒子层：星尘上升 + 流星 + 速率突增迸发 */}
      <AmbientParticles totalRate={traffic.up + traffic.down} />

      {/* 顶栏：标题 + 翻牌速率 + 状态簇 + 退出 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-4 p-4 pl-6 pr-6">
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
          <SpeedOdometer
            value={traffic.up}
            peak={peak.up}
            label={t('warroom.speed.up')}
            color="#34d399"
          />
          <div className="h-10 w-px bg-white/15" />
          <SpeedOdometer
            value={traffic.down}
            peak={peak.down}
            label={t('warroom.speed.down')}
            color="#60a5fa"
          />
        </motion.div>

        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={mounted ? { x: 0, opacity: 1 } : {}}
          transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.12 }}
          className="pointer-events-auto flex items-center gap-3"
        >
          <StatusCluster />
          <Button
            isIconOnly
            size="sm"
            variant="flat"
            radius="full"
            className="bg-black/40 text-white"
            onPress={onClose}
            title={`${t('warroom.exit')} (ESC)`}
          >
            <IoCloseOutline className="text-xl" />
          </Button>
        </motion.div>
      </div>

      {/* 主区：雷达+地区榜 | 实时地球 | 频谱+读数（栏宽响应式） */}
      <motion.div
        className="absolute inset-x-0 bottom-[102px] top-[92px] grid grid-cols-[minmax(230px,270px)_1fr_minmax(230px,270px)] items-stretch gap-4 px-6 2xl:grid-cols-[320px_1fr_320px]"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={mounted ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.45, delay: 0.15 }}
      >
        <PanelShell
          label={t('warroom.radar')}
          accent="#34d399"
          meta={`${connections.length} ${t('warroom.connections')}`}
        >
          <div className="flex h-full min-h-0 flex-col items-center gap-2 p-2">
            <div className="min-h-0 flex-1">
              <ConnectionRadar connections={connections} speeds={speeds} compact />
            </div>
            <RegionTops activeByIso={activeByIso} />
          </div>
        </PanelShell>
        <div className="relative min-h-0" onClick={stop}>
          <LiveGlobe activeByIso={activeByIso} />
        </div>
        <PanelShell
          label={t('warroom.spectrum')}
          accent="#60a5fa"
          meta={`∑ ${Math.round(traffic.up + traffic.down)} B/s`}
        >
          <div className="flex h-full min-h-0 flex-col gap-2 p-2">
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-2 py-1.5">
                <div className="text-[9px] tracking-[0.2em] text-foreground/40">
                  {t('warroom.speed.up')}
                </div>
                <div className="font-mono text-[12px] font-semibold tabular-nums text-emerald-300">
                  {fmtBps(traffic.up)}
                </div>
              </div>
              <div className="rounded-lg border border-sky-400/15 bg-sky-400/5 px-2 py-1.5">
                <div className="text-[9px] tracking-[0.2em] text-foreground/40">
                  {t('warroom.speed.down')}
                </div>
                <div className="font-mono text-[12px] font-semibold tabular-nums text-sky-300">
                  {fmtBps(traffic.down)}
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <TrafficSpectrum speeds={speeds} compact />
            </div>
          </div>
        </PanelShell>
      </motion.div>

      {/* 底栏：连接矩阵 + 日志 ticker */}
      <motion.div
        className="absolute bottom-3 left-6 right-6 z-10 flex flex-col gap-2"
        initial={{ y: 30, opacity: 0 }}
        animate={mounted ? { y: 0, opacity: 1 } : {}}
        transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.2 }}
      >
        <NodeMatrix connections={connections} speeds={speeds} />
        <LogTicker log={log} />
      </motion.div>

      {/* 启动自检序列 */}
      <AnimatePresence>{booting && <BootSequence onDone={handleBootDone} />}</AnimatePresence>
    </motion.div>
  )
}

const WarRoom = memo(WarRoomBase)
WarRoom.displayName = 'WarRoom'

export default WarRoom
