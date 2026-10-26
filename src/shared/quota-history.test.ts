import { describe, expect, it } from 'vitest'
import {
  localDateKey,
  QUOTA_HISTORY_DAYS,
  recordQuotaUsage,
  summarizeQuotaHistory
} from './quota-history'
import type { IQuotaHistory } from './quota-history'

const GB = 1024 * 1024 * 1024
const DAY_MS = 86_400_000

/** 用本地时间构造，测试跨时区都稳定 */
function localNoon(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime()
}

const D1 = localNoon(2026, 10, 20)
const D2 = localNoon(2026, 10, 21)
const D3 = localNoon(2026, 10, 22)

describe('localDateKey', () => {
  it('按本地时区补零输出 YYYY-MM-DD', () => {
    expect(localDateKey(localNoon(2026, 1, 5))).toBe('2026-01-05')
    expect(localDateKey(localNoon(2026, 12, 31))).toBe('2026-12-31')
  })
})

describe('recordQuotaUsage', () => {
  it('第一次采样只记基准，不编造用量', () => {
    const history = recordQuotaUsage(undefined, 12 * GB, D1)
    expect(history.last).toBe(12 * GB)
    expect(history.days).toEqual({})
    expect(history.updatedAt).toBe(D1)
  })

  it('同一天多次采样累加到当天', () => {
    const first = recordQuotaUsage(undefined, 10 * GB, D1)
    const second = recordQuotaUsage(first, 13 * GB, D1 + 30 * 60 * 1000)
    const third = recordQuotaUsage(second, 15 * GB, D1 + 90 * 60 * 1000)
    expect(third.days['2026-10-20']).toBe(5 * GB)
    expect(third.last).toBe(15 * GB)
  })

  it('跨天采样时增量记到采样发生的那天', () => {
    const day1 = recordQuotaUsage(undefined, 10 * GB, D1)
    const day2 = recordQuotaUsage(day1, 14 * GB, D2)
    expect(day2.days).toEqual({ '2026-10-21': 4 * GB })
    const day3 = recordQuotaUsage(day2, 19 * GB, D3)
    expect(day3.days).toEqual({ '2026-10-21': 4 * GB, '2026-10-22': 5 * GB })
  })

  it('累计值变小视为机场重置/换套餐，不记负数', () => {
    const before: IQuotaHistory = { last: 50 * GB, days: { '2026-10-20': 3 * GB }, updatedAt: D1 }
    const after = recordQuotaUsage(before, 1 * GB, D2)
    expect(after.days).toEqual({ '2026-10-20': 3 * GB })
    expect(after.last).toBe(1 * GB)
  })

  it('累计值没变时不新增用量，但刷新采样时间', () => {
    const before: IQuotaHistory = { last: 10 * GB, days: {}, updatedAt: D1 }
    const after = recordQuotaUsage(before, 10 * GB, D2)
    expect(after.days).toEqual({})
    expect(after.updatedAt).toBe(D2)
  })

  it('超过保留天数的旧记录被裁剪', () => {
    const old = localDateKey(D1 - QUOTA_HISTORY_DAYS * DAY_MS)
    const recent = localDateKey(D1 - DAY_MS)
    const history: IQuotaHistory = {
      last: 10 * GB,
      days: { [old]: 1 * GB, [recent]: 2 * GB },
      updatedAt: D1
    }
    const after = recordQuotaUsage(history, 11 * GB, D1)
    expect(after.days[old]).toBeUndefined()
    expect(after.days[recent]).toBe(2 * GB)
    expect(after.days[localDateKey(D1)]).toBe(1 * GB)
  })

  it('非法用量不改账本', () => {
    const history: IQuotaHistory = { last: 5 * GB, days: { '2026-10-20': GB }, updatedAt: D1 }
    expect(recordQuotaUsage(history, Number.NaN, D2).days).toEqual(history.days)
    expect(recordQuotaUsage(history, -1, D2).days).toEqual(history.days)
    expect(recordQuotaUsage(undefined, Number.NaN, D2)).toEqual({
      last: 0,
      days: {},
      updatedAt: D2
    })
  })
})

describe('summarizeQuotaHistory', () => {
  it('窗口升序、缺数据的那天填 0', () => {
    const history: IQuotaHistory = {
      last: 20 * GB,
      days: { '2026-10-20': 2 * GB, '2026-10-22': 3 * GB },
      updatedAt: D3
    }
    const summary = summarizeQuotaHistory(history, D3, 3)
    expect(summary.days).toEqual([
      { date: '2026-10-20', bytes: 2 * GB },
      { date: '2026-10-21', bytes: 0 },
      { date: '2026-10-22', bytes: 3 * GB }
    ])
    expect(summary.windowBytes).toBe(5 * GB)
    expect(summary.averageDaily).toBeCloseTo((5 * GB) / 3, -3)
    expect(summary.hasSample).toBe(true)
  })

  it('一条用量都没有时不给日均，避免显示 0 B 误导', () => {
    const summary = summarizeQuotaHistory(undefined, D3, 7)
    expect(summary.windowBytes).toBe(0)
    expect(summary.averageDaily).toBeNull()
    expect(summary.hasSample).toBe(false)
    expect(summary.days).toHaveLength(7)
  })

  it('窗口天数被夹在 1..保留天数之间', () => {
    expect(summarizeQuotaHistory(undefined, D3, 0).days).toHaveLength(1)
    expect(summarizeQuotaHistory(undefined, D3, 90).days).toHaveLength(QUOTA_HISTORY_DAYS)
  })

  it('只统计窗口内的用量，窗口外的旧数据不算进来', () => {
    const history: IQuotaHistory = {
      last: 20 * GB,
      days: { '2026-10-01': 9 * GB, '2026-10-22': GB },
      updatedAt: D3
    }
    const summary = summarizeQuotaHistory(history, D3, 7)
    expect(summary.windowBytes).toBe(GB)
  })
})
