import React, { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  connections: IMihomoConnectionDetail[]
  /** 连接 id → 当前速率（字节/秒） */
  speeds: Map<string, number>
}

const CELLS = 46

function speedColor(bps: number): string {
  if (bps > 5 * 1024 * 1024) return '#f87171'
  if (bps > 1024 * 1024) return '#fbbf24'
  if (bps > 64 * 1024) return '#34d399'
  return '#60a5fa'
}

const IDLE_COLOR = 'rgba(96,160,255,0.22)'

// 连接矩阵：每格一个连接，格高按速率对数映射，颜色分档；空闲格以游走动效维持"面板活着"的观感
const NodeMatrixBase: React.FC<Props> = ({ connections, speeds }) => {
  const { t } = useTranslation()

  const cells = useMemo(() => {
    const list = connections.slice(0, CELLS)
    const sorted = [...list].sort((a, b) => (speeds.get(b.id) ?? 0) - (speeds.get(a.id) ?? 0))
    const max = Math.max(64 * 1024, ...sorted.map((c) => speeds.get(c.id) ?? 0))
    const logMax = Math.log10(1 + max)
    return Array.from({ length: CELLS }, (_, i) => {
      const conn = list[i]
      if (!conn) return { key: `idle-${i}`, active: false, ratio: 0, color: IDLE_COLOR, label: '' }
      const bps = speeds.get(conn.id) ?? 0
      const ratio = Math.min(1, Math.log10(1 + bps) / logMax)
      return {
        key: conn.id,
        active: bps > 0,
        ratio,
        color: bps > 0 ? speedColor(bps) : IDLE_COLOR,
        label: `${conn.metadata.host || conn.metadata.destinationIP} · ${conn.rule}`
      }
    })
  }, [connections, speeds])

  const active = useMemo(
    () => connections.reduce((n, c) => n + ((speeds.get(c.id) ?? 0) > 0 ? 1 : 0), 0),
    [connections, speeds]
  )

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/30 px-4 py-2 backdrop-blur-md">
      <span className="shrink-0 text-[11px] tracking-[0.25em] text-foreground/45">
        {t('warroom.matrix')}
      </span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/40">
        {active}/{connections.length}
      </span>
      <div className="flex h-6 min-w-0 flex-1 items-stretch gap-[3px]">
        {cells.map((cell, i) => (
          <div
            key={cell.key}
            title={cell.label || undefined}
            className="relative min-w-0 flex-1 overflow-hidden rounded-[2px]"
            style={{
              background: 'rgba(10,20,44,0.75)',
              boxShadow: cell.active ? `inset 0 0 7px ${cell.color}55` : undefined
            }}
          >
            {/* 速率柱：从底部生长 */}
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                height: `${Math.max(cell.active ? 12 : 6, cell.ratio * 100)}%`,
                background: `linear-gradient(to top, ${cell.color}22, ${cell.color})`,
                transition: 'height 480ms cubic-bezier(0.22,1,0.36,1), background 480ms linear'
              }}
            />
            {/* 顶部高光 */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: cell.active ? 'rgba(220,240,255,0.55)' : 'rgba(96,160,255,0.12)'
              }}
            />
            {/* 空闲格的游走波纹 */}
            {!cell.active && (
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to top, rgba(96,160,255,0.28), transparent)',
                  animation: 'warroom-cell-wave 4s ease-in-out infinite',
                  animationDelay: `${(i % 12) * 0.11}s`
                }}
              />
            )}
          </div>
        ))}
        {connections.length > CELLS && (
          <span className="shrink-0 self-center pl-1 font-mono text-[10px] text-foreground/40">
            +{connections.length - CELLS}
          </span>
        )}
      </div>
    </div>
  )
}

const NodeMatrix = memo(NodeMatrixBase)
NodeMatrix.displayName = 'NodeMatrix'

export default NodeMatrix
