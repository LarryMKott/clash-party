import React, { memo, useEffect, useRef } from 'react'

// 黑客帝国字符雨：字符取自真实内核日志 payload（无日志时用默认字符集）。
// 经典拖尾画法：每帧先铺半透明黑再画当前字符行。
const FONT_SIZE = 13
const COLUMN_GAP = 4
const DEFAULT_CHARS = 'アイウエオカキクケコサシスセソ0123456789ABCDEF[]<>{}=+*'

const LogMatrixBase: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1

    let columns: { y: number; speed: number }[] = []
    let width = 0
    let height = 0
    let lastTime = 0
    let raf = 0

    const charPool: string[] = []
    const pushChars = (text: string): void => {
      for (const ch of text) {
        if (ch.trim()) charPool.push(ch)
      }
      if (charPool.length > 600) charPool.splice(0, charPool.length - 600)
    }
    const onLog = (_e: unknown, ...args: unknown[]): void => {
      const log = args[0] as IMihomoLogInfo
      if (log?.payload) pushChars(log.payload)
    }
    const unsub = window.electron.ipcRenderer.on('mihomoLogs', onLog)

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      if (!width || !height) return
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(1, Math.floor(width / (FONT_SIZE + COLUMN_GAP)))
      columns = Array.from({ length: count }, (_, i) => ({
        y: Math.random() * height,
        speed: 40 + ((i * 137) % 90)
      }))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.1, (now - lastTime) / 1000 || 0.016)
      lastTime = now
      if (!width || !height || columns.length === 0) return

      ctx.fillStyle = 'rgba(2,8,6,0.16)'
      ctx.fillRect(0, 0, width, height)
      ctx.font = `${FONT_SIZE}px ui-monospace, monospace`

      columns.forEach((col, i) => {
        col.y += col.speed * dt
        if (col.y > height + FONT_SIZE * 12 && Math.random() < 0.04) {
          col.y = -Math.random() * height * 0.3
          col.speed = 40 + Math.random() * 90
        }
        const x = i * (FONT_SIZE + COLUMN_GAP)
        const ch =
          charPool.length > 0
            ? charPool[Math.floor(Math.random() * charPool.length)]
            : DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)]
        // 头字符亮白绿，主体磷光绿
        ctx.fillStyle = 'rgba(190,255,210,0.9)'
        ctx.fillText(ch, x, col.y)
        ctx.fillStyle = 'rgba(52,211,153,0.55)'
        ctx.fillText(
          charPool.length > 0
            ? charPool[Math.floor(Math.random() * charPool.length)]
            : DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)],
          x,
          col.y - FONT_SIZE * 2
        )
      })
    }
    raf = requestAnimationFrame(draw)

    return (): void => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      unsub()
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

const LogMatrix = memo(LogMatrixBase)
LogMatrix.displayName = 'LogMatrix'

export default LogMatrix
