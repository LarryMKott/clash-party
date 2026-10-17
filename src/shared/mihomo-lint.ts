/**
 * mihomo 配置的语义校验。
 *
 * 编辑器里已经接了 meta-json-schema（`base-editor.tsx`），但 JSON Schema 只能描述
 * 单个字段的形状，管不到「这条规则引用的策略组根本不存在」这类跨字段问题——
 * 而那恰好是内核起不来的头号原因。这里补的是这一层。
 *
 * 只依赖 yaml 的 AST，不读文件、不联网，纯函数，便于单测与复用。
 */
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml'
import type { Node, YAMLMap, YAMLSeq } from 'yaml'

export type MihomoLintSeverity = 'error' | 'warning' | 'info'

export type MihomoLintCode =
  | 'yamlSyntax'
  | 'rootNotMapping'
  | 'ruleTargetMissing'
  | 'groupTargetMissing'
  | 'unknownRuleType'
  | 'ruleSetMissing'
  | 'unreachableRule'
  | 'duplicateRule'
  | 'duplicateProxy'
  | 'duplicateGroup'
  | 'emptyGroup'
  | 'portConflict'
  | 'missingMatch'

export interface MihomoLintIssue {
  code: MihomoLintCode
  severity: MihomoLintSeverity
  /** 1 起始的行号，取不到时为 0 */
  line: number
  params: Record<string, string | number>
}

export interface MihomoLintResult {
  issues: MihomoLintIssue[]
  counts: { error: number; warning: number; info: number }
}

const SEVERITY_RANK: Record<MihomoLintSeverity, number> = { error: 0, warning: 1, info: 2 }

const MAX_ISSUES = 200

const BUILTIN_TARGETS = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE'])

const RULE_MODIFIERS = new Set(['NO-RESOLVE', 'SRC'])

const KNOWN_RULE_TYPES = new Set([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-REGEX',
  'DOMAIN-WILDCARD',
  'GEOSITE',
  'GEOIP',
  'SRC-GEOIP',
  'IP-CIDR',
  'IP-CIDR6',
  'IPCIDR',
  'SRC-IP-CIDR',
  'SRC-IPCIDR',
  'IP-SUFFIX',
  'SRC-IP-SUFFIX',
  'IP-ASN',
  'SRC-IP-ASN',
  'PROCESS-NAME',
  'PROCESS-PATH',
  'PROCESS-NAME-REGEX',
  'PROCESS-PATH-REGEX',
  'UID',
  'NETWORK',
  'DSCP',
  'RULE-SET',
  'AND',
  'OR',
  'NOT',
  'SUB-RULE',
  'IN-TYPE',
  'IN-USER',
  'IN-NAME',
  'IN-PORT',
  'DST-PORT',
  'SRC-PORT',
  'MATCH'
])

// override 文件用 "+rules" / "rules+" 表示前后插入，校验时要一起看
const PROXY_KEYS = ['proxies', '+proxies', 'proxies+']
const GROUP_KEYS = ['proxy-groups', '+proxy-groups', 'proxy-groups+']
const RULE_KEYS = ['rules', '+rules', 'rules+']
const PORT_KEYS = ['mixed-port', 'port', 'socks-port', 'redir-port', 'tproxy-port']

