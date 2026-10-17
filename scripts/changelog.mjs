import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getProcessedVersion } from './version-utils.mjs'

const FIELD_SEPARATOR = '\u001f'
const RECORD_SEPARATOR = '\u001e'
// 没有任何 tag 可用时，避免把整段历史都倒出来
const FALLBACK_COMMIT_LIMIT = 50

export const SECTION_ORDER = ['breaking', 'feat', 'fix', 'perf', 'refactor', 'other']

export const SECTION_TITLES = {
  breaking: '破坏性变更',
  feat: '新功能',
  fix: '修复',
  perf: '性能优化',
  refactor: '重构',
  other: '其他'
}

// 未命中的类型（style/build/ci/docs/test/chore/revert…）统一落到「其他」，
// 避免出现大量只有一两条的分类。
const TYPE_TO_SECTION = {
  feat: 'feat',
  feature: 'feat',
  fix: 'fix',
  bugfix: 'fix',
  hotfix: 'fix',
  perf: 'perf',
  performance: 'perf',
  refactor: 'refactor'
}

const CONVENTIONAL_PATTERN = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/
const BREAKING_BODY_PATTERN = /(?:^|\n)BREAKING[ -]CHANGE:/
const SKIP_MARKER_PATTERN = /\[(?:skip[ -]?changelog|no[ -]?changelog)\]/i
// 正文里只在独立成行的地方认这个标记，否则「说明该标记」的提交也会被连带跳过
const SKIP_MARKER_LINE_PATTERN = /^[ \t]*\[(?:skip[ -]?changelog|no[ -]?changelog)\][ \t]*$/im
const SKIP_SUBJECT_PATTERNS = [
  /^chore(?:\(release\))?:\s*(?:release|bump|version|publish|tag)/i,
  /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/
]

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

export function hasGitRepo(cwd = process.cwd()) {
  try {
    runGit(['rev-parse', '--git-dir'], cwd)
    return true
  } catch {
    return false
  }
}

/**
 * 解析一条提交主题，兼容 conventional commits 与随手写的提交信息。
 */
export function parseCommit(subject, body = '') {
  const raw = (subject || '').trim()
  const match = CONVENTIONAL_PATTERN.exec(raw)
  const breakingInBody = BREAKING_BODY_PATTERN.test(body || '')

  if (!match) {
    return { type: null, scope: null, breaking: breakingInBody, subject: raw, conventional: false }
  }

  return {
    type: match[1].toLowerCase(),
    scope: match[2] || null,
    breaking: Boolean(match[3]) || breakingInBody,
    subject: match[4].trim().replace(/\s+/g, ' '),
    conventional: true
  }
}

export function shouldSkipCommit({ subject = '', body = '' } = {}) {
  const trimmed = subject.trim()
  if (SKIP_MARKER_PATTERN.test(trimmed) || SKIP_MARKER_LINE_PATTERN.test(body || '')) {
    return true
  }
  return SKIP_SUBJECT_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function tagsPointingAtHead(cwd) {
  try {
    return runGit(['tag', '--points-at', 'HEAD'], cwd).split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 找出当前提交之前最近的一个正式 tag，用于确定 `from..HEAD` 的起点。
 * 指向 HEAD 自身的 tag（正在发布的那个）必须排除，否则范围会退化成空。
 */
export function resolvePreviousTag({ cwd = process.cwd(), currentTag = '' } = {}) {
  const excluded = new Set(tagsPointingAtHead(cwd))
  if (currentTag) {
    excluded.add(currentTag)
  }

  const args = ['describe', '--tags', '--abbrev=0', '--match', 'v*']
  for (const tag of excluded) {
    args.push(`--exclude=${tag}`)
  }
  args.push('HEAD')

  try {
    return runGit(args, cwd)
  } catch {
    return ''
  }
}

export function resolveRange({
  cwd = process.cwd(),
  from = '',
  to = 'HEAD',
  currentTag = ''
} = {}) {
  if (from) {
    return { from, to }
  }
  const tag = currentTag || (process.env.GITHUB_REF_NAME || '').trim()
  const base = resolvePreviousTag({ cwd, currentTag: /^v/.test(tag) ? tag : '' })
  return { from: base, to }
}

export function collectCommits({ cwd = process.cwd(), from = '', to = 'HEAD', limit = 0 } = {}) {
  if (!hasGitRepo(cwd)) {
    return []
  }

  const range = from ? `${from}..${to}` : to
  const effectiveLimit = limit > 0 ? limit : from ? 0 : FALLBACK_COMMIT_LIMIT
  const args = [
    'log',
    '--no-merges',
    `--format=%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`
  ]
  if (effectiveLimit > 0) {
    args.push('-n', String(effectiveLimit))
  }
  args.push(range)

  let raw = ''
  try {
    raw = runGit(args, cwd)
  } catch {
    return []
  }

  return raw
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body = ''] = record.split(FIELD_SEPARATOR)
      return {
        hash: (hash || '').trim(),
        subject: (subject || '').trim(),
        body: (body || '').trim()
      }
    })
}

