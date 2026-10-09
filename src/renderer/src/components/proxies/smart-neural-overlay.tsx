import React, { memo, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Button, Switch } from '@heroui/react'
import { IoCloseOutline, IoHardwareChip } from 'react-icons/io5'
import { useTranslation } from 'react-i18next'
import { mihomoSmartGroupWeights } from '@renderer/utils/ipc'

const AUTO_PLAY_KEY = 'smart-neural-auto-play'

export function isNeuralAutoPlayEnabled(): boolean {
  return localStorage.getItem(AUTO_PLAY_KEY) !== '0'
}

interface NeuralNode {
  name: string
  delay: number
}

interface Props {
  groupName: string
  nodes: NeuralNode[]
  winner: string
  onClose: () => void
}

const VIEW_W = 760
const VIEW_H = 360
const LAYER_X = [80, 290, 480, 660]
const MAX_INPUT = 9
const ANIMATION_DONE_MS = 5400

function layerYs(count: number): number[] {
  const span = VIEW_H - 80
  const gap = count > 1 ? span / (count - 1) : 0
  return Array.from({ length: count }, (_, i) => 40 + (count > 1 ? i * gap : span / 2))
}

function sampleNodes(nodes: NeuralNode[], winner: string): NeuralNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.name === winner) return -1
    if (b.name === winner) return 1
    if (a.delay <= 0) return 1
    if (b.delay <= 0) return -1
    return a.delay - b.delay
  })
  return sorted.slice(0, MAX_INPUT)
}

