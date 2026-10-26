import { describe, expect, it } from 'vitest'
import {
  createQuotaBaseline,
  evaluateQuota,
  isQuotaAlarming,
  isQuotaRecovered,
  needsQuotaRebaseline,
  quotaStateRank,
  shouldNotifyQuota
} from './quota'

const GB = 1024 * 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0)

describe('evaluateQuota', () => {
  it('没有订阅信息时是 unknown', () => {
    const status = evaluateQuota(undefined, undefined, NOW)
    expect(status.state).toBe('unknown')
    expect(status.used).toBe(0)
    expect(status.total).toBe(0)
    expect(status.daysToExpire).toBeNull()
  })

  it('机场没下发 total 时是 unknown', () => {
    const status = evaluateQuota({ upload: GB, download: GB, total: 0 }, undefined, NOW)
    expect(status.state).toBe('unknown')
    expect(status.used).toBe(2 * GB)
  })

  it('用量很低时是 healthy', () => {
    const status = evaluateQuota(
      { upload: 5 * GB, download: 5 * GB, total: 100 * GB },
      undefined,
      NOW
    )
    expect(status.state).toBe('healthy')
    expect(status.remaining).toBe(90 * GB)
    expect(status.percent).toBeCloseTo(0.1, 6)
  })

  it('70% 起进入 warning', () => {
    expect(
      evaluateQuota({ upload: 70 * GB, download: 0, total: 100 * GB }, undefined, NOW).state
    ).toBe('warning')
    expect(
      evaluateQuota({ upload: 69 * GB, download: 0, total: 100 * GB }, undefined, NOW).state
    ).toBe('healthy')
  })

  it('90% 起进入 critical', () => {
    expect(
      evaluateQuota({ upload: 90 * GB, download: 0, total: 100 * GB }, undefined, NOW).state
    ).toBe('critical')
    expect(
      evaluateQuota({ upload: 89 * GB, download: 0, total: 100 * GB }, undefined, NOW).state
    ).toBe('warning')
  })

  it('用满后是 exhausted，超出时剩余量截断为 0', () => {
    const status = evaluateQuota(
      { upload: 60 * GB, download: 60 * GB, total: 100 * GB },
      undefined,
      NOW
    )
    expect(status.state).toBe('exhausted')
    expect(status.remaining).toBe(0)
    expect(status.percent).toBe(1)
  })

  it('过期优先于耗尽：到期后剩多少流量都是 expired', () => {
    const status = evaluateQuota(
      { upload: 1 * GB, download: 0, total: 100 * GB, expire: Math.floor(NOW / 1000) - 60 },
      undefined,
      NOW
    )
    expect(status.state).toBe('expired')
    expect(status.expiringSoon).toBe(false)
  })

  it('算出到期天数与临期提醒窗口', () => {
    const expire = Math.floor((NOW + 2.5 * DAY) / 1000)
    const status = evaluateQuota(
      { upload: 0, download: 0, total: 100 * GB, expire },
      undefined,
      NOW
    )
    expect(status.daysToExpire).toBeCloseTo(2.5, 3)
    expect(status.expiringSoon).toBe(true)
  })

  it('expire 为 0 视为长期有效', () => {
    const status = evaluateQuota(
      { upload: 0, download: 0, total: 100 * GB, expire: 0 },
      undefined,
      NOW
    )
    expect(status.expireAt).toBe(0)
    expect(status.daysToExpire).toBeNull()
    expect(status.expiringSoon).toBe(false)
  })

  it('脏数据（NaN / 负数）按 0 处理', () => {
    const status = evaluateQuota(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { upload: Number.NaN, download: -5, total: 100 * GB } as any,
      undefined,
      NOW
    )
    expect(status.used).toBe(0)
    expect(status.state).toBe('healthy')
  })
})

