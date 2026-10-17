/**
 * 把一条连接的元数据翻译成「为什么走这里」的结论。
 *
 * 这里只做纯推导，返回码值而不是文案：同一份结果既要喂给 UI 的 i18n，也要能直接进单测。
 * 所有判断都只依赖 /connections 已经返回的字段（rule / rulePayload / chains / metadata），
 * 不额外请求内核，因此可以随连接列表实时刷新。
 */

export type ConnectionExplainVerdict = 'proxied' | 'direct' | 'rejected' | 'unknown'

export type ConnectionExplainSeverity = 'ok' | 'info' | 'warning' | 'critical'

export type ConnectionExplainFindingCode =
  | 'fakeIpNoSniff'
  | 'domainMissing'
  | 'sniffHostRecovered'
  | 'matchFallback'
  | 'privateThroughProxy'
  | 'processUnknown'
  | 'specialRules'
  | 'emptyChain'

export interface ConnectionExplainFinding {
  code: ConnectionExplainFindingCode
  severity: Exclude<ConnectionExplainSeverity, 'ok'>
  params?: Record<string, string>
}

export interface ConnectionExplainResult {
  verdict: ConnectionExplainVerdict
  severity: ConnectionExplainSeverity
  /** 展示用的目标：优先域名，其次目标 IP */
  target: string
  domain: string
  rule: string
  rulePayload: string
  /** 命中规则之后经过的策略组，由外到内（不含最终节点） */
  policies: string[]
  outbound: string
  findings: ConnectionExplainFinding[]
}

const SEVERITY_WEIGHT: Record<ConnectionExplainSeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  critical: 3
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

const PRIVATE_IPV4_PREFIXES = ['0.', '10.', '127.', '169.254.', '192.168.']

/** 判断字符串是否是 IP 字面量（而不是域名）。 */
export function isIpLiteral(value: string): boolean {
  if (!value) return false
  if (value.includes(':')) return true
  const matched = IPV4.exec(value)
  return !!matched && matched.slice(1).every((part) => Number(part) <= 255)
}

/** 判断是否落在 mihomo 默认 fake-ip 段（198.18.0.0/15）。 */
export function isFakeIp(value: string): boolean {
  const matched = IPV4.exec(value)
  if (!matched) return false
  return matched[1] === '198' && (matched[2] === '18' || matched[2] === '19')
}

/** 判断是否内网 / 回环 / 链路本地 / 运营商级 NAT 地址。 */
export function isPrivateAddress(value: string): boolean {
  if (!value) return false
  if (value.includes(':')) {
    const lower = value.toLowerCase()
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    )
  }
  if (PRIVATE_IPV4_PREFIXES.some((prefix) => value.startsWith(prefix))) return true
  const matched = IPV4.exec(value)
  if (!matched) return false
  const first = Number(matched[1])
  const second = Number(matched[2])
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  return false
}

/**
 * 推导一条连接的出口与告警。
 *
 * chains 的顺序是「内层在前」：chains[0] 是最终节点，末尾是最外层策略组，
 * 所以策略链要取 slice(1) 再反转，才能拼成 `GLOBAL >> Proxy` 这样的由外到内顺序。
 */
export function explainConnection(info: IMihomoConnectionDetail): ConnectionExplainResult {
  const meta = info.metadata
  const chains = Array.isArray(info.chains) ? info.chains.filter(Boolean) : []
  const outbound = chains[0] ?? ''
  const head = outbound.toUpperCase()
  const verdict: ConnectionExplainVerdict = !outbound
    ? 'unknown'
    : head === 'DIRECT'
      ? 'direct'
      : head.startsWith('REJECT')
        ? 'rejected'
        : 'proxied'

  const host = meta.host ?? ''
  const sniffHost = meta.sniffHost ?? ''
  const destinationIP = meta.destinationIP ?? ''
  const hostIsDomain = !!host && !isIpLiteral(host)
  const domain = hostIsDomain ? host : sniffHost
  const target = domain || destinationIP || meta.remoteDestination || ''

  const findings: ConnectionExplainFinding[] = []

  if (!domain) {
    findings.push(
      isFakeIp(destinationIP)
        ? { code: 'fakeIpNoSniff', severity: 'critical', params: { ip: destinationIP } }
        : { code: 'domainMissing', severity: 'info' }
    )
  } else if (!hostIsDomain) {
    // 域名只在 sniffer 阶段才拿到，说明 DNS 侧给的是 IP，域名类规则本可以更早命中
    findings.push({ code: 'sniffHostRecovered', severity: 'info' })
  }

  if (/^match$/i.test(info.rule ?? '')) findings.push({ code: 'matchFallback', severity: 'info' })

  if (isPrivateAddress(destinationIP) && verdict === 'proxied') {
    findings.push({
      code: 'privateThroughProxy',
      severity: 'warning',
      params: { ip: destinationIP }
    })
  }

  if (!meta.process) findings.push({ code: 'processUnknown', severity: 'info' })

  if (meta.specialRules) {
    findings.push({
      code: 'specialRules',
      severity: 'warning',
      params: { rules: meta.specialRules }
    })
  }

  if (!outbound) findings.push({ code: 'emptyChain', severity: 'warning' })

  findings.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])

  return {
    verdict,
    severity: findings[0]?.severity ?? 'ok',
    target,
    domain,
    rule: info.rule ?? '',
    rulePayload: info.rulePayload ?? '',
    policies: chains.slice(1).reverse(),
    outbound,
    findings
  }
}
