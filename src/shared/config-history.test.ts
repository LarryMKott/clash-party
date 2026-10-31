import { describe, expect, it } from 'vitest'
import {
  diffLines,
  hasSnapshotChanged,
  isSnapshotDue,
  pruneSnapshotIds,
  snapshotIdFromTime,
  type IConfigSnapshotMeta
} from './config-history'

const meta = (id: string, createdAt: number): IConfigSnapshotMeta => ({
  id,
  createdAt,
  reason: 'auto',
  files: []
})

describe('snapshotIdFromTime', () => {
  it('用本地时间生成可读目录名', () => {
    expect(snapshotIdFromTime(new Date(2026, 9, 27, 23, 17, 45).getTime())).toBe('20261027-2317')
    expect(snapshotIdFromTime(new Date(2026, 0, 5, 8, 3, 0).getTime())).toBe('20260105-0803')
  })
})

describe('hasSnapshotChanged', () => {
  it('没有历史时视为变化', () => {
    expect(hasSnapshotChanged(undefined, [{ name: 'a.yaml', size: 1 }])).toBe(true)
  })

  it('名字与大小都一致才算没变', () => {
    const files = [
      { name: 'mihomo.yaml', size: 100 },
      { name: 'config.yaml', size: 10 }
    ]
    expect(hasSnapshotChanged(files, [...files])).toBe(false)
    expect(hasSnapshotChanged(files, [{ name: 'mihomo.yaml', size: 101 }, files[1]])).toBe(true)
    expect(hasSnapshotChanged(files, [files[0]])).toBe(true)
  })
})

describe('isSnapshotDue', () => {
  const files = [{ name: 'mihomo.yaml', size: 100 }]
  const now = new Date(2026, 9, 27, 12, 0, 0).getTime()

  it('第一次一定建', () => {
    expect(isSnapshotDue(undefined, files, now)).toBe(true)
  })

  it('配置没变且没到间隔，不重复建', () => {
    const previous = { ...meta('20261027-0000', now - 3600_000), files }
    expect(isSnapshotDue(previous, files, now)).toBe(false)
  })

  it('配置变了立刻建', () => {
    const previous = { ...meta('20261027-0000', now - 60_000), files }
    expect(isSnapshotDue(previous, [{ name: 'mihomo.yaml', size: 200 }], now, 6 * 3600_000)).toBe(
      true
    )
    // 文件集合少了一个也算变
    expect(isSnapshotDue(previous, [], now, 6 * 3600_000)).toBe(true)
  })

  it('超过最小间隔也建一份', () => {
    const previous = { ...meta('20261026-0000', now - 7 * 3600_000), files }
    expect(isSnapshotDue(previous, [...files], now)).toBe(true)
  })
})

describe('pruneSnapshotIds', () => {
  it('超出保留份数时删最旧的', () => {
    const metas = [meta('a', 1), meta('b', 2), meta('c', 3), meta('d', 4)]
    expect(pruneSnapshotIds(metas, 2).sort()).toEqual(['a', 'b'])
  })

  it('没超出就一份都不删', () => {
    expect(pruneSnapshotIds([meta('a', 1), meta('b', 2)], 2)).toEqual([])
  })

  it('乱序传入也能正确挑出最旧的', () => {
    const metas = [meta('c', 30), meta('a', 10), meta('b', 20)]
    expect(pruneSnapshotIds(metas, 1)).toEqual(['a', 'b'])
  })
})

describe('diffLines', () => {
  it('完全相同没有任何变化', () => {
    const result = diffLines('a: 1\nb: 2\n', 'a: 1\nb: 2\n')
    expect(result.added).toBe(0)
    expect(result.removed).toBe(0)
    expect(result.truncated).toBe(false)
  })

  it('新增行只算 added', () => {
    const result = diffLines('a: 1\n', 'a: 1\nb: 2\n')
    expect(result.added).toBe(1)
    expect(result.removed).toBe(0)
    expect(result.lines.filter((line) => line.type === 'add').map((line) => line.text)).toContain(
      'b: 2'
    )
  })

  it('删除行只算 removed', () => {
    const result = diffLines('a: 1\nb: 2\n', 'a: 1\n')
    expect(result.added).toBe(0)
    expect(result.removed).toBe(1)
    expect(result.lines.filter((line) => line.type === 'del').map((line) => line.text)).toContain(
      'b: 2'
    )
  })

  it('改值是增删各一行', () => {
    const result = diffLines('port: 7890\n', 'port: 7891\n')
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
  })

  it('CRLF 不会被当成差异', () => {
    const result = diffLines('a: 1\r\nb: 2\r\n', 'a: 1\nb: 2\n')
    expect(result.added).toBe(0)
    expect(result.removed).toBe(0)
  })

  it('空文件与有内容', () => {
    const result = diffLines('', 'a: 1\n')
    expect(result.added).toBe(1)
    expect(result.removed).toBe(0)
  })

  it('带上下文，只给出变化附近的若干行', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n')
    const after = before.replace('line10', 'changed')
    const result = diffLines(before, after, 1)
    // head 1 行 + 变化 2 行 + tail 1 行
    expect(result.lines.length).toBe(4)
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
  })

  it('行数超过上限时截断并置位', () => {
    const before = Array.from({ length: 50 }, (_, i) => `a${i}`).join('\n')
    const after = Array.from({ length: 50 }, (_, i) => `b${i}`).join('\n')
    const result = diffLines(before, after, 3, 10)
    expect(result.truncated).toBe(true)
    expect(result.lines.length).toBe(10)
  })

  it('差异矩阵过大时只给统计，不返回逐行内容', () => {
    const before = Array.from({ length: 2100 }, (_, i) => `a${i}`).join('\n')
    const after = Array.from({ length: 2100 }, (_, i) => `b${i}`).join('\n')
    const result = diffLines(before, after)
    expect(result.truncated).toBe(true)
    expect(result.lines).toEqual([])
    expect(result.added).toBe(2100)
    expect(result.removed).toBe(2100)
  })
})
