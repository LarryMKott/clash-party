import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { getReleaseVersion, normalizeTagVersion } from './version-utils.mjs'

const pkgVersion = JSON.parse(readFileSync('package.json', 'utf-8')).version

afterEach(() => {
  delete process.env.GITHUB_REF_NAME
})

describe('normalizeTagVersion', () => {
  it('接受 vX.Y.Z 形式的发布 tag', () => {
    expect(normalizeTagVersion('v2.0.4')).toBe('2.0.4')
    expect(normalizeTagVersion(' v2.0.4 ')).toBe('2.0.4')
  })

  it('忽略带后缀的旧 tag 与非 tag 引用', () => {
    expect(normalizeTagVersion('v2.0.3-fork.8')).toBe('')
    expect(normalizeTagVersion('dev')).toBe('')
    expect(normalizeTagVersion('smart_core')).toBe('')
    expect(normalizeTagVersion('')).toBe('')
    expect(normalizeTagVersion(undefined)).toBe('')
  })
})

describe('getReleaseVersion', () => {
  it('正式版以发布 tag 为准', () => {
    process.env.GITHUB_REF_NAME = 'v2.0.4'
    expect(getReleaseVersion()).toBe('2.0.4')
  })

  it('本地构建回退 package.json', () => {
    process.env.GITHUB_REF_NAME = 'smart_core'
    expect(getReleaseVersion()).toBe(pkgVersion)
  })
})
