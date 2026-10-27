import { describe, expect, it } from 'vitest'
import {
  NEVER_HIT_MIN_EVALUATIONS,
  analyzeRuleShadowing,
  cidrContains,
  findNeverHitRules,
  parseCidr,
  type IRuleLike,
  type ParsedCidr
} from './rule-audit'

const rule = (type: string, payload: string, proxy = 'PROXY'): IRuleLike => ({
  type,
  payload,
  proxy
})

describe('analyzeRuleShadowing', () => {
  it('空列表不报错', () => {
    expect(analyzeRuleShadowing([])).toEqual([])
  })

  it('第一条规则不会被自己遮蔽', () => {
    expect(analyzeRuleShadowing([rule('DOMAIN-SUFFIX', 'example.com')])).toEqual([])
  })

  it('更宽的域名后缀会吃掉后面的精确域名', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-SUFFIX', 'example.com'),
      rule('DOMAIN', 'a.example.com', 'DIRECT')
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ index: 1, byIndex: 0, kind: 'domainSuffix' })
  })

  it('后缀规则也覆盖后缀自身（DOMAIN 同域名）', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-SUFFIX', 'example.com'),
      rule('DOMAIN', 'example.com')
    ])
    expect(findings[0]).toMatchObject({ kind: 'domainSuffix' })
  })

  it('更窄的后缀规则同样被吃掉', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-SUFFIX', 'example.com'),
      rule('DOMAIN-SUFFIX', 'ads.example.com')
    ])
    expect(findings[0]).toMatchObject({ index: 1, byIndex: 0, kind: 'domainSuffix' })
  })

  it('顺序反过来就不该报——窄规则在前是正常写法', () => {
    expect(
      analyzeRuleShadowing([rule('DOMAIN', 'a.example.com'), rule('DOMAIN-SUFFIX', 'example.com')])
    ).toEqual([])
  })

  it('精确域名规则不会吃掉更宽的后缀规则', () => {
    expect(
      analyzeRuleShadowing([rule('DOMAIN', 'example.com'), rule('DOMAIN-SUFFIX', 'example.com')])
    ).toEqual([])
  })

  it('同名不同出口的重复规则算遮蔽，并指向第一条', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-SUFFIX', 'example.com', 'DIRECT'),
      rule('DOMAIN-SUFFIX', 'example.com', 'PROXY')
    ])
    expect(findings[0]).toMatchObject({ index: 1, byIndex: 0, kind: 'duplicate' })
  })

  it('关键字规则会吃掉包含该关键字的域名规则', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-KEYWORD', 'google'),
      rule('DOMAIN', 'www.google.com')
    ])
    expect(findings[0]).toMatchObject({ kind: 'domainKeyword' })
  })

  it('更短的关键字覆盖更长的关键字', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-KEYWORD', 'goog'),
      rule('DOMAIN-KEYWORD', 'google')
    ])
    expect(findings[0]).toMatchObject({ kind: 'domainKeyword' })
  })

  it('域名规则不会被关键字规则反向遮蔽', () => {
    expect(
      analyzeRuleShadowing([rule('DOMAIN', 'www.google.com'), rule('DOMAIN-KEYWORD', 'google')])
    ).toEqual([])
  })

  it('MATCH 之后的所有规则都失效', () => {
    const findings = analyzeRuleShadowing([
      rule('MATCH', 'DIRECT'),
      rule('DOMAIN-SUFFIX', 'example.com'),
      rule('GEOIP', 'CN')
    ])
    expect(findings).toHaveLength(2)
    expect(findings.every((item) => item.kind === 'catchAll' && item.byIndex === 0)).toBe(true)
  })

  it('大网段吃掉后面的小网段', () => {
    const findings = analyzeRuleShadowing([
      rule('IP-CIDR', '10.0.0.0/8'),
      rule('IP-CIDR', '10.1.0.0/16')
    ])
    expect(findings[0]).toMatchObject({ kind: 'ipCidr', byIndex: 0 })
  })

  it('小网段在前时不误报', () => {
    expect(
      analyzeRuleShadowing([rule('IP-CIDR', '10.1.0.0/16'), rule('IP-CIDR', '10.0.0.0/8')])
    ).toEqual([])
  })

  it('跨地址族不互相遮蔽', () => {
    expect(
      analyzeRuleShadowing([rule('IP-CIDR', '10.0.0.0/8'), rule('IP-CIDR6', '2001:db8::/32')])
    ).toEqual([])
  })

  it('IPv6 网段也能判断包含关系', () => {
    const findings = analyzeRuleShadowing([
      rule('IP-CIDR6', '2001:db8::/32'),
      rule('IP-CIDR6', '2001:db8:1::/48')
    ])
    expect(findings[0]).toMatchObject({ kind: 'ipCidr', byIndex: 0 })
  })

  it('GEOSITE / RULE-SET 这类拿不准的类型不下结论', () => {
    expect(
      analyzeRuleShadowing([
        rule('GEOSITE', 'cn'),
        rule('RULE-SET', 'proxy-list'),
        rule('GEOIP', 'CN')
      ])
    ).toEqual([])
  })

  it('取最早那条遮蔽者，而不是最近的一条', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN-KEYWORD', 'example'),
      rule('DOMAIN-SUFFIX', 'example.com'),
      rule('DOMAIN', 'a.example.com')
    ])
    expect(findings.find((item) => item.index === 2)).toMatchObject({ byIndex: 0 })
  })

  it('大小写不同的域名判为重复', () => {
    const findings = analyzeRuleShadowing([
      rule('DOMAIN', 'Example.COM'),
      rule('DOMAIN', 'example.com')
    ])
    expect(findings[0]).toMatchObject({ kind: 'duplicate' })
  })

  it('脏数据不抛异常', () => {
    expect(() =>
      analyzeRuleShadowing([
        rule('IP-CIDR', 'not-a-cidr'),
        rule('DOMAIN', ''),
        rule('DOMAIN-SUFFIX', 'x.com'),
        rule('DOMAIN', 'a.x.com')
      ])
    ).not.toThrow()
  })
})

