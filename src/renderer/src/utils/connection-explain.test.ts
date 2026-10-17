import { describe, expect, it } from 'vitest'
import { explainConnection, isFakeIp, isIpLiteral, isPrivateAddress } from './connection-explain'

type Meta = IMihomoConnectionDetail['metadata']

const baseMeta: Meta = {
  network: 'tcp',
  type: 'HTTP',
  sourceIP: '192.168.31.42',
  sourceGeoIP: [],
  sourceIPASN: '',
  destinationIP: '1.1.1.1',
  destinationGeoIP: [],
  destinationIPASN: '',
  sourcePort: '51234',
  destinationPort: '443',
  inboundIP: '127.0.0.1',
  inboundPort: '7890',
  inboundName: 'mixed',
  inboundUser: '',
  host: 'api.openai.com',
  dnsMode: 'normal',
  uid: 1000,
  process: 'chrome.exe',
  processPath: 'C:/chrome.exe',
  specialProxy: '',
  specialRules: '',
  remoteDestination: '',
  dscp: 0,
  sniffHost: ''
}

function makeConnection(
  overrides: Partial<IMihomoConnectionDetail> = {},
  meta: Partial<Meta> = {}
): IMihomoConnectionDetail {
  return {
    id: 'test-connection',
    isActive: true,
    metadata: { ...baseMeta, ...meta },
    upload: 0,
    download: 0,
    start: '2026-10-17T07:00:00Z',
    chains: ['香港 03', 'Proxy', 'GLOBAL'],
    providerChains: [],
    rule: 'DomainSuffix',
    rulePayload: 'openai.com',
    ...overrides
  }
}

describe('isIpLiteral', () => {
  it('区分域名与 IP 字面量', () => {
    expect(isIpLiteral('1.1.1.1')).toBe(true)
    expect(isIpLiteral('::1')).toBe(true)
    expect(isIpLiteral('api.openai.com')).toBe(false)
    expect(isIpLiteral('')).toBe(false)
    expect(isIpLiteral('999.1.1.1')).toBe(false)
  })
})

describe('isFakeIp', () => {
  it('命中 198.18.0.0/15', () => {
    expect(isFakeIp('198.18.0.7')).toBe(true)
    expect(isFakeIp('198.19.255.1')).toBe(true)
    expect(isFakeIp('198.20.0.1')).toBe(false)
    expect(isFakeIp('1.1.1.1')).toBe(false)
  })
})

describe('isPrivateAddress', () => {
  it('覆盖内网、回环、链路本地与 CGNAT', () => {
    expect(isPrivateAddress('192.168.1.1')).toBe(true)
    expect(isPrivateAddress('10.0.0.1')).toBe(true)
    expect(isPrivateAddress('172.16.5.4')).toBe(true)
    expect(isPrivateAddress('172.32.5.4')).toBe(false)
    expect(isPrivateAddress('100.64.0.1')).toBe(true)
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('fd00::1')).toBe(true)
    expect(isPrivateAddress('fe80::1')).toBe(true)
    expect(isPrivateAddress('2606:4700::1111')).toBe(false)
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
  })
})

describe('explainConnection', () => {
  it('策略链按由外到内排列，最终节点单独取出', () => {
    const result = explainConnection(makeConnection())
    expect(result.verdict).toBe('proxied')
    expect(result.policies).toEqual(['GLOBAL', 'Proxy'])
    expect(result.outbound).toBe('香港 03')
    expect(result.severity).toBe('ok')
    expect(result.findings).toEqual([])
  })

  it('fake-ip 且没嗅探到域名时给出 critical', () => {
    const result = explainConnection(
      makeConnection({}, { host: '198.18.0.7', destinationIP: '198.18.0.7', dnsMode: 'fake-ip' })
    )
    expect(result.domain).toBe('')
    expect(result.target).toBe('198.18.0.7')
    expect(result.severity).toBe('critical')
    expect(result.findings[0]).toEqual({
      code: 'fakeIpNoSniff',
      severity: 'critical',
      params: { ip: '198.18.0.7' }
    })
  })

  it('普通 IP 连接不报 fake-ip，只提示没有域名', () => {
    const result = explainConnection(
      makeConnection({}, { host: '', destinationIP: '1.1.1.1', dnsMode: 'normal' })
    )
    expect(result.severity).toBe('info')
    expect(result.findings.map((finding) => finding.code)).toContain('domainMissing')
    expect(result.findings.map((finding) => finding.code)).not.toContain('fakeIpNoSniff')
  })

  it('域名只由嗅探补回时单独标记', () => {
    const result = explainConnection(
      makeConnection({}, { host: '1.1.1.1', sniffHost: 'api.openai.com' })
    )
    expect(result.domain).toBe('api.openai.com')
    expect(result.findings.map((finding) => finding.code)).toEqual(['sniffHostRecovered'])
  })

  it('DIRECT 与 REJECT 分别归为直连和被拒绝', () => {
    expect(explainConnection(makeConnection({ chains: ['DIRECT'] })).verdict).toBe('direct')
    expect(explainConnection(makeConnection({ chains: ['REJECT'] })).verdict).toBe('rejected')
    expect(explainConnection(makeConnection({ chains: [] })).verdict).toBe('unknown')
  })

  it('内网目标走代理时提示规则顺序', () => {
    const result = explainConnection(makeConnection({}, { destinationIP: '192.168.31.1' }))
    expect(result.findings.map((finding) => finding.code)).toContain('privateThroughProxy')
    expect(result.severity).toBe('warning')
  })

  it('内网目标走直连不算问题', () => {
    const result = explainConnection(
      makeConnection({ chains: ['DIRECT'] }, { destinationIP: '192.168.31.1' })
    )
    expect(result.findings.map((finding) => finding.code)).not.toContain('privateThroughProxy')
  })

  it('命中 MATCH 兜底、缺进程名、特殊规则都能被识别', () => {
    const result = explainConnection(
      makeConnection(
        { rule: 'Match', rulePayload: '' },
        { process: '', processPath: '', specialRules: 'sniffer: tls' }
      )
    )
    const codes = result.findings.map((finding) => finding.code)
    expect(codes).toContain('matchFallback')
    expect(codes).toContain('processUnknown')
    expect(codes).toContain('specialRules')
    expect(result.severity).toBe('warning')
  })
})
