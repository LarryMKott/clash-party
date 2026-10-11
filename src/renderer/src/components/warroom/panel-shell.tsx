import React, { memo } from 'react'

interface Props {
  label: string
  /** 左侧色点颜色 */
  accent?: string
  /** 右侧读数槽 */
  meta?: React.ReactNode
  children: React.ReactNode
}

// 战争桌面统一面板外壳：HUD 切角边框 + 标签条 + 内容区
const PanelShellBase: React.FC<Props> = ({ label, accent = '#60a5fa', meta, children }) => {
  return (
    <div
      className="relative flex h-full min-h-0 flex-col border border-white/10 bg-black/30 backdrop-blur-sm"
      style={{
        clipPath:
          'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))'
      }}
    >
      {/* 标签条 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-1.5">
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
          />
          <span className="text-[10px] font-semibold tracking-[0.28em] text-foreground/55">
            {label}
          </span>
        </span>
        {meta != null && (
          <span className="min-w-0 truncate font-mono text-[10px] text-foreground/45">{meta}</span>
        )}
      </div>
      {/* 内容区 */}
      <div className="relative min-h-0 flex-1">{children}</div>
      {/* 切角描边装饰 */}
      <span
        className="pointer-events-none absolute right-0 top-0 h-4 w-4"
        style={{
          background: 'linear-gradient(225deg, rgba(125,211,252,0.55) 0 50%, transparent 50%)'
        }}
      />
      <span
        className="pointer-events-none absolute bottom-0 left-0 h-4 w-4"
        style={{
          background: 'linear-gradient(45deg, rgba(125,211,252,0.55) 0 50%, transparent 50%)'
        }}
      />
    </div>
  )
}

const PanelShell = memo(PanelShellBase)
PanelShell.displayName = 'PanelShell'

export default PanelShell