describe('parseCidr 与 cidrContains', () => {
  const mustParse = (value: string): ParsedCidr => {
    const parsed = parseCidr(value)
    if (!parsed) throw new Error('cannot parse cidr')
    return parsed
  }

  it('把非规范地址归一到网络地址', () => {
    expect(parseCidr('1.1.1.5/24')).toMatchObject({ family: 32, prefix: 24 })
    expect(cidrContains(mustParse('1.1.1.0/24'), mustParse('1.1.1.5/24'))).toBe(true)
  })

  it('省略前缀视为单主机', () => {
    expect(cidrContains(mustParse('10.0.0.0/8'), mustParse('10.1.2.3'))).toBe(true)
  })

  it('非法输入返回 null', () => {
    expect(parseCidr('10.0.0.0/33')).toBeNull()
    expect(parseCidr('300.1.1.1/8')).toBeNull()
    expect(parseCidr('2001:db8::/129')).toBeNull()
    expect(parseCidr('hello')).toBeNull()
  })

  it('完整写法的 IPv6 也能解析', () => {
    expect(
      cidrContains(
        mustParse('2001:db8::/32'),
        mustParse('2001:0db8:0000:0000:0000:0000:0000:0001/128')
      )
    ).toBe(true)
  })
})

describe('findNeverHitRules', () => {
  const withStats = (
    type: string,
    payload: string,
    hitCount: number,
    missCount: number,
    disabled = false
  ): IRuleLike => ({
    type,
    payload,
    proxy: 'PROXY',
    extra: { hitCount, missCount, disabled }
  })

  it('评估够多但一次没命中，报出来', () => {
    const findings = findNeverHitRules([
      withStats('DOMAIN-SUFFIX', 'x.com', 0, NEVER_HIT_MIN_EVALUATIONS)
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ index: 0, evaluations: NEVER_HIT_MIN_EVALUATIONS })
  })

  it('评估次数不够时不报', () => {
    expect(findNeverHitRules([withStats('DOMAIN-SUFFIX', 'x.com', 0, 10)])).toEqual([])
  })

  it('命中过就不报', () => {
    expect(findNeverHitRules([withStats('DOMAIN-SUFFIX', 'x.com', 1, 1000)])).toEqual([])
  })

  it('被手动停用的规则不报', () => {
    expect(findNeverHitRules([withStats('DOMAIN-SUFFIX', 'x.com', 0, 1000, true)])).toEqual([])
  })

  it('兜底规则不参与', () => {
    expect(findNeverHitRules([withStats('MATCH', '', 0, 5000)])).toEqual([])
  })

  it('没有运行数据的规则不报', () => {
    expect(findNeverHitRules([{ type: 'DOMAIN', payload: 'a.com' }])).toEqual([])
  })
})
