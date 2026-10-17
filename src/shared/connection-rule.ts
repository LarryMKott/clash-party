/**
 * 从一条连接推导「以后都这样走」的候选规则。
 *
 * 连接里能拿来当匹配条件的东西只有四样：完整域名、注册域后缀、进程名、目标 IP。
 * 这里把它们按「精确度从高到低」排好，交给用户选一条，再拼上出口组成完整规则。
 */

export type RuleCandidateKind = 'domain' | 'suffix' | 'process' | 'ip'

export interface RuleCandidate {
  kind: RuleCandidateKind
  /** 规则类型，如 DOMAIN / DOMAIN-SUFFIX / PROCESS-NAME / IP-CIDR */
  type: string
  payload: string
  /** 已拼好的规则片段，不含出口（如 `DOMAIN-SUFFIX,openai.com`） */
  rule: string
}

// 常见的二级后缀，避免把 a.b.co.uk 收敛成 co.uk
const TWO_LEVEL_SUFFIXES = new Set([
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'com.hk',
  'com.tw',
  'com.mo',
  'co.uk',
  'org.uk',
  'gov.uk',
  'co.jp',
  'co.kr',
  'com.au',
  'com.sg',
  'com.my',
  'com.br',
  'com.ru',
  'co.in',
  'co.nz',
  'co.za'
])

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function isIpLiteral(value: string): boolean {
  if (!value) return false
  if (value.includes(':')) return true
  const matched = IPV4.exec(value)
  return !!matched && matched.slice(1).every((part) => Number(part) <= 255)
}

/** fake-ip（198.18.0.0/15）与内网地址不适合拿来写 IP 规则。 */
export function isUselessIp(value: string): boolean {
  if (!value) return true
  if (value.includes(':')) {
    const lower = value.toLowerCase()
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd')
  }
  const matched = IPV4.exec(value)
  if (!matched) return true
  const first = Number(matched[1])
  const second = Number(matched[2])
  if (first === 198 && (second === 18 || second === 19)) return true
  if (['0', '10', '127', '169'].includes(matched[1])) return true
  if (first === 192 && second === 168) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  return false
}

/** 取注册域：api.openai.com → openai.com，a.b.co.uk → b.co.uk */
export function registeredDomain(host: string): string {
  const labels = host.split('.').filter(Boolean)
  if (labels.length <= 2) return host
  const lastTwo = labels.slice(-2).join('.').toLowerCase()
  if (TWO_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }
  return labels.slice(-2).join('.')
}

/**
 * 候选顺序即推荐顺序：整站后缀 → 精确域名 → 进程 → 目标 IP。
 * 后缀排第一是因为「以后都走这里」通常想要的是整站，而不是单个子域。
 */
export function buildRuleCandidates(connection: IMihomoConnectionDetail): RuleCandidate[] {
  const meta = connection.metadata
  const host = isIpLiteral(meta.host ?? '') ? (meta.sniffHost ?? '') : (meta.host ?? '')
  const candidates: RuleCandidate[] = []

  if (host && !isIpLiteral(host)) {
    const suffix = registeredDomain(host)
    if (suffix !== host) {
      candidates.push({
        kind: 'suffix',
        type: 'DOMAIN-SUFFIX',
        payload: suffix,
        rule: `DOMAIN-SUFFIX,${suffix}`
      })
    }
    candidates.push({
      kind: 'domain',
      type: 'DOMAIN',
      payload: host,
      rule: `DOMAIN,${host}`
    })
  }

  const process = meta.process ?? ''
  if (process) {
    candidates.push({
      kind: 'process',
      type: 'PROCESS-NAME',
      payload: process,
      rule: `PROCESS-NAME,${process}`
    })
  }

  const ip = meta.destinationIP ?? ''
  if (ip && !isUselessIp(ip)) {
    const type = ip.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'
    const cidr = ip.includes(':') ? `${ip}/128` : `${ip}/32`
    candidates.push({ kind: 'ip', type, payload: cidr, rule: `${type},${cidr}` })
  }

  return candidates
}

export function composeRule(candidate: RuleCandidate, target: string): string {
  return `${candidate.rule},${target}`
}