const SmartNeuralOverlayBase: React.FC<Props> = ({ groupName, nodes, winner, onClose }) => {
  const { t } = useTranslation()
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [autoPlay, setAutoPlay] = useState(isNeuralAutoPlayEnabled)

  useEffect(() => {
    mihomoSmartGroupWeights(groupName)
      .then(setWeights)
      .catch(() => {})
  }, [groupName])

  useEffect(() => {
    const timer = setTimeout(onClose, ANIMATION_DONE_MS)
    return () => clearTimeout(timer)
  }, [onClose])

  const sampled = useMemo(() => sampleNodes(nodes, winner), [nodes, winner])

  const layout = useMemo(() => {
    const input = sampled.map((n, i) => ({
      ...n,
      x: LAYER_X[0],
      y: layerYs(sampled.length)[i]
    }))
    const hidden1 = layerYs(7).map((y, i) => ({ x: LAYER_X[1], y, id: `h1-${i}` }))
    const hidden2 = layerYs(5).map((y, i) => ({ x: LAYER_X[2], y, id: `h2-${i}` }))
    const output = { x: LAYER_X[3], y: VIEW_H / 2 }
    const edges1 = input.flatMap((a) => hidden1.map((b) => ({ a, b })))
    const edges2 = hidden1.flatMap((a) => hidden2.map((b) => ({ a, b })))
    const edges3 = hidden2.map((a) => ({ a, b: output }))
    return { input, hidden1, hidden2, output, edges1, edges2, edges3 }
  }, [sampled])

  // 权重只影响输入层节点半径，纯视觉效果；拿不到权重时统一半径
  const radiusByName = useMemo(() => {
    const values = sampled.map((n) => weights[n.name]).filter((w) => typeof w === 'number')
    const map: Record<string, number> = {}
    if (values.length < 2) {
      sampled.forEach((n) => (map[n.name] = 6))
      return map
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    sampled.forEach((n) => {
      const w = weights[n.name]
      map[n.name] = typeof w === 'number' ? 4.5 + ((w - min) / (max - min || 1)) * 5.5 : 4.5
    })
    return map
  }, [weights, sampled])

  const winnerNode = sampled.find((n) => n.name === winner)

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="relative flex flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-content1 shadow-2xl"
        style={{ width: 'min(840px, 96vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <IoHardwareChip size={16} />
            </div>
            <span className="text-sm font-semibold">{t('proxies.neural.title')}</span>
            <span className="max-w-[220px] truncate text-xs text-foreground/50">{groupName}</span>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            radius="full"
            onPress={onClose}
            title={t('common.close')}
          >
            <IoCloseOutline className="text-lg" />
          </Button>
        </div>

        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full select-none">
          {/* 连线 */}
          {[layout.edges1, layout.edges2, layout.edges3].map((edges, li) =>
            edges.map(({ a, b }, i) => (
              <line
                key={`${li}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="hsl(var(--heroui-default-500))"
                strokeOpacity={0.1}
                strokeWidth={0.6}
              />
            ))
          )}

          {/* 逐层流动的脉冲 */}
          {layout.edges1
            .filter((_, i) => i % 6 === 0)
            .map(({ a, b }, i) => (
              <motion.circle
                key={`p1-${i}`}
                r={2.4}
                fill="hsl(var(--heroui-primary))"
                initial={{ cx: a.x, cy: a.y, opacity: 0 }}
                animate={{ cx: [a.x, b.x], cy: [a.y, b.y], opacity: [0, 1, 0] }}
                transition={{ duration: 0.7, delay: 0.5 + i * 0.07, ease: 'easeInOut' }}
              />
            ))}
          {layout.edges2
            .filter((_, i) => i % 5 === 0)
            .map(({ a, b }, i) => (
              <motion.circle
                key={`p2-${i}`}
                r={2.4}
                fill="hsl(var(--heroui-secondary))"
                initial={{ cx: a.x, cy: a.y, opacity: 0 }}
                animate={{ cx: [a.x, b.x], cy: [a.y, b.y], opacity: [0, 1, 0] }}
                transition={{ duration: 0.6, delay: 1.4 + i * 0.09, ease: 'easeInOut' }}
              />
            ))}
          {layout.edges3.map(({ a, b }, i) => (
            <motion.circle
              key={`p3-${i}`}
              r={2.6}
              fill="hsl(var(--heroui-success))"
              initial={{ cx: a.x, cy: a.y, opacity: 0 }}
              animate={{ cx: [a.x, b.x], cy: [a.y, b.y], opacity: [0, 1, 0] }}
              transition={{ duration: 0.5, delay: 2.3 + i * 0.08, ease: 'easeInOut' }}
            />
          ))}

          {/* 输入层：真实节点 */}
          {layout.input.map((n, i) => (
            <motion.g
              key={`in-${n.name}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.12 + i * 0.05 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={radiusByName[n.name] ?? 6}
                fill="hsl(var(--heroui-primary) / 0.18)"
                stroke={
                  n.name === winner ? 'hsl(var(--heroui-success))' : 'hsl(var(--heroui-primary))'
                }
                strokeWidth={n.name === winner ? 2 : 1.2}
              />
              <title>{`${n.name}${n.delay > 0 ? ` · ${n.delay}ms` : ''}`}</title>
            </motion.g>
          ))}

          {/* 隐藏层 */}
          {layout.hidden1.map((n, i) => (
            <motion.circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={5}
              fill="hsl(var(--heroui-secondary) / 0.2)"
              stroke="hsl(var(--heroui-secondary))"
              strokeWidth={1.2}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 1.1 + i * 0.06 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            />
          ))}
          {layout.hidden2.map((n, i) => (
            <motion.circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={5}
              fill="hsl(var(--heroui-secondary) / 0.2)"
              stroke="hsl(var(--heroui-secondary))"
              strokeWidth={1.2}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 2 + i * 0.07 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            />
          ))}

          {/* 输出层：选中节点 */}
          <motion.circle
            cx={layout.output.x}
            cy={layout.output.y}
            r={8}
            fill="hsl(var(--heroui-success) / 0.25)"
            stroke="hsl(var(--heroui-success))"
            strokeWidth={2}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 2.8 }}
            style={{ transformOrigin: `${layout.output.x}px ${layout.output.y}px` }}
          />
          <motion.circle
            cx={layout.output.x}
            cy={layout.output.y}
            r={8}
            fill="none"
            stroke="hsl(var(--heroui-success))"
            strokeWidth={1.5}
            initial={{ opacity: 0 }}
            animate={{ scale: [0.8, 2.2], opacity: [0.9, 0] }}
            transition={{ duration: 1, delay: 3, repeat: 1, ease: 'easeOut' }}
            style={{ transformOrigin: `${layout.output.x}px ${layout.output.y}px` }}
          />
          {winnerNode && (
            <motion.text
              x={layout.output.x - 10}
              y={layout.output.y + 26}
              textAnchor="end"
              fontSize={11}
              fontWeight={600}
              fill="hsl(var(--heroui-success))"
              initial={{ opacity: 0, y: layout.output.y + 34 }}
              animate={{ opacity: 1, y: layout.output.y + 26 }}
              transition={{ delay: 3.2 }}
            >
              {winnerNode.name.slice(0, 24)}
            </motion.text>
          )}
        </svg>

        <div className="flex items-center justify-between border-t border-foreground/10 px-4 py-2.5">
          <div className="text-xs text-foreground/70">
            {winnerNode ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.1 }}
              >
                {t('proxies.neural.selected', {
                  name: winnerNode.name,
                  delay: winnerNode.delay > 0 ? winnerNode.delay : '--'
                })}
              </motion.span>
            ) : (
              <motion.span
                animate={{ opacity: [0.35, 0.9, 0.35] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              >
                {t('proxies.neural.thinking')}
              </motion.span>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground/50">
            <Switch
              size="sm"
              isSelected={autoPlay}
              onValueChange={(v) => {
                setAutoPlay(v)
                localStorage.setItem(AUTO_PLAY_KEY, v ? '1' : '0')
              }}
              aria-label={t('proxies.neural.autoPlay')}
            />
            {t('proxies.neural.autoPlay')}
          </label>
        </div>
      </motion.div>
    </div>
  )
}

const SmartNeuralOverlay = memo(SmartNeuralOverlayBase)
SmartNeuralOverlay.displayName = 'SmartNeuralOverlay'

export default SmartNeuralOverlay
