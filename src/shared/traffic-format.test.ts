import { describe, expect, it } from 'vitest'
import { formatTraffic } from './traffic-format'

describe('formatTraffic', () => {
  it('按 1024 进制选择单位', () => {
    expect(formatTraffic(0)).toBe('0.00 B')
    expect(formatTraffic(1023)).toBe('1023 B')
    expect(formatTraffic(1024)).toBe('1.00 KB')
    expect(formatTraffic(1024 * 1024)).toBe('1.00 MB')
    expect(formatTraffic(1024 * 1024 * 1024)).toBe('1.00 GB')
    expect(formatTraffic(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB')
  })

  it('大数值压缩成整数，保持行宽', () => {
    // toFixed(2)=123.46（6 字符）→ 退到 1 位小数
    expect(formatTraffic(123.456 * 1024 * 1024 * 1024)).toBe('123.5 GB')
    // toFixed(2)=1023.70（7 字符）→ 直接取整
    expect(formatTraffic(1023.7 * 1024 * 1024 * 1024)).toBe('1024 GB')
    // 超过 1024 GB 自动升到 TB
    expect(formatTraffic(1234.567 * 1024 * 1024 * 1024)).toBe('1.21 TB')
  })

  it('非法输入退化为 0 B', () => {
    expect(formatTraffic(Number.NaN)).toBe('0 B')
    expect(formatTraffic(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})
