import { describe, expect, it } from 'vitest'
import {
  buildChangelog,
  groupCommits,
  parseCommit,
  resolveRange,
  shouldSkipCommit
} from './changelog.mjs'

const commit = (subject, body = '') => ({ hash: 'abc1234', subject, body })

describe('parseCommit', () => {
  it('解析 conventional commit 的类型与 scope', () => {
    expect(parseCommit('feat(ui): add war room hud')).toMatchObject({
      type: 'feat',
      scope: 'ui',
      breaking: false,
      subject: 'add war room hud',
      conventional: true
    })
  })

  it('识别 breaking change 标记', () => {
    expect(parseCommit('feat(api)!: drop v1 endpoint').breaking).toBe(true)
    expect(parseCommit('fix: tidy', 'BREAKING CHANGE: removes legacy field').breaking).toBe(true)
  })

  it('非 conventional 提交保留原始主题', () => {
    expect(parseCommit('Update readme quickly')).toMatchObject({
      type: null,
      conventional: false,
      subject: 'Update readme quickly'
    })
  })
})

describe('shouldSkipCommit', () => {
  it('跳过发布类与纯版本号提交', () => {
    expect(shouldSkipCommit(commit('chore(release): bump version'))).toBe(true)
    expect(shouldSkipCommit(commit('chore: release v2.0.3'))).toBe(true)
    expect(shouldSkipCommit(commit('v2.0.3'))).toBe(true)
  })

  it('跳过显式标记的提交', () => {
    expect(shouldSkipCommit(commit('feat: internal tweak [skip changelog]'))).toBe(true)
    expect(shouldSkipCommit(commit('feat: internal tweak', '[skip changelog]'))).toBe(true)
    expect(
      shouldSkipCommit(commit('feat: internal tweak', 'Some text\n\n[skip changelog]\n'))
    ).toBe(true)
  })

  it('正文里仅仅提到该标记不算跳过', () => {
    expect(
      shouldSkipCommit(
        commit('docs: explain the skip marker', 'Add `[skip changelog]` to a commit.')
      )
    ).toBe(false)
  })

  it('保留普通提交', () => {
    expect(shouldSkipCommit(commit('feat: add delay race mode'))).toBe(false)
  })
})

describe('groupCommits', () => {
  it('按分类排序、去重并过滤噪音提交', () => {
    const sections = groupCommits([
      commit('fix: correct core auth key casing'),
      commit('chore(release): bump version'),
      commit('feat: add meteors'),
      commit('feat: add meteors'),
      commit('ci: cache pnpm store'),
      commit('feat!: drop legacy config')
    ])

    expect(sections.map((section) => section.key)).toEqual(['breaking', 'feat', 'fix', 'other'])
    expect(sections.find((section) => section.key === 'breaking').items).toEqual([
      'drop legacy config'
    ])
    expect(sections.find((section) => section.key === 'feat').items).toEqual(['add meteors'])
    expect(sections.find((section) => section.key === 'other').items).toEqual(['cache pnpm store'])
  })
})

describe('buildChangelog', () => {
  it('生成带版本标题与对比链接的 markdown', () => {
    const markdown = buildChangelog({
      version: '2.0.4',
      sections: [{ key: 'feat', title: '新功能', items: ['add a', 'add b'] }],
      from: 'v2.0.3-fork.7',
      to: 'v2.0.4',
      repo: 'owner/repo'
    })

    expect(markdown).toContain('# 2.0.4')
    expect(markdown).toContain('## 新功能\n\n- add a\n- add b')
    expect(markdown).toContain('https://github.com/owner/repo/compare/v2.0.3-fork.7...v2.0.4')
  })

  it('没有条目时返回空字符串', () => {
    expect(buildChangelog({ sections: [] })).toBe('')
  })
})

describe('resolveRange', () => {
  it('显式 from 优先', () => {
    expect(resolveRange({ from: 'v1.0.0', to: 'HEAD' })).toEqual({ from: 'v1.0.0', to: 'HEAD' })
  })
})
