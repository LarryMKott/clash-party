import React, { memo } from 'react'

// 极光带：两条大尺度模糊色带在背景缓慢漂移（纯 CSS 动画，
// mix-blend-screen 叠在星空上，不影响前景可读性）。
const AuroraGlowBase: React.FC = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-[0] overflow-hidden">
      <div
        className="absolute -left-[10%] top-[6%] h-[34%] w-[70%] blur-3xl"
        style={{
          background:
            'linear-gradient(100deg, transparent 8%, rgba(56,130,246,0.16) 32%, rgba(125,211,252,0.1) 55%, rgba(167,139,250,0.12) 78%, transparent 96%)',
          animation: 'warroom-aurora-a 26s ease-in-out infinite',
          mixBlendMode: 'screen'
        }}
      />
      <div
        className="absolute -right-[12%] top-[38%] h-[30%] w-[64%] blur-3xl"
        style={{
          background:
            'linear-gradient(80deg, transparent 10%, rgba(34,211,238,0.1) 38%, rgba(59,130,246,0.12) 62%, rgba(52,211,153,0.08) 82%, transparent 95%)',
          animation: 'warroom-aurora-b 32s ease-in-out infinite',
          mixBlendMode: 'screen'
        }}
      />
    </div>
  )
}

const AuroraGlow = memo(AuroraGlowBase)
AuroraGlow.displayName = 'AuroraGlow'

export default AuroraGlow
