import React, { memo } from 'react'

// 战争桌面的 HUD 装饰层：网格、边刻度、角括号、十六进制跑马灯与 CRT 叠层。
// 全部为纯视觉元素，pointer-events-none，不承载任何交互。

const TAPE = 'A3F0 7C21 9E4B 12D8 6F3A C0B7 5E19 8D42 3B6C F701 24E9 8A5D 63C2 0F87 B95E 47A1 '

const GRID: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(rgba(96,160,255,0.05) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(96,160,255,0.05) 1px, transparent 1px)',
    'linear-gradient(rgba(96,160,255,0.025) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(96,160,255,0.025) 1px, transparent 1px)'
  ].join(','),
  backgroundSize: '240px 240px, 240px 240px, 48px 48px, 48px 48px'
}

const RULER_H: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(90deg, rgba(96,160,255,0.45) 0 1px, transparent 1px 12px)'
}

const RULER_H_LONG: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(90deg, rgba(125,211,252,0.65) 0 1px, transparent 1px 96px)'
}

const RULER_V: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(96,160,255,0.45) 0 1px, transparent 1px 12px)'
}

const RULER_V_LONG: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(125,211,252,0.65) 0 1px, transparent 1px 96px)'
}

// 扫描光带：自上而下循环掠过
const SCAN_BAND: React.CSSProperties = {
  background:
    'linear-gradient(to bottom, rgba(96,160,255,0) 0%, rgba(96,160,255,0.07) 55%, rgba(160,205,255,0.14) 92%, rgba(96,160,255,0) 100%)',
  animation: 'warroom-scan-band 9s linear infinite'
}

const SCANLINES: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(180,215,255,0.05) 0px, rgba(180,215,255,0.05) 1px, transparent 1px, transparent 3px)'
}

const VIGNETTE: React.CSSProperties = {
  background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 38%, rgba(2,4,12,0.5) 100%)'
}

const CORNERS = [
  { key: 'tl', cls: 'left-2 top-2 border-l border-t rounded-tl', delay: '0s' },
  { key: 'tr', cls: 'right-2 top-2 border-r border-t rounded-tr', delay: '0.6s' },
  { key: 'bl', cls: 'bottom-2 left-2 border-b border-l rounded-bl', delay: '1.2s' },
  { key: 'br', cls: 'bottom-2 right-2 border-b border-r rounded-br', delay: '1.8s' }
]

const HudOverlayBase: React.FC = () => {
  return (
    <>
      {/* ── 底层：网格 / 刻度 / 角括号 / 跑马灯 ── */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        <div className="absolute inset-0" style={GRID} />

        {/* 上下边刻度尺 */}
        <div className="absolute inset-x-0 top-0 h-3" style={{ ...RULER_H, opacity: 0.3 }} />
        <div className="absolute inset-x-0 top-0 h-5" style={{ ...RULER_H_LONG, opacity: 0.45 }} />
        <div className="absolute inset-x-0 bottom-0 h-3" style={{ ...RULER_H, opacity: 0.3 }} />
        <div
          className="absolute inset-x-0 bottom-0 h-5"
          style={{ ...RULER_H_LONG, opacity: 0.45 }}
        />

        {/* 左右边刻度尺 */}
        <div className="absolute inset-y-0 left-0 w-3" style={{ ...RULER_V, opacity: 0.26 }} />
        <div className="absolute inset-y-0 left-0 w-5" style={{ ...RULER_V_LONG, opacity: 0.4 }} />
        <div className="absolute inset-y-0 right-0 w-3" style={{ ...RULER_V, opacity: 0.26 }} />
        <div className="absolute inset-y-0 right-0 w-5" style={{ ...RULER_V_LONG, opacity: 0.4 }} />

        {/* 四角括号：呼吸发光 */}
        {CORNERS.map((c) => (
          <div
            key={c.key}
            className={`absolute h-7 w-7 ${c.cls}`}
            style={{
              borderColor: 'rgba(96,160,255,0.6)',
              boxShadow: '0 0 12px rgba(96,160,255,0.35)',
              animation: `warroom-corner-breathe 3.2s ease-in-out infinite`,
              animationDelay: c.delay
            }}
          />
        ))}

        {/* 顶部十六进制跑马灯 */}
        <div className="absolute inset-x-0 top-[3px] h-4 overflow-hidden">
          <div
            className="flex w-[200%] whitespace-nowrap font-mono text-[9px] leading-4"
            style={{ animation: 'warroom-tape 70s linear infinite' }}
          >
            <span className="w-1/2 tracking-[0.35em]" style={{ color: 'rgba(96,160,255,0.3)' }}>
              {TAPE.repeat(12)}
            </span>
            <span className="w-1/2 tracking-[0.35em]" style={{ color: 'rgba(96,160,255,0.3)' }}>
              {TAPE.repeat(12)}
            </span>
          </div>
        </div>

        {/* 左侧竖排标识 */}
        <div
          className="absolute left-[3px] top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-[0.5em]"
          style={{
            writingMode: 'vertical-rl',
            color: 'rgba(125,211,252,0.22)'
          }}
        >
          TACTICAL UPLINK
        </div>
        <div
          className="absolute right-[3px] top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-[0.5em]"
          style={{
            writingMode: 'vertical-rl',
            color: 'rgba(125,211,252,0.22)'
          }}
        >
          REALTIME TELEMETRY
        </div>

        {/* 扫描光带 */}
        <div className="absolute inset-x-0 h-[22%]" style={SCAN_BAND} />
      </div>

      {/* ── 顶层：CRT 叠层（扫描线 / 暗角 / 闪动）── */}
      <div className="pointer-events-none absolute inset-0 z-[30] overflow-hidden">
        <div className="absolute inset-0" style={SCANLINES} />
        <div className="absolute inset-0" style={VIGNETTE} />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(120deg, rgba(120,180,255,0.05), rgba(120,180,255,0) 55%)',
            animation: 'warroom-screen-flicker 7s steps(1, end) infinite'
          }}
        />
      </div>
    </>
  )
}

const HudOverlay = memo(HudOverlayBase)
HudOverlay.displayName = 'HudOverlay'

export default HudOverlay
