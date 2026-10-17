import { describe, expect, it } from 'vitest'
import { buildRuleCandidates, composeRule, isUselessIp, registeredDomain } from './connection-rule'

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

function makeConnection(meta: Partial<Meta> = {}): IMihomoConnectionDetail {
  return {
    id: 'test',
    isActive: true,
    metadata: { ...baseMeta, ...meta },
    upload: 0,
    download: 0,
    start: '2026-10-17T07:00:00Z',
    chains: ['香港 03', 'Proxy'],
    providerChains: [],
    rule: 'DomainSuffix',
    rulePayload: 'openai.com'
  }
}

describe('registeredDomain', () => {
  it('普通域名取最后两段', () => {
    expect(registeredDomain('api.openai.com')).toBe('openai.com')
    expect(registeredDomain('a.b.example.io')).toBe('example.io')
    expect(registeredDomain('example.com')).toBe('example.com')
  })

  it('两级公共后缀不截断', () => {
    expect(registeredDomain('img.a.co.uk')).toBe('a.co.uk')
    expect(registeredDomain('www.bbc.com.cn')).toBe('bbc.com.cn')
  })
})

describe('isUselessIp', () => {
  it('过滤 fake-ip、内网与回环', () => {
    expect(isUselessIp('198.18.0.5')).toBe(true)
    expect(isUselessIp('192.168.1.1')).toBe(true)
    expect(isUselessIp('127.0.0.1')).toBe(true)
    expect(isUselessIp('fd00::1')).toBe(true)
    expect(isUselessIp('1.1.1.1')).toBe(false)
    expect(isUselessIp('2606:4700::1111')).toBe(false)
  })
})

describe('buildRuleCandidates', () => {
  it('域名连接的候选顺序是 后缀 → 精确 → 进程 → IP', () => {
    const candidates = buildRuleCandidates(makeConnection())
    expect(candidates.map((c) => c.rule)).toEqual([
      'DOMAIN-SUFFIX,openai.com',
      'DOMAIN,api.openai.com',
      'PROCESS-NAME,chrome.exe',
      'IP-CIDR,1.1.1.1/32'
    ])
  })

  it('域名与注册域相同时不重复给出后缀', () => {
    const candidates = buildRuleCandidates(makeConnection({ host: 'openai.com' }))
    expect(candidates.map((c) => c.type)).toEqual(['DOMAIN', 'PROCESS-NAME', 'IP-CIDR'])
  })

  it('fake-ip 目标不生成 IP 规则', () => {
    const candidates = buildRuleCandidates(
      makeConnection({ host: '198.18.0.7', destinationIP: '198.18.0.7' })
    )
    expect(candidates.map((c) => c.type)).toEqual(['PROCESS-NAME'])
  })

  it('域名丢失时退回 sniffHost', () => {
    const candidates = buildRuleCandidates(
      makeConnection({ host: '1.1.1.1', sniffHost: 'api.openai.com' })
    )
    expect(candidates[0].rule).toBe('DOMAIN-SUFFIX,openai.com')
  })

  it('IPv6 目标用 IP-CIDR6 与 /128', () => {
    const candidates = buildRuleCandidates(
      makeConnection({ host: '', sniffHost: '', destinationIP: '2606:4700::1111' })
    )
    const ipCandidate = candidates.find((c) => c.kind === 'ip')
    expect(ipCandidate?.rule).toBe('IP-CIDR6,2606:4700::1111/128')
  })
})

describe('composeRule', () => {
  it('拼上出口', () => {
    const [candidate] = buildRuleCandidates(makeConnection())
    expect(composeRule(candidate, 'Proxy')).toBe('DOMAIN-SUFFIX,openai.com,Proxy')
    expect(composeRule(candidate, 'DIRECT')).toBe('DOMAIN-SUFFIX,openai.com,DIRECT')
  })
})
