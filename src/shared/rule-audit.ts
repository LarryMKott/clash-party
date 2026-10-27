/**
 * 规则体检：静态找出「永远不可能生效」的规则，动态找出「跑了一阵子一次都没命中」的规则。
 *
 * mihomo 的规则从上往下匹配、第一条命中即结束，所以一条规则如果被前面的规则完全覆盖，
 * 它后面的存在纯属自我安慰——用户加的分流规则不生效，最常见的原因就是这个。
 * 这里只做保守推断：拿不准的关系（GEOSITE / RULE-SET / REGEX / 端口类）一律不下结论。
 */

export type RuleShadowKind =
  'catchAll' | 'duplicate' | 'domainSuffix' | 'domainExact' | 'domainKeyword' | 'ipCidr'

export interface IRuleLike {
  type: string
  payload: string
  proxy?: string
  extra?: {
    disabled?: boolean
    hitCount?: number
    missCount?: number
  }
}

export interface IRuleShadowFinding {
  /** 被遮蔽规则在列表中的下标，0 起始 */
  index: number
  type: string
  payload: string
  proxy?: string
  /** 遮蔽它的那条规则下标 */
  byIndex: number
  byType: string
  byPayload: string
  kind: RuleShadowKind
}

export interface INeverHitFinding {
  index: number
  type: string
  payload: string
  proxy?: string
  evaluations: number
}

/** 评估次数太少时不判「从未命中」，避免刚启动就误报 */
export const NEVER_HIT_MIN_EVALUATIONS = 200

/** 兜底规则：它之后的规则全都说了不算 */
const CATCH_ALL_TYPES = new Set(['MATCH', 'FINAL'])

function normalizeType(type: string): string {
  return type.trim().toUpperCase()
}

function lower(value: string): string {
  return value.trim().toLowerCase()
}

/** 取域名的各级父域（含自身）：example.a.com → [example.a.com, a.com, com] */
function domainAncestors(host: string): string[] {
  const parts = host.split('.')
  const result: string[] = []
  for (let i = 0; i < parts.length; i++) {
    result.push(parts.slice(i).join('.'))
  }
  return result
}

export interface ParsedCidr {
  /** 地址族位数：IPv4 = 32，IPv6 = 128 */
  family: 32 | 128
  base: bigint
  /** 前缀长度 */
  prefix: number
}

function parseIPv4(value: string): bigint | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (!match) return null
  let result = 0n
  for (let i = 1; i <= 4; i++) {
    const part = Number(match[i])
    if (!Number.isInteger(part) || part > 255) return null
    result = (result << 8n) + BigInt(part)
  }
  return result
}

function parseIPv6(value: string): bigint | null {
  const halves = value.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1) {
    if (head.length !== 8) return null
  } else if (missing < 1) {
    return null
  }
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  let result = 0n
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    result = (result << 16n) + BigInt(parseInt(group, 16))
  }
  return result
}

/** 解析 CIDR 字面量并归一到网络地址，解析不了返回 null */
export function parseCidr(value: string): ParsedCidr | null {
  const [address, prefixText, ...rest] = value.trim().split('/')
  if (rest.length > 0 || !address) return null
  const v4 = parseIPv4(address)
  const v6 = v4 === null ? parseIPv6(address) : null
  const raw = v4 ?? v6
  if (raw === null) return null
  const family: 32 | 128 = v4 !== null ? 32 : 128
  const prefix = prefixText === undefined ? family : Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > family) return null
  const hostBits = BigInt(family - prefix)
  return { family, base: hostBits === 0n ? raw : (raw >> hostBits) << hostBits, prefix }
}

/** parent 是否完整包含 child */
export function cidrContains(parent: ParsedCidr, child: ParsedCidr): boolean {
  if (parent.family !== child.family) return false
  if (child.prefix < parent.prefix) return false
  const shift = BigInt(parent.family - parent.prefix)
  return child.base >> shift === parent.base >> shift
}

interface KeywordEntry {
  keyword: string
  index: number
}

interface CidrEntry {
  cidr: ParsedCidr
  index: number
}

/**
 * 静态遮蔽分析：返回被前面规则完全覆盖、因此永远不会命中的规则。
 * 复杂度约为 O(n × 域名层数)，几千条规则也能瞬时算完。
 */