function scalarValue(node: unknown): string {
  if (isScalar(node)) {
    const value = node.value
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function lineOf(lineCounter: LineCounter, node: unknown): number {
  const range = (node as Node | null | undefined)?.range
  if (!range) return 0
  return lineCounter.linePos(range[0]).line
}

function collectSeqs(root: YAMLMap, keys: string[]): YAMLSeq[] {
  const result: YAMLSeq[] = []
  for (const key of keys) {
    const node = root.get(key, true)
    if (isSeq(node)) result.push(node)
  }
  return result
}

function namedEntries(seqs: YAMLSeq[], lineCounter: LineCounter): { name: string; line: number }[] {
  const entries: { name: string; line: number }[] = []
  for (const seq of seqs) {
    for (const item of seq.items) {
      if (!isMap(item)) continue
      const name = scalarValue(item.get('name', true))
      if (name) entries.push({ name, line: lineOf(lineCounter, item) })
    }
  }
  return entries
}

function ruleParts(raw: string): string[] {
  return raw.split(',').map((part) => part.trim())
}

/** 规则的目标在最后一段，需要跳过多出来的修饰符（no-resolve / src）。 */
function ruleTarget(parts: string[]): string {
  for (let i = parts.length - 1; i >= 1; i--) {
    const token = parts[i]
    if (!token) continue
    if (RULE_MODIFIERS.has(token.toUpperCase())) continue
    return token
  }
  return ''
}

function emptyCounts(): MihomoLintResult['counts'] {
  return { error: 0, warning: 0, info: 0 }
}

export function lintMihomoConfig(source: string): MihomoLintResult {
  if (!source.trim()) return { issues: [], counts: emptyCounts() }

  const lineCounter = new LineCounter()
  const doc = parseDocument(source, { lineCounter, uniqueKeys: false })
  const issues: MihomoLintIssue[] = []

  const push = (
    code: MihomoLintCode,
    severity: MihomoLintSeverity,
    line: number,
    params: Record<string, string | number> = {}
  ): void => {
    if (issues.length >= MAX_ISSUES) return
    issues.push({ code, severity, line, params })
  }

  if (doc.errors.length > 0) {
    const error = doc.errors[0]
    const line = error.linePos?.[0]?.line ?? 1
    push('yamlSyntax', 'error', line, { message: error.message.split('\n')[0] })
    // 语法都不对，后面的语义检查没有意义
    return { issues, counts: tally(issues) }
  }

  const root = doc.contents
  if (!isMap(root)) {
    push('rootNotMapping', 'error', lineOf(lineCounter, root), {})
    return { issues, counts: tally(issues) }
  }

  const proxies = namedEntries(collectSeqs(root, PROXY_KEYS), lineCounter)
  const groups = namedEntries(collectSeqs(root, GROUP_KEYS), lineCounter)

  const providerNames: string[] = []
  const providersNode = root.get('proxy-providers', true)
  if (isMap(providersNode)) {
    for (const pair of providersNode.items) {
      const name = scalarValue(pair.key)
      if (name) providerNames.push(name)
    }
  }

  const ruleProviderNames: string[] = []
  const ruleProvidersNode = root.get('rule-providers', true)
  if (isMap(ruleProvidersNode)) {
    for (const pair of ruleProvidersNode.items) {
      const name = scalarValue(pair.key)
      if (name) ruleProviderNames.push(name)
    }
  }

  const nameSet = new Set<string>([
    ...proxies.map((entry) => entry.name),
    ...groups.map((entry) => entry.name),
    ...providerNames,
    ...BUILTIN_TARGETS
  ])

  // —— 节点与策略组 ——
  const seenProxy = new Map<string, number>()
  for (const entry of proxies) {
    const first = seenProxy.get(entry.name)
    if (first === undefined) {
      seenProxy.set(entry.name, entry.line)
      continue
    }
    push('duplicateProxy', 'warning', entry.line, { name: entry.name })
  }

  const seenGroup = new Map<string, number>()
  for (const entry of groups) {
    const first = seenGroup.get(entry.name)
    if (first === undefined) {
      seenGroup.set(entry.name, entry.line)
      continue
    }
    push('duplicateGroup', 'warning', entry.line, { name: entry.name })
  }

  for (const seq of collectSeqs(root, GROUP_KEYS)) {
    for (const item of seq.items) {
      if (!isMap(item)) continue
      const groupName = scalarValue(item.get('name', true)) || '?'
      const targets = item.get('proxies', true)
      if (!isSeq(targets) || targets.items.length === 0) {
        push('emptyGroup', 'warning', lineOf(lineCounter, item), { group: groupName })
        continue
      }
      for (const target of targets.items) {
        const name = scalarValue(target)
        if (!name || nameSet.has(name)) continue
        push('groupTargetMissing', 'error', lineOf(lineCounter, target), {
          group: groupName,
          target: name
        })
      }
    }
  }

  // —— 规则 ——
  // override 片段只用 "+rules" / "rules+"，此时不该按「完整配置必须收尾于 MATCH」来要求
  const hasPlainRules = isSeq(root.get('rules', true))
  let sawMatch = false
  let reportedUnreachable = false
  const seenRule = new Map<string, number>()

  for (const seq of collectSeqs(root, RULE_KEYS)) {
    seq.items.forEach((item, index) => {
      const raw = scalarValue(item)
      if (!raw) return
      const line = lineOf(lineCounter, item)
      const parts = ruleParts(raw)
      const type = parts[0].toUpperCase()

      if (!KNOWN_RULE_TYPES.has(type)) {
        push('unknownRuleType', 'warning', line, { type: parts[0], rule: raw })
      }

      if (sawMatch && !reportedUnreachable) {
        reportedUnreachable = true
        push('unreachableRule', 'warning', line, { rule: index + 1 })
      }

      const dedupeKey = parts.filter((part) => !RULE_MODIFIERS.has(part.toUpperCase())).join(',')
      const firstLine = seenRule.get(dedupeKey)
      if (firstLine === undefined) {
        seenRule.set(dedupeKey, line)
      } else {
        push('duplicateRule', 'warning', line, { line: firstLine })
      }

      if (type === 'MATCH') {
        sawMatch = true
      } else if (type === 'RULE-SET') {
        const provider = parts[1]
        // rule-providers 为空时不判，避免把 override 片段误判成错误
        if (provider && ruleProviderNames.length > 0 && !ruleProviderNames.includes(provider)) {
          push('ruleSetMissing', 'error', line, { provider })
        }
      }

      const target = ruleTarget(parts)
      // 没有定义任何节点/组/provider 时（override 片段），无从判断引用是否存在
      if (target && nameSet.size > BUILTIN_TARGETS.size && !nameSet.has(target)) {
        push('ruleTargetMissing', 'error', line, { target, rule: index + 1 })
      }
    })
  }

  if (hasPlainRules && seenRule.size > 0 && !sawMatch) {
    push('missingMatch', 'info', 0, {})
  }

  // —— 端口 ——
  const ports: { key: string; value: number }[] = []
  for (const key of PORT_KEYS) {
    const value = Number(scalarValue(root.get(key, true)))
    if (value > 0) ports.push({ key, value })
  }
  const portOwners = new Map<number, string[]>()
  for (const port of ports) {
    portOwners.set(port.value, [...(portOwners.get(port.value) ?? []), port.key])
  }
  for (const [value, owners] of portOwners) {
    if (owners.length < 2) continue
    push('portConflict', 'error', 0, { port: value, keys: owners.join(' / ') })
  }

  issues.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return a.line - b.line
  })

  return { issues, counts: tally(issues) }
}

function tally(issues: MihomoLintIssue[]): MihomoLintResult['counts'] {
  const counts = emptyCounts()
  for (const issue of issues) counts[issue.severity] += 1
  return counts
}
