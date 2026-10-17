import { describe, expect, it } from 'vitest'
import { describePreflightIssue, type PreflightCheck } from './preflight'

// 把 key 和参数原样吐出来，方便断言「可选参数有没有被拼进去」
const t = (key: string, options?: Record<string, unknown>): string =>
  `${key}|${JSON.stringify(options ?? {})}`

describe('describePreflightIssue', () => {
  it('查得到占用进程时把进程名括起来', () => {
    const check: PreflightCheck = {
      id: 'portInUse',
      level: 'error',
      params: { port: 7890, owner: 'chrome.exe' }
    }
    const text = describePreflightIssue(check, t)
    expect(text).toContain('mihomo.preflight.issue.portInUse')
    expect(text).toContain('"owner":"（chrome.exe）"')
  })

  it('查不到占用进程时 owner 是空串，不留下多余的括号', () => {
    const text = describePreflightIssue(
      { id: 'portInUse', level: 'error', params: { port: 7890 } },
      t
    )
    expect(text).toContain('"owner":""')
  })

  it('配置错误带行号时追加行号片段', () => {
    const text = describePreflightIssue(
      { id: 'configInvalid', level: 'error', params: { count: 2, line: 17 } },
      t
    )
    expect(text).toContain('mihomo.preflight.atLine')
    expect(text).toContain('"line":17')
  })

  it('没有行号时不追加', () => {
    const text = describePreflightIssue(
      { id: 'configInvalid', level: 'error', params: { count: 2 } },
      t
    )
    expect(text).toContain('"at":""')
    expect(text).not.toContain('atLine')
  })

  it('不需要可选参数的检查项原样透传', () => {
    const text = describePreflightIssue({ id: 'tunNeedsAdmin', level: 'warning' }, t)
    expect(text).toBe('mihomo.preflight.issue.tunNeedsAdmin|{}')
  })
})
