import { describe, expect, it } from 'vitest'
import { lintMihomoConfig } from './mihomo-lint'

const codes = (source: string): string[] => lintMihomoConfig(source).issues.map((i) => i.code)

const fullConfig = `mixed-port: 7890
socks-port: 7891
proxies:
  - name: 香港 01
    type: ss
    server: 1.1.1.1
    port: 443
    cipher: aes-128-gcm
    password: pass
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - 香港 01
      - DIRECT
rules:
  - DOMAIN-SUFFIX,openai.com,Proxy
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
`

describe('lintMihomoConfig', () => {
  it('合法配置不报问题', () => {
    const result = lintMihomoConfig(fullConfig)
    expect(result.issues).toEqual([])
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 })
  })

  it('空内容直接返回空结果', () => {
    expect(lintMihomoConfig('   ')).toEqual({
      issues: [],
      counts: { error: 0, warning: 0, info: 0 }
    })
  })

  it('规则引用了不存在的策略组时报错并给出行号', () => {
    const result = lintMihomoConfig(
      fullConfig.replace('DOMAIN-SUFFIX,openai.com,Proxy', 'DOMAIN-SUFFIX,openai.com,ProxyX')
    )
    const issue = result.issues.find((i) => i.code === 'ruleTargetMissing')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('error')
    expect(issue?.params).toEqual({ target: 'ProxyX', rule: 1 })
    expect(issue?.line).toBe(17)
  })

  it('策略组引用了不存在的节点时报错', () => {
    const result = lintMihomoConfig(fullConfig.replace('      - 香港 01', '      - 香港 02'))
    const issue = result.issues.find((i) => i.code === 'groupTargetMissing')
    expect(issue?.params).toEqual({ group: 'Proxy', target: '香港 02' })
    expect(issue?.line).toBe(14)
  })

  it('no-resolve 不会被当成规则目标', () => {
    const result = lintMihomoConfig(
      fullConfig.replace('GEOIP,CN,DIRECT', 'GEOIP,CN,DIRECT,no-resolve')
    )
    expect(result.issues).toEqual([])
  })

  it('规则类型拼错时给出 warning', () => {
    const result = lintMihomoConfig(
      fullConfig.replace('DOMAIN-SUFFIX,openai.com,Proxy', 'DOMAIN-SUFFIXT,openai.com,Proxy')
    )
    const issue = result.issues.find((i) => i.code === 'unknownRuleType')
    expect(issue?.severity).toBe('warning')
    expect(issue?.params.type).toBe('DOMAIN-SUFFIXT')
  })

  it('RULE-SET 引用了不存在的 provider 时报错', () => {
    const source = fullConfig.replace(
      'rules:',
      'rule-providers:\n  reject:\n    type: http\nrules:'
    )
    const result = lintMihomoConfig(source.replace('GEOIP,CN,DIRECT', 'RULE-SET,adblock,DIRECT'))
    const issue = result.issues.find((i) => i.code === 'ruleSetMissing')
    expect(issue?.params).toEqual({ provider: 'adblock' })
  })

  it('MATCH 之后的规则不可达', () => {
    const result = lintMihomoConfig(
      fullConfig.replace('  - MATCH,Proxy\n', '') + '  - MATCH,Proxy\n  - DOMAIN,a.com,DIRECT\n'
    )
    const issue = result.issues.find((i) => i.code === 'unreachableRule')
    expect(issue?.severity).toBe('warning')
    expect(issue?.params).toEqual({ rule: 4 })
  })

  it('重复规则只报一次并指出首行', () => {
    const source = fullConfig.replace('  - MATCH,Proxy\n', '  - MATCH,Proxy\n  - GEOIP,CN,DIRECT\n')
    const issue = lintMihomoConfig(source).issues.find((i) => i.code === 'duplicateRule')
    expect(issue?.params).toEqual({ line: 18 })
  })

  it('重复节点名、空策略组都能识别', () => {
    const source = `proxies:
  - name: dup
    type: ss
  - name: dup
    type: ss
proxy-groups:
  - name: Empty
    type: select
rules:
  - MATCH,DIRECT
`
    const result = lintMihomoConfig(source)
    expect(result.issues.map((i) => i.code)).toContain('duplicateProxy')
    expect(result.issues.map((i) => i.code)).toContain('emptyGroup')
  })

  it('端口冲突会报错', () => {
    const result = lintMihomoConfig(fullConfig.replace('socks-port: 7891', 'socks-port: 7890'))
    const issue = result.issues.find((i) => i.code === 'portConflict')
    expect(issue?.severity).toBe('error')
    expect(issue?.params).toEqual({ port: 7890, keys: 'mixed-port / socks-port' })
  })

  it('YAML 语法错误时只报语法问题', () => {
    const result = lintMihomoConfig('rules:\n  - a\n bad indent: [')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].code).toBe('yamlSyntax')
    expect(result.issues[0].line).toBeGreaterThan(0)
  })

  it('override 片段没有节点定义时不做引用校验', () => {
    // "+rules" 是 override 的插入写法，此时引用不到本文件里的组名属正常
    expect(codes('+rules:\n  - DOMAIN-SUFFIX,a.com,Proxy\n')).toEqual([])
    expect(codes('rules+:\n  - DOMAIN-SUFFIX,a.com,Proxy\n')).toEqual([])
  })

  it('没有 MATCH 时给一条 info', () => {
    const result = lintMihomoConfig(fullConfig.replace('  - MATCH,Proxy\n', ''))
    const issue = result.issues.find((i) => i.code === 'missingMatch')
    expect(issue?.severity).toBe('info')
  })

  it('问题按严重度排序', () => {
    const source = fullConfig
      .replace('socks-port: 7891', 'socks-port: 7890')
      .replace('DOMAIN-SUFFIXT', 'DOMAIN-SUFFIX')
      .replace('DOMAIN-SUFFIX,openai.com,Proxy', 'DOMAIN-SUFFIXT,openai.com,Proxy')
    const { issues } = lintMihomoConfig(source)
    expect(issues[0].severity).toBe('error')
    expect(issues[issues.length - 1].severity).toBe('warning')
  })
})
