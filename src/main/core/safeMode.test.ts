import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildSafeModeConfig, safeModeWorkDir } from './safeMode'

const base = {
  mode: 'rule',
  proxies: [{ name: 'node', type: 'ss' }],
  'proxy-groups': [{ name: 'Proxy', type: 'select', proxies: ['node'] }],
  rules: ['MATCH,Proxy'],
  tun: { enable: true, stack: 'gvisor', 'auto-route': true },
  'mixed-port': 7899
}

const controled = {
  'mixed-port': 7890,
  'socks-port': 7891,
  port: 0,
  'external-controller': '127.0.0.1:9090',
  secret: 'token'
} as Partial<IMihomoConfig>

describe('buildSafeModeConfig', () => {
  it('端口以受控配置为准，覆盖订阅里自带的值', () => {
    const safe = buildSafeModeConfig(base, controled)
    expect(safe['mixed-port']).toBe(7890)
    expect(safe['socks-port']).toBe(7891)
    // 0 也是合法值（表示关闭该端口），必须照抄
    expect(safe.port).toBe(0)
  })

  it('强制关闭 TUN，但保留其余 tun 字段', () => {
    const safe = buildSafeModeConfig(base, controled)
    expect(safe.tun).toEqual({ enable: false, stack: 'gvisor', 'auto-route': true })
  })

  it('订阅里没有 tun 时也补一个关闭状态', () => {
    const safe = buildSafeModeConfig({ mode: 'rule' }, controled)
    expect(safe.tun).toEqual({ enable: false })
  })

  it('强制关闭局域网访问并固定日志级别', () => {
    const safe = buildSafeModeConfig(
      { ...base, 'allow-lan': true, 'log-level': 'debug' },
      controled
    )
    expect(safe['allow-lan']).toBe(false)
    expect(safe['log-level']).toBe('info')
  })

  it('订阅主体（节点、策略组、规则、模式）原样保留', () => {
    const safe = buildSafeModeConfig(base, controled)
    expect(safe.mode).toBe('rule')
    expect(safe.proxies).toEqual(base.proxies)
    expect(safe['proxy-groups']).toEqual(base['proxy-groups'])
    expect(safe.rules).toEqual(base.rules)
  })

  it('非法端口与空控制器字段不下发', () => {
    const safe = buildSafeModeConfig(base, {
      'mixed-port': -1,
      'socks-port': 'abc',
      'external-controller': '',
      secret: ''
    } as unknown as Partial<IMihomoConfig>)
    expect(safe['mixed-port']).toBe(7899) // 退回订阅自带值
    expect(safe).not.toHaveProperty('socks-port')
    expect(safe).not.toHaveProperty('external-controller')
    expect(safe).not.toHaveProperty('secret')
  })
})

describe('safeModeWorkDir', () => {
  it('固定放在数据目录下的 safe-mode 子目录', () => {
    const dataDirPath = join('/data')
    const paths = safeModeWorkDir(dataDirPath)
    expect(paths.workDir).toBe(join(dataDirPath, 'safe-mode'))
    expect(paths.configPath).toBe(join(paths.workDir, 'config.yaml'))
  })
})