export function groupCommits(commits = []) {
  const buckets = new Map(SECTION_ORDER.map((key) => [key, []]))
  const seen = new Set()

  for (const commit of commits) {
    if (shouldSkipCommit(commit)) {
      continue
    }

    const parsed = parseCommit(commit.subject, commit.body)
    if (!parsed.subject) {
      continue
    }

    const dedupeKey = parsed.subject.toLowerCase()
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)

    const section = parsed.breaking ? 'breaking' : TYPE_TO_SECTION[parsed.type] || 'other'
    buckets.get(section).push(parsed.subject)
  }

  return SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    items: buckets.get(key)
  })).filter((section) => section.items.length > 0)
}

export function buildChangelog({
  version,
  sections = [],
  from = '',
  to = 'HEAD',
  repo = '',
  withFooter = true
} = {}) {
  const blocks = []

  // 只有版本标题、没有实际条目时视为空，交由调用方给出「无新提交」的提示
  if (!sections.length) {
    return ''
  }

  if (version) {
    blocks.push(`# ${version}`)
  }

  for (const section of sections) {
    if (!section.items.length) {
      continue
    }
    const items = section.items.map((item) => `- ${item}`).join('\n')
    blocks.push(`## ${section.title}\n\n${items}`)
  }

  if (!blocks.length) {
    return ''
  }

  if (withFooter && repo && from) {
    blocks.push(
      `**完整变更**：[${from}...${to}](https://github.com/${repo}/compare/${from}...${to})`
    )
  }

  return `${blocks.join('\n\n')}\n`
}

/**
 * 根据 commit 生成修改记录。返回值里的 `markdown` 为空即表示没有可用提交。
 */
export function generateChangelog({
  version,
  cwd = process.cwd(),
  from = '',
  to = 'HEAD',
  limit = 0,
  toLabel = '',
  repo = process.env.GITHUB_REPOSITORY || '',
  withFooter = true
} = {}) {
  const range = resolveRange({ cwd, from, to })
  const commits = collectCommits({ cwd, from: range.from, to: range.to, limit })
  const sections = groupCommits(commits)
  // 对比链接里的右端用真实 ref 名（tag 或分支），`HEAD` 在 GitHub 上无法比较
  const label = toLabel || (process.env.GITHUB_REF_NAME || '').trim() || range.to
  const markdown = buildChangelog({
    version,
    sections,
    from: range.from,
    to: label,
    repo,
    withFooter
  })

  return { markdown, sections, commits, range, source: 'commits' }
}

function readManualChangelog(cwd, file) {
  const path = resolve(cwd, file)
  if (!existsSync(path)) {
    return ''
  }
  return readFileSync(path, 'utf-8').trim()
}

/**
 * 统一的修改记录入口：默认按 commit 生成，`CHANGELOG_SOURCE=file` 时改用仓库内的
 * changelog.md（手工撰写/临时覆盖用）。
 */
export function resolveChangelog({
  version,
  cwd = process.cwd(),
  source = process.env.CHANGELOG_SOURCE || 'auto',
  manualFile = 'changelog.md',
  ...rest
} = {}) {
  if (source === 'file') {
    return {
      markdown: readManualChangelog(cwd, manualFile),
      source: 'file',
      sections: [],
      commits: []
    }
  }

  const generated = generateChangelog({ version, cwd, ...rest })
  if (generated.markdown.trim()) {
    return generated
  }

  // git 不可用（例如没有历史的工作区）才退回手工文件，避免用旧记录冒充新版本
  if (!hasGitRepo(cwd)) {
    const manual = readManualChangelog(cwd, manualFile)
    if (manual) {
      return { markdown: manual, source: 'file', sections: [], commits: [] }
    }
  }

  const emptyNote = [version ? `# ${version}` : '', '## 其他\n\n- 本次发布没有新的提交记录']
    .filter(Boolean)
    .join('\n\n')

  return { markdown: `${emptyNote}\n`, sections: [], commits: [], source: 'empty' }
}

function parseArgs(argv) {
  const options = { write: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    switch (arg) {
      case '--from':
        options.from = next
        index += 1
        break
      case '--to':
        options.to = next
        index += 1
        break
      case '--version':
        options.version = next
        index += 1
        break
      case '--limit':
        options.limit = Number.parseInt(next, 10) || 0
        index += 1
        break
      case '--source':
        options.source = next
        index += 1
        break
      case '--write':
      case '--out':
        options.write = next
        index += 1
        break
      case '--no-footer':
        options.withFooter = false
        break
      default:
        break
    }
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = resolveChangelog({
    version: options.version ?? getProcessedVersion(),
    from: options.from || '',
    to: options.to || 'HEAD',
    limit: options.limit || 0,
    source: options.source,
    withFooter: options.withFooter
  })

  if (options.write) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(options.write, result.markdown)
    console.log(`[changelog] 已写入 ${options.write}（来源：${result.source}）`)
    return
  }

  process.stdout.write(result.markdown)
  console.log(`\n[changelog] 来源：${result.source}，提交数：${result.commits.length}`)
}

const entry = process.argv[1] ? resolve(process.argv[1]) : ''
const self = fileURLToPath(import.meta.url)
const isDirectRun =
  entry &&
  (process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self)

if (isDirectRun) {
  main().catch((error) => {
    console.error('[changelog] 生成失败:', error.message)
    process.exit(1)
  })
}