export function analyzeRuleShadowing(rules: IRuleLike[]): IRuleShadowFinding[] {
  const findings: IRuleShadowFinding[] = []
  // 只看能构成「完全覆盖」的规则类型，其余类型丢进 ignore 即可
  let catchAllIndex = -1
  const exactDomains = new Map<string, number>()
  const suffixes = new Map<string, number>()
  const keywords: KeywordEntry[] = []
  const cidrs: CidrEntry[] = []
  const seen = new Map<string, number>()

  rules.forEach((rule, index) => {
    const type = normalizeType(rule.type)
    const payload = type === 'MATCH' || type === 'FINAL' ? '' : lower(rule.payload || '')
    const identity = `${type},${payload}`
    const duplicated = seen.get(identity)

    // 1) 找出最早一条能完全覆盖当前规则的规则
    let bestIndex = catchAllIndex
    let kind: RuleShadowKind = 'catchAll'
    const consider = (candidate: number, candidateKind: RuleShadowKind): void => {
      if (candidate < 0) return
      if (bestIndex < 0 || candidate < bestIndex) {
        bestIndex = candidate
        kind = candidateKind
      }
    }

    if (duplicated !== undefined) {
      consider(duplicated, 'duplicate')
    }

    if (type === 'DOMAIN' || type === 'DOMAIN-SUFFIX') {
      for (const ancestor of domainAncestors(payload)) {
        const suffixIndex = suffixes.get(ancestor)
        if (suffixIndex !== undefined) consider(suffixIndex, 'domainSuffix')
      }
      // 精确域名规则只覆盖同名域名，覆盖不了整个后缀
      if (type === 'DOMAIN') {
        const exactIndex = exactDomains.get(payload)
        if (exactIndex !== undefined) consider(exactIndex, 'domainExact')
      }
      for (const entry of keywords) {
        if (payload.includes(entry.keyword)) consider(entry.index, 'domainKeyword')
      }
    } else if (type === 'DOMAIN-KEYWORD') {
      for (const entry of keywords) {
        if (payload.includes(entry.keyword)) consider(entry.index, 'domainKeyword')
      }
    } else if (type === 'IP-CIDR' || type === 'IP-CIDR6') {
      const cidr = parseCidr(payload)
      if (cidr) {
        for (const entry of cidrs) {
          if (cidrContains(entry.cidr, cidr)) consider(entry.index, 'ipCidr')
        }
      }
    }

    if (bestIndex >= 0) {
      const by = rules[bestIndex]
      findings.push({
        index,
        type: rule.type,
        payload: rule.payload,
        proxy: rule.proxy,
        byIndex: bestIndex,
        byType: by.type,
        byPayload: by.payload,
        kind: duplicated === bestIndex ? 'duplicate' : kind
      })
    }

    // 2) 把当前规则登记进去，供后面的规则判断
    if (CATCH_ALL_TYPES.has(type)) {
      if (catchAllIndex < 0) catchAllIndex = index
    } else if (type === 'DOMAIN-SUFFIX') {
      if (!suffixes.has(payload)) suffixes.set(payload, index)
      for (const ancestor of domainAncestors(payload)) {
        if (!suffixes.has(ancestor)) suffixes.set(ancestor, index)
      }
    } else if (type === 'DOMAIN') {
      if (!exactDomains.has(payload)) exactDomains.set(payload, index)
    } else if (type === 'DOMAIN-KEYWORD') {
      keywords.push({ keyword: payload, index })
    } else if (type === 'IP-CIDR' || type === 'IP-CIDR6') {
      const cidr = parseCidr(payload)
      if (cidr) cidrs.push({ cidr, index })
    }

    if (!seen.has(identity)) seen.set(identity, index)
  })

  return findings
}

/**
 * 动态体检：评估过足够多次、却一次都没命中的规则。
 * 这类规则通常是拼写错误、被前面规则挡住，或者配置已经过期。
 */
export function findNeverHitRules(rules: IRuleLike[]): INeverHitFinding[] {
  const findings: INeverHitFinding[] = []
  rules.forEach((rule, index) => {
    if (rule.extra?.disabled) return
    if (CATCH_ALL_TYPES.has(normalizeType(rule.type))) return
    const evaluations = rule.extra?.missCount ?? 0
    if (evaluations < NEVER_HIT_MIN_EVALUATIONS) return
    if ((rule.extra?.hitCount ?? 0) > 0) return
    findings.push({
      index,
      type: rule.type,
      payload: rule.payload,
      proxy: rule.proxy,
      evaluations
    })
  })
  return findings
}
