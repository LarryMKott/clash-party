import { describe, expect, it } from 'vitest'
import { evaluatePreflight, LOW_DISK_MB, type PreflightInput } from './preflight'

const baseInput: PreflightInput = {
  corePath: '/opt/mihomo/mihomo',
  coreAccessible: true,
  dataDirWritable: true,
  freeDiskMb: 10_000,
  ports: [{ port: 7890, free: true }],
  configErrors: 0,
  tunEnabled: false,
  admin: true,
  expiredProfiles: []
}

const run = (patch: Partial<PreflightInput> = {}): ReturnType<typeof evaluatePreflight> =>
  evaluatePreflight({ ...baseInput, ...patch })

describe('evaluatePreflight', () => {
  it('环境正常时不报问题', () => {
    const report = run()
    expect(report.level).toBe('ok')
    expect(report.issues).toEqual([])
    expect(report.checked).toBeGreaterThan(0)
  })

  it('内核文件不可执行时报错并带上路径', () => {
    const report = run({ coreAccessible: false })
    expect(report.level).toBe('error')
    expect(report.issues[0]).toEqual({
      id: 'coreMissing',
      level: 'error',
      params: { path: baseInput.corePath }
    })
  })

  it('端口被占用时报错，能查到进程就一起带上', () => {
    const withOwner = run({ ports: [{ port: 7890, free: false, owner: 'chrome.exe' }] })
    expect(withOwner.issues[0]).toEqual({
      id: 'portInUse',
      level: 'error',
      params: { port: 7890, owner: 'chrome.exe' }
    })

    const withoutOwner = run({ ports: [{ port: 7890, free: false }] })
    expect(withoutOwner.issues[0].params).toEqual({ port: 7890 })
  })

  it('数据目录不可写比磁盘告警更严重', () => {
    const report = run({ dataDirWritable: false, freeDiskMb: 10 })
    expect(report.issues.map((issue) => issue.id)).toEqual(['dataDirNotWritable', 'diskLow'])
    expect(report.level).toBe('error')
  })

  it('磁盘低于阈值才提示', () => {
    expect(run({ freeDiskMb: LOW_DISK_MB + 1 }).issues).toEqual([])
    expect(run({ freeDiskMb: LOW_DISK_MB - 1 }).issues[0].id).toBe('diskLow')
    // 取不到磁盘信息时不误报
    expect(run({ freeDiskMb: null }).issues).toEqual([])
  })

  it('配置有语义错误时报错并给出行号', () => {
    const report = run({ configErrors: 2, configErrorLine: 17 })
    expect(report.issues[0]).toEqual({
      id: 'configInvalid',
      level: 'error',
      params: { count: 2, line: 17 }
    })
    expect(run({ configErrors: 2 }).issues[0].params).toEqual({ count: 2 })
  })

  it('开了 TUN 却没有提权时给出警告', () => {
    expect(run({ tunEnabled: true, admin: false }).issues[0].id).toBe('tunNeedsAdmin')
    expect(run({ tunEnabled: true, admin: true }).issues).toEqual([])
    expect(run({ tunEnabled: false, admin: false }).issues).toEqual([])
  })

  it('过期订阅逐个列出', () => {
    const report = run({
      expiredProfiles: [
        { name: '机场 A', expire: 1 },
        { name: '机场 B', expire: 2 }
      ]
    })
    expect(report.issues.map((issue) => issue.params?.name)).toEqual(['机场 A', '机场 B'])
    expect(report.level).toBe('warning')
  })

  it('错误排在警告前面', () => {
    const report = run({
      ports: [{ port: 7891, free: false }],
      expiredProfiles: [{ name: 'x', expire: 0 }],
      configErrors: 1
    })
    expect(report.issues.map((issue) => issue.level)).toEqual(['error', 'error', 'warning'])
    expect(report.level).toBe('error')
  })
})
