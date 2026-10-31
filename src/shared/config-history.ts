/**
 * 配置快照的纯逻辑：快照是否该建、该删哪些、以及两份配置的逐行差异。
 *
 * 主进程负责落盘（见 src/main/core/configHistory.ts），这里只做判断与文本处理，
 * 方便单测——配置回滚是有破坏性的操作，算法必须先被测试钉死。
 */

export type ConfigSnapshotReason = 'auto' | 'manual' | 'beforeRestore'

export interface IConfigSnapshotFile {
  name: string
  size: number
}

export interface IConfigSnapshotMeta {
  id: string
  createdAt: number
  reason: ConfigSnapshotReason
  files: IConfigSnapshotFile[]
}

export interface IConfigSnapshotDiff {
  name: string
  before: string
  after: string
}

export interface IConfigDiffLine {
  type: 'context' | 'add' | 'del'
  text: string
}

export interface IConfigLineDiff {
  added: number
  removed: number
  /** 带上下文的变化行；没有差异时为上下文窗口 */
  lines: IConfigDiffLine[]
  /** 差异过大被截断时置位，界面要如实提示「只显示了前 N 行」 */
  truncated: boolean
}

/** 差异矩阵上限：超过就只给统计数字，不硬算（配置可能几千行） */
const MAX_DIFF_CELLS = 4_000_000

/** 快照保留份数 */
export const CONFIG_SNAPSHOT_KEEP = 20

/** 自动快照的最小间隔：一天最多一次自动快照，避免刷目录 */
export const CONFIG_SNAPSHOT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 目录名用本地时间，肉眼可读：20261027-2317 */
export function snapshotIdFromTime(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`
}

/** 文件集合是否变化（名字或大小任一不同就算变），用于判断自动快照是否值得再建一份 */
export function hasSnapshotChanged(
  previous: IConfigSnapshotFile[] | undefined,
  next: IConfigSnapshotFile[]
): boolean {
  if (!previous) return true
  if (previous.length !== next.length) return true
  const prevMap = new Map(previous.map((file) => [file.name, file.size]))
  return next.some((file) => prevMap.get(file.name) !== file.size)
}

/** 到点该不该自动快照：没有历史、隔了足够久、或者配置本身变了 */
export function isSnapshotDue(
  previous: IConfigSnapshotMeta | undefined,
  files: IConfigSnapshotFile[],
  now: number,
  minIntervalMs = CONFIG_SNAPSHOT_MIN_INTERVAL_MS
): boolean {
  if (!previous) return true
  if (hasSnapshotChanged(previous.files, files)) return true
  return now - previous.createdAt >= minIntervalMs
}

/** 需要删除的快照 id：按 createdAt 从旧到新，超出保留份数的部分 */
export function pruneSnapshotIds(
  metas: IConfigSnapshotMeta[],
  keep = CONFIG_SNAPSHOT_KEEP
): string[] {
  const sorted = [...metas].sort((a, b) => a.createdAt - b.createdAt)
  if (sorted.length <= keep) return []
  return sorted.slice(0, sorted.length - keep).map((meta) => meta.id)
}

function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // 结尾换行会多切出一个空串，去掉它，否则「文件末尾有没有换行」会被当成内容变化
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function computeOps(a: string[], b: string[]): IConfigDiffLine[] {
  const n = a.length
  const m = b.length
  const dp: Uint32Array[] = []
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: IConfigDiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'context', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] })
      i++
    } else {
      ops.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] })
  while (j < m) ops.push({ type: 'add', text: b[j++] })
  return ops
}

/**
 * 逐行差异。先掐掉首尾相同的部分再算 LCS，几千行配置也只算中间那一段；
 * 中间仍过大时退化成「只给条数」，绝不把界面卡死。
 */
export function diffLines(
  before: string,
  after: string,
  context = 3,
  maxLines = 400
): IConfigLineDiff {
  const a = splitLines(before)
  const b = splitLines(after)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (midA.length * midB.length > MAX_DIFF_CELLS) {
    return { added: midB.length, removed: midA.length, lines: [], truncated: true }
  }

  const head = a.slice(Math.max(0, start - context), start).map<IConfigDiffLine>((text) => ({
    type: 'context',
    text
  }))
  const tail = a.slice(endA, endA + context).map<IConfigDiffLine>((text) => ({
    type: 'context',
    text
  }))
  const middle = computeOps(midA, midB)
  const all = [...head, ...middle, ...tail]

  const added = middle.filter((line) => line.type === 'add').length
  const removed = middle.filter((line) => line.type === 'del').length
  const truncated = all.length > maxLines
  return { added, removed, lines: truncated ? all.slice(0, maxLines) : all, truncated }
}
