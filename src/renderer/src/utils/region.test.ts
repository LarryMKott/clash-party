import { describe, expect, it } from 'vitest'
import { resolveRegion } from './region'

describe('resolveRegion', () => {
  it('resolves regions from flag emojis', () => {
    expect(resolveRegion('🇭🇰 IEPL 01')?.iso).toBe('HK')
    expect(resolveRegion('🇯🇵 东京 BGP')?.iso).toBe('JP')
    expect(resolveRegion('🇺🇸 Los Angeles')?.iso).toBe('US')
    expect(resolveRegion('🇸🇬 狮城 02')?.iso).toBe('SG')
  })

  it('resolves regions from Chinese keywords', () => {
    expect(resolveRegion('香港 01')?.iso).toBe('HK')
    expect(resolveRegion('台湾 家宽')?.iso).toBe('TW')
    expect(resolveRegion('印度尼西亚 03')?.iso).toBe('ID')
    expect(resolveRegion('印度 Mumbai')?.iso).toBe('IN')
    expect(resolveRegion('俄罗斯 莫斯科')?.iso).toBe('RU')
  })

  it('resolves regions from English keywords', () => {
    expect(resolveRegion('Seoul 5G')?.iso).toBe('KR')
    expect(resolveRegion('Frankfurt 01')?.iso).toBe('DE')
    expect(resolveRegion('RUSSIA-01')?.iso).toBe('RU')
  })

  it('does not confuse lookalike names', () => {
    expect(resolveRegion('RUSSIA-01')?.iso).not.toBe('US')
    expect(resolveRegion('AUS-01')?.iso).toBe('AU')
  })

  it('returns undefined for unknown names', () => {
    expect(resolveRegion('random-proxy-xyz')).toBeUndefined()
    expect(resolveRegion('')).toBeUndefined()
  })
})