describe('日均速率', () => {
  it('没有基准时不给速率', () => {
    const status = evaluateQuota({ upload: 10 * GB, download: 0, total: 100 * GB }, undefined, NOW)
    expect(status.dailyRate).toBeNull()
    expect(status.daysToExhausted).toBeNull()
    expect(status.exhaustedAt).toBeNull()
  })

  it('样本不足一小时时不给速率', () => {
    const baseline = { used: 5 * GB, at: NOW - 30 * 60 * 1000, total: 100 * GB }
    const status = evaluateQuota({ upload: 6 * GB, download: 0, total: 100 * GB }, baseline, NOW)
    expect(status.dailyRate).toBeNull()
  })

  it('按基准增量推算日均消耗与预计耗尽时间', () => {
    // 两天前 10GB，现在 20GB → 5GB/天；总量 100GB，剩 80GB → 16 天
    const baseline = { used: 10 * GB, at: NOW - 2 * DAY, total: 100 * GB }
    const status = evaluateQuota({ upload: 20 * GB, download: 0, total: 100 * GB }, baseline, NOW)
    expect(status.dailyRate).toBeCloseTo(5 * GB, -3)
    expect(status.daysToExhausted).toBeCloseTo(16, 3)
    expect(status.exhaustedAt).toBeCloseTo(NOW + 16 * DAY, -3)
  })

  it('流量没有增长时不给耗尽预测，避免除零', () => {
    const baseline = { used: 20 * GB, at: NOW - 2 * DAY, total: 100 * GB }
    const status = evaluateQuota({ upload: 20 * GB, download: 0, total: 100 * GB }, baseline, NOW)
    expect(status.dailyRate).toBeNull()
    expect(status.daysToExhausted).toBeNull()
  })
})

describe('基准维护', () => {
  it('首次 / 流量回退 / 换套餐都需要重建基准', () => {
    expect(needsQuotaRebaseline({ upload: GB, total: 100 * GB }, undefined, NOW)).toBe(true)
    expect(
      needsQuotaRebaseline(
        { upload: 5 * GB, total: 100 * GB },
        { used: 10 * GB, at: NOW - DAY, total: 100 * GB },
        NOW
      )
    ).toBe(true)
    expect(
      needsQuotaRebaseline(
        { upload: 10 * GB, total: 200 * GB },
        { used: 10 * GB, at: NOW - DAY, total: 100 * GB },
        NOW
      )
    ).toBe(true)
    expect(
      needsQuotaRebaseline(
        { upload: 10 * GB, total: 100 * GB },
        { used: 10 * GB, at: NOW + DAY, total: 100 * GB },
        NOW
      )
    ).toBe(true)
  })

  it('流量正常增长时保留基准', () => {
    expect(
      needsQuotaRebaseline(
        { upload: 20 * GB, total: 100 * GB },
        { used: 10 * GB, at: NOW - DAY, total: 100 * GB },
        NOW
      )
    ).toBe(false)
  })

  it('没有额度时不建基准', () => {
    expect(createQuotaBaseline({ upload: GB, total: 0 }, NOW)).toBeNull()
    expect(createQuotaBaseline(undefined, NOW)).toBeNull()
    expect(createQuotaBaseline({ upload: 2 * GB, total: 100 * GB }, NOW)).toEqual({
      used: 2 * GB,
      at: NOW,
      total: 100 * GB
    })
  })
})

describe('通知去重', () => {
  it('状态变坏到 warning 以上才通知', () => {
    expect(shouldNotifyQuota(undefined, 'healthy')).toBe(false)
    expect(shouldNotifyQuota('healthy', 'warning')).toBe(true)
    expect(shouldNotifyQuota('warning', 'critical')).toBe(true)
    expect(shouldNotifyQuota('critical', 'exhausted')).toBe(true)
    expect(shouldNotifyQuota('warning', 'critical')).toBe(true)
  })

  it('同一状态或状态好转时不重复通知', () => {
    expect(shouldNotifyQuota('critical', 'critical')).toBe(false)
    expect(shouldNotifyQuota('critical', 'warning')).toBe(false)
    expect(shouldNotifyQuota('exhausted', 'healthy')).toBe(false)
  })

  it('状态好转可以被识别，用于清除已通知标记', () => {
    expect(isQuotaRecovered('critical', 'healthy')).toBe(true)
    expect(isQuotaRecovered('healthy', 'warning')).toBe(false)
    expect(isQuotaRecovered(undefined, 'healthy')).toBe(false)
  })

  it('严重度排序与告警判定一致', () => {
    expect(quotaStateRank('healthy')).toBeLessThan(quotaStateRank('warning'))
    expect(quotaStateRank('exhausted')).toBe(quotaStateRank('expired'))
    expect(isQuotaAlarming('healthy')).toBe(false)
    expect(isQuotaAlarming('warning')).toBe(true)
    expect(isQuotaAlarming('expired')).toBe(true)
  })
})
