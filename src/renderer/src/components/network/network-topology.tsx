import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { Button } from '@heroui/react'
import {
  IoPauseOutline,
  IoPlayOutline,
  IoGitNetworkOutline,
  IoDesktopOutline,
  IoServerOutline,
  IoFunnelOutline,
  IoSparkles
} from 'react-icons/io5'
import { MdTag } from 'react-icons/md'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { calcTraffic } from '@renderer/utils/calc'
import { useAppConfig } from '@renderer/hooks/use-app-config'

// ─── Types ───────────────────────────────────────────────────────────────────

type NodeType = 'root' | 'client' | 'port' | 'rule' | 'group' | 'proxy'

interface TopologyNodeData {
  id: string
  name: string
  type: NodeType
  connections: number
  traffic: number
  children?: TopologyNodeData[]
  _children?: TopologyNodeData[]
  collapsed?: boolean
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function getNodeColors() {
  return {
    root: {
      fill: 'hsl(var(--heroui-default-500))',
      bg: 'hsl(var(--heroui-default-500) / 0.15)'
    },
    client: {
      fill: 'hsl(var(--heroui-primary))',
      bg: 'hsl(var(--heroui-primary) / 0.15)'
    },
    port: {
      fill: 'hsl(var(--heroui-warning))',
      bg: 'hsl(var(--heroui-warning) / 0.15)'
    },
    rule: {
      fill: 'hsl(var(--heroui-secondary))',
      bg: 'hsl(var(--heroui-secondary) / 0.15)'
    },
    group: {
      fill: 'hsl(var(--heroui-success))',
      bg: 'hsl(var(--heroui-success) / 0.15)'
    },
    proxy: {
      fill: 'hsl(var(--heroui-danger))',
      bg: 'hsl(var(--heroui-danger) / 0.15)'
    },
    baseContent: 'hsl(var(--heroui-foreground))'
  }
}

// ─── Hierarchy builder ────────────────────────────────────────────────────────

function buildHierarchy(
  connections: IMihomoConnectionDetail[],
  collapsedNodes: Set<string>
): TopologyNodeData {
  const groupsMap = new Map<
    string,
    {
      data: TopologyNodeData
      proxies: Map<
        string,
        {
          data: TopologyNodeData
          rules: Map<
            string,
            {
              data: TopologyNodeData
              clients: Map<string, { data: TopologyNodeData; ports: Map<string, TopologyNodeData> }>
            }
          >
        }
      >
    }
  >()

  for (const conn of connections) {
    const clientIP = conn.metadata.sourceIP || 'Unknown'
    const sourcePort = String(conn.metadata.sourcePort || 'Unknown')
    const ruleType = conn.rule || 'Direct'
    const fullRule = conn.rulePayload ? `${ruleType}: ${conn.rulePayload}` : ruleType
    const chains = conn.chains || []
    const proxy = chains[0] ?? 'Direct'
    const group = chains.length > 1 ? (chains[1] ?? 'Direct') : (chains[0] ?? 'Direct')
    const traffic = conn.download + conn.upload

    if (!groupsMap.has(group)) {
      groupsMap.set(group, {
        data: { id: `group-${group}`, name: group, type: 'group', connections: 0, traffic: 0 },
        proxies: new Map()
      })
    }
    const groupEntry = groupsMap.get(group)
    if (!groupEntry) continue
    groupEntry.data.connections++
    groupEntry.data.traffic += traffic

    if (!groupEntry.proxies.has(proxy)) {
      groupEntry.proxies.set(proxy, {
        data: {
          id: `proxy-${group}-${proxy}`,
          name: proxy,
          type: 'proxy',
          connections: 0,
          traffic: 0
        },
        rules: new Map()
      })
    }
    const proxyEntry = groupEntry.proxies.get(proxy)
    if (!proxyEntry) continue
    proxyEntry.data.connections++
    proxyEntry.data.traffic += traffic

    if (!proxyEntry.rules.has(fullRule)) {
      proxyEntry.rules.set(fullRule, {
        data: {
          id: `rule-${group}-${proxy}-${fullRule}`,
          name: fullRule,
          type: 'rule',
          connections: 0,
          traffic: 0
        },
        clients: new Map()
      })
    }
    const ruleEntry = proxyEntry.rules.get(fullRule)
    if (!ruleEntry) continue
    ruleEntry.data.connections++
    ruleEntry.data.traffic += traffic

    if (!ruleEntry.clients.has(clientIP)) {
      ruleEntry.clients.set(clientIP, {
        data: {
          id: `client-${group}-${proxy}-${fullRule}-${clientIP}`,
          name: clientIP,
          type: 'client',
          connections: 0,
          traffic: 0
        },
        ports: new Map()
      })
    }
    const clientEntry = ruleEntry.clients.get(clientIP)
    if (!clientEntry) continue
    clientEntry.data.connections++
    clientEntry.data.traffic += traffic

    if (!clientEntry.ports.has(sourcePort)) {
      clientEntry.ports.set(sourcePort, {
        id: `port-${group}-${proxy}-${fullRule}-${clientIP}-${sourcePort}`,
        name: sourcePort,
        type: 'port',
        connections: 0,
        traffic: 0
      })
    }
    const portNode = clientEntry.ports.get(sourcePort)
    if (!portNode) continue
    portNode.connections++
    portNode.traffic += traffic
  }

  // Convert to tree with collapse state
  const rootChildren: TopologyNodeData[] = []

  function applyCollapse(node: TopologyNodeData, defaultCollapsed = false): TopologyNodeData {
    const isCollapsed = collapsedNodes.has(node.id) || defaultCollapsed
    if (isCollapsed && node.children && node.children.length > 0) {
      return { ...node, _children: node.children, children: undefined, collapsed: true }
    }
    return { ...node, collapsed: false }
  }

  groupsMap.forEach((groupEntry) => {
    const groupChildren: TopologyNodeData[] = []
    const groupNode: TopologyNodeData = { ...groupEntry.data, children: groupChildren }

    groupEntry.proxies.forEach((proxyEntry) => {
      const proxyChildren: TopologyNodeData[] = []
      const proxyNode: TopologyNodeData = { ...proxyEntry.data, children: proxyChildren }

      proxyEntry.rules.forEach((ruleEntry) => {
        const ruleChildren: TopologyNodeData[] = []
        const ruleNode: TopologyNodeData = { ...ruleEntry.data, children: ruleChildren }

        ruleEntry.clients.forEach((clientEntry) => {
          const portChildren = Array.from(clientEntry.ports.values())
          const isClientCollapsed = !collapsedNodes.has(`expanded-${clientEntry.data.id}`)
          const clientNode: TopologyNodeData = isClientCollapsed
            ? { ...clientEntry.data, _children: portChildren, children: undefined, collapsed: true }
            : { ...clientEntry.data, children: portChildren, collapsed: false }
          ruleChildren.push(clientNode)
        })

        const isRuleCollapsed = !collapsedNodes.has(`expanded-${ruleEntry.data.id}`)
        if (isRuleCollapsed && ruleChildren.length > 0) {
          ruleNode._children = ruleChildren
          ruleNode.children = undefined
          ruleNode.collapsed = true
        } else {
          ruleNode.collapsed = false
        }
        proxyChildren.push(ruleNode)
      })

      groupChildren.push(applyCollapse(proxyNode))
    })

    rootChildren.push(applyCollapse(groupNode))
  })

  return {
    id: 'root',
    name: 'Connections',
    type: 'root',
    connections: connections.length,
    traffic: connections.reduce((s, c) => s + c.download + c.upload, 0),
    children: rootChildren
  }
}

// ─── Text measurement ─────────────────────────────────────────────────────────

let measureCanvas: HTMLCanvasElement | null = null
function getTextWidth(text: string, font = '600 11px sans-serif'): number {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.length * 7
  ctx.font = font
  return ctx.measureText(text).width
}

// ─── Particle flow ────────────────────────────────────────────────────────────

interface LinkSeg {
  sx: number
  sy: number
  c1x: number
  c1y: number
  c2x: number
  c2y: number
  tx: number
  ty: number
  count: number
  traffic: number
  colorType: NodeType
}

function cubicPoint(seg: LinkSeg, t: number): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * seg.sx + b * seg.c1x + c * seg.c2x + d * seg.tx,
    a * seg.sy + b * seg.c1y + c * seg.c2y + d * seg.ty
  ]
}

