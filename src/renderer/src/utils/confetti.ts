// 零依赖 canvas 烟花：一次性全屏粒子爆发，动画结束自动移除 canvas。

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  vr: number
  shape: 'rect' | 'circle'
}

const COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#c084fc', '#7dd3fc']

export function fireConfetti(originX = 0.5, originY = 0.35, count = 160): void {
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.cssText = `position:fixed;inset:0;z-index:100;pointer-events:none;`
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const ox = w * originX
  const oy = h * originY
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 220 + Math.random() * 480
    particles.push({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 260,
      size: 4 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 14,
      shape: Math.random() > 0.4 ? 'rect' : 'circle'
    })
  }

  const duration = 2200
  const start = performance.now()
  let raf = 0

  const draw = (now: number): void => {
    const t = (now - start) / duration
    if (t >= 1) {
      cancelAnimationFrame(raf)
      canvas.remove()
      return
    }
    const dt = 1 / 60
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const fade = 1 - t * t
    for (const p of particles) {
      p.vy += 900 * dt
      p.vx *= 0.985
      p.vy *= 0.985
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.vr * dt
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = p.color
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)
}