// canvas 2D 不解析 CSS 变量，需读取计算后的 HSL 三元组
function cssVarColor(type: NodeType): string {
  if (type === 'root') return 'hsl(0 0% 50%)'
  const varNames: Record<Exclude<NodeType, 'root'>, string> = {
    client: '--heroui-primary',
    port: '--heroui-warning',
    rule: '--heroui-secondary',
    group: '--heroui-success',
    proxy: '--heroui-danger'
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varNames[type]).trim()
  return `hsl(${raw})`
}

// ─── Main component ───────────────────────────────────────────────────────────

const NetworkTopologyCard: React.FC = () => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const linksRef = useRef<LinkSeg[]>([])

  const [connections, setConnections] = useState<IMihomoConnectionDetail[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const frozenRef = useRef<IMihomoConnectionDetail[] | null>(null)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())

  const { appConfig } = useAppConfig()
  const disableAnimations = appConfig?.disableAnimations ?? false
  const [particlesOn, setParticlesOn] = useState(
    () => localStorage.getItem('network-topology-particles') !== '0'
  )
  const particlesEnabled = particlesOn && !disableAnimations

  const toggleParticles = useCallback((): void => {
    setParticlesOn((prev) => {
      localStorage.setItem('network-topology-particles', prev ? '0' : '1')
      return !prev
    })
  }, [])

  const resizeCanvas = useCallback((): void => {
    const canvas = canvasRef.current
    const svgEl = svgRef.current
    if (!canvas || !svgEl) return
    const w = parseFloat(svgEl.getAttribute('width') || '0')
    const h = parseFloat(svgEl.getAttribute('height') || '0')
    if (!w || !h) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
  }, [])

  // IPC listener
  useEffect(() => {
    if (isPaused) return
    const handler = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as IMihomoConnectionsInfo
      setConnections(info.connections ?? [])
    }
    return window.electron.ipcRenderer.on('mihomoConnections', handler)
  }, [isPaused])

  const currentConnections = isPaused && frozenRef.current ? frozenRef.current : connections

  // Stats
  const stats = useMemo(() => {
    const clients = new Set<string>()
    const rules = new Set<string>()
    const groups = new Set<string>()
    const proxies = new Set<string>()
    for (const c of currentConnections) {
      clients.add(c.metadata.sourceIP || 'Unknown')
      rules.add(c.rule || 'Direct')
      const ch = c.chains || []
      proxies.add(ch[0] ?? 'Direct')
      groups.add(ch.length > 1 ? (ch[1] ?? 'Direct') : (ch[0] ?? 'Direct'))
    }
    return {
      clientCount: clients.size,
      ruleCount: rules.size,
      groupCount: groups.size,
      proxyCount: proxies.size,
      totalTraffic: currentConnections.reduce((s, c) => s + c.download + c.upload, 0)
    }
  }, [currentConnections])

  // Hierarchy data
  const hierarchyData = useMemo(
    () => buildHierarchy(currentConnections, collapsedNodes),
    [currentConnections, collapsedNodes]
  )

  // Toggle collapse
  const toggleCollapseRef = useRef<(nodeId: string, isCollapsed: boolean) => void>(() => {})
  toggleCollapseRef.current = useCallback((nodeId: string, isCurrentlyCollapsed: boolean) => {
    const expandedKey = `expanded-${nodeId}`
    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (isCurrentlyCollapsed) {
        if (nodeId.startsWith('rule-') || nodeId.startsWith('client-')) {
          next.add(expandedKey)
        } else {
          next.delete(nodeId)
        }
      } else {
        if (nodeId.startsWith('rule-') || nodeId.startsWith('client-')) {
          next.delete(expandedKey)
        } else {
          next.add(nodeId)
        }
      }
      return next
    })
  }, [])

  // D3 render
  useEffect(() => {
    const svgEl = svgRef.current
    const containerEl = containerRef.current
    if (!svgEl || !containerEl) return
    if (!hierarchyData.children || hierarchyData.children.length === 0) {
      d3.select(svgEl).selectAll('*').remove()
      linksRef.current = []
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    d3.select(svgEl).selectAll('*').remove()

    const nodeHeight = 30
    const nodePaddingX = 16
    const nodeSpacingY = 50
    const levelGap = 40
    const topPadding = 25

    const root = d3.hierarchy(hierarchyData)
    const containerWidth = containerEl.clientWidth

    const treeLayout = d3
      .tree<TopologyNodeData>()
      .nodeSize([nodeSpacingY, 100])
      .separation(() => 1)

    treeLayout(root)

    // Calculate node widths
    const nodeWidths = new Map<string, number>()
    for (const d of root.descendants()) {
      if (d.data.type !== 'root') {
        const textWidth = getTextWidth(d.data.name)
        const hasChildren =
          (d.data.children && d.data.children.length > 0) ||
          (d.data._children && d.data._children.length > 0)
        nodeWidths.set(d.data.id, textWidth + nodePaddingX * 2 + (hasChildren ? 20 : 0))
      }
    }

    const getNodeWidth = (d: d3.HierarchyNode<TopologyNodeData>) => nodeWidths.get(d.data.id) ?? 80

    // Max width per depth
    const maxWidthPerLevel = new Map<number, number>()
    root.descendants().forEach((d) => {
      if (d.data.type !== 'root') {
        const w = getNodeWidth(d)
        maxWidthPerLevel.set(d.depth, Math.max(maxWidthPerLevel.get(d.depth) ?? 0, w))
      }
    })

    // Cumulative x offsets
    const levelXOffset = new Map<number, number>()
    let cumX = 0
    for (let depth = 1; depth <= maxWidthPerLevel.size; depth++) {
      const curW = maxWidthPerLevel.get(depth) ?? 100
      if (depth === 1) {
        cumX = curW / 2
      } else {
        const prevW = maxWidthPerLevel.get(depth - 1) ?? 100
        cumX += prevW / 2 + levelGap + curW / 2
      }
      levelXOffset.set(depth, cumX)
    }

    root.descendants().forEach((d) => {
      if (d.data.type !== 'root' && d.depth > 0) {
        d.y = levelXOffset.get(d.depth) ?? d.y
      }
    })

    // Bounds
    let minX = Infinity
    let maxX = -Infinity
    root.each((d) => {
      if ((d.x ?? 0) < minX) minX = d.x ?? 0
      if ((d.x ?? 0) > maxX) maxX = d.x ?? 0
    })

    const treeHeight = maxX - minX + nodeSpacingY
    const actualHeight = Math.max(400, treeHeight + topPadding + 40)

    let maxY = 0
    root.each((d) => {
      if (d.data.type !== 'root') {
        const rightEdge = (d.y ?? 0) + getNodeWidth(d) / 2
        if (rightEdge > maxY) maxY = rightEdge
      }
    })
    const actualWidth = Math.max(containerWidth, maxY + 60 + 40)

    const svg = d3.select(svgEl).attr('width', actualWidth).attr('height', actualHeight)

    const g = svg
      .append('g')
      .attr('transform', `translate(60, ${-minX + nodeSpacingY / 2 + topPadding})`)

    const colors = getNodeColors()

    // Links
    const visibleLinks = root.links().filter((l) => l.source.data.type !== 'root')
    g.selectAll('.link')
      .data(visibleLinks)
      .join('path')
      .attr('class', 'link')
      .attr('d', (d) => {
        const src = d.source as d3.HierarchyPointNode<TopologyNodeData>
        const tgt = d.target as d3.HierarchyPointNode<TopologyNodeData>
        const sx = src.y + getNodeWidth(src) / 2
        const sy = src.x
        const tx = tgt.y - getNodeWidth(tgt) / 2
        const ty = tgt.x
        const mx = (sx + tx) / 2
        return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`
      })
      .attr('fill', 'none')
      .style('stroke', colors.baseContent)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', (d) => Math.max(1, Math.min(4, d.target.data.connections / 5)))

    // 粒子层几何：与 link 贝塞尔曲线一致，由 rAF 循环采样
    linksRef.current = visibleLinks.map((l) => {
      const src = l.source as d3.HierarchyPointNode<TopologyNodeData>
      const tgt = l.target as d3.HierarchyPointNode<TopologyNodeData>
      const sx = src.y + getNodeWidth(src) / 2
      const sy = src.x
      const tx = tgt.y - getNodeWidth(tgt) / 2
      const ty = tgt.x
      const mx = (sx + tx) / 2
      return {
        sx,
        sy,
        c1x: mx,
        c1y: sy,
        c2x: mx,
        c2y: ty,
        tx,
        ty,
        count: tgt.data.connections,
        traffic: tgt.data.traffic,
        colorType: tgt.data.type
      }
    })
    resizeCanvas()

    // Nodes
    const nodes = g
      .selectAll('.node')
      .data(root.descendants().filter((d) => d.data.type !== 'root'))
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.y ?? 0},${d.x})`)
      .style('cursor', (d) => {
        const hasChildren =
          (d.data.children && d.data.children.length > 0) ||
          (d.data._children && d.data._children.length > 0)
        return hasChildren ? 'pointer' : 'default'
      })
      .on('click', (_event, d) => {
        const hasChildren =
          (d.data.children && d.data.children.length > 0) ||
          (d.data._children && d.data._children.length > 0)
        if (hasChildren) {
          toggleCollapseRef.current(d.data.id, d.data.collapsed ?? false)
        }
      })

    // Connection count badge
    nodes
      .append('text')
      .attr('dy', -nodeHeight / 2 - 4)
      .attr('text-anchor', 'middle')
      .style('fill', (d) => colors[d.data.type].fill)
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .text((d) => `${d.data.connections}`)

    // Node rect
    nodes
      .append('rect')
      .attr('x', (d) => -getNodeWidth(d) / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', (d) => getNodeWidth(d))
      .attr('height', nodeHeight)
      .attr('rx', 6)
      .style('fill', (d) => colors[d.data.type].bg)
      .style('stroke', (d) => colors[d.data.type].fill)
      .attr('stroke-width', 2)

    // Collapse indicator
    nodes
      .filter((d) =>
        Boolean(
          (d.data.children && d.data.children.length > 0) ||
          (d.data._children && d.data._children.length > 0)
        )
      )
      .append('text')
      .attr('x', (d) => getNodeWidth(d) / 2 - 12)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .style('fill', (d) => colors[d.data.type].fill)
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text((d) => (d.data.collapsed ? '+' : '−'))

    // Label
    nodes
      .append('text')
      .attr('dy', '0.31em')
      .attr('text-anchor', 'middle')
      .style('fill', (d) => colors[d.data.type].fill)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text((d) => d.data.name)

    // Tooltip
    nodes
      .append('title')
      .text(
        (d) => `${d.data.name}\n${d.data.connections} connections\n${calcTraffic(d.data.traffic)}`
      )
  }, [hierarchyData, resolvedTheme, resizeCanvas])

  // 粒子流：canvas 覆盖层，按连接数决定密度、按流量决定速度
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (!particlesEnabled) {
      linksRef.current = []
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    const colors: Partial<Record<NodeType, string>> = {}
    const colorOf = (type: NodeType): string => {
      let color = colors[type]
      if (!color) {
        color = cssVarColor(type)
        colors[type] = color
      }
      return color
    }
    const dpr = window.devicePixelRatio || 1
    let raf = 0
    let last = performance.now()
    const phases: number[] = []
    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const segs = linksRef.current
      if (segs.length === 0) {
        ctx.clearRect(0, 0, w, h)
        return
      }
      // 暂停时保留最后一帧，冻结画面
      if (isPaused) return
      ctx.clearRect(0, 0, w, h)
      segs.forEach((seg, i) => {
        if (phases[i] === undefined) phases[i] = (i * 0.37) % 1
        const speed = 0.1 + Math.log10(1 + seg.traffic) * 0.12
        phases[i] = (phases[i] + speed * dt) % 1
        const dots = Math.min(4, Math.max(1, Math.round(seg.count / 3)))
        const color = colorOf(seg.colorType)
        ctx.fillStyle = color
        for (let k = 0; k < dots; k++) {
          const t = (phases[i] + k / dots) % 1
          const [x, y] = cubicPoint(seg, t)
          const fade = Math.sin(Math.PI * t)
          const [bx, by] = cubicPoint(seg, Math.max(0, t - 0.035))
          ctx.globalAlpha = 0.22 * fade
          ctx.beginPath()
          ctx.arc(bx, by, 3.2, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 0.8 * fade
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return (): void => cancelAnimationFrame(raf)
  }, [particlesEnabled, isPaused, resolvedTheme])

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      // Re-trigger render by forcing a state touch isn't ideal;
      // instead just re-run the render imperatively
      if (svgRef.current && containerRef.current) {
        svgRef.current.setAttribute('width', String(containerRef.current.clientWidth))
      }
      resizeCanvas()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [resizeCanvas])

  const togglePause = useCallback(() => {
    if (isPaused) {
      frozenRef.current = null
    } else {
      frozenRef.current = [...connections]
    }
    setIsPaused((p) => !p)
  }, [isPaused, connections])

  return (
    <div className="rounded-xl border border-foreground/10 bg-content1 p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
            <IoGitNetworkOutline size={18} />
          </div>
          <h3 className="text-[15px] font-semibold">{t('network.topology.title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats */}
          <div className="hidden flex-wrap gap-x-2 text-[12px] text-foreground/50 sm:flex">
            <span>
              {stats.clientCount} {t('network.topology.clients')}
            </span>
            <span>·</span>
            <span>
              {stats.ruleCount} {t('network.topology.rules')}
            </span>
            <span>·</span>
            <span>
              {stats.groupCount} {t('network.topology.groups')}
            </span>
            <span>·</span>
            <span>
              {stats.proxyCount} {t('network.topology.nodes')}
            </span>
            <span>·</span>
            <span>{calcTraffic(stats.totalTraffic)}</span>
          </div>
          <Button
            size="sm"
            isIconOnly
            variant="light"
            onPress={toggleParticles}
            className={`h-7 w-7 min-w-0 ${particlesEnabled ? 'text-primary' : ''}`}
            title={t('network.topology.particles')}
          >
            <IoSparkles size={16} />
          </Button>
          <Button
            size="sm"
            isIconOnly
            variant="light"
            onPress={togglePause}
            className={`h-7 w-7 min-w-0 ${isPaused ? 'text-warning' : ''}`}
            title={isPaused ? t('network.topology.resume') : t('network.topology.pause')}
          >
            {isPaused ? <IoPlayOutline size={16} /> : <IoPauseOutline size={16} />}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-foreground/60">
        <span className="flex items-center gap-1">
          <IoGitNetworkOutline className="text-success" size={13} />
          {t('network.topology.proxyGroups')}
        </span>
        <span className="flex items-center gap-1">
          <IoServerOutline className="text-danger" size={13} />
          {t('network.topology.proxyNodes')}
        </span>
        <span className="flex items-center gap-1">
          <IoFunnelOutline className="text-secondary" size={13} />
          {t('network.topology.rules')}
        </span>
        <span className="flex items-center gap-1">
          <IoDesktopOutline className="text-primary" size={13} />
          {t('network.topology.sourceIP')}
        </span>
        <span className="flex items-center gap-1">
          <MdTag className="text-warning" size={13} />
          {t('network.topology.sourcePort')}
        </span>
      </div>

      {/* Empty state */}
      {currentConnections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-foreground/40">
          <IoGitNetworkOutline size={32} className="mb-2 animate-pulse" />
          <span className="text-sm">{t('network.topology.waiting')}</span>
        </div>
      ) : (
        <div ref={containerRef} className="overflow-x-auto touch-pan-x touch-pan-y">
          <div className="relative">
            <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />
            <svg ref={svgRef} className="relative" style={{ minHeight: '400px' }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default NetworkTopologyCard
