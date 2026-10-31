import { mkdir, readdir, readFile, rm, stat } from 'fs/promises'
import path from 'path'
import { getAppConfig, getControledMihomoConfig, getProfileConfig } from '../config'
import {
  appConfigPath,
  configHistoryDir,
  controledMihomoConfigPath,
  overrideConfigPath,
  profileConfigPath
} from '../utils/dirs'
import { logger } from '../utils/logger'
import { atomicWriteFile } from '../utils/safeFile'
import {
  CONFIG_SNAPSHOT_KEEP,
  isSnapshotDue,
  pruneSnapshotIds,
  snapshotIdFromTime,
  type ConfigSnapshotReason,
  type IConfigSnapshotDiff,
  type IConfigSnapshotFile,
  type IConfigSnapshotMeta
} from '../../shared/config-history'

/**
 * 本地配置快照：
 * 启动、手动、回滚前各存一份「当时磁盘上的配置文件」，出问题可以整份退回去。
 *
 * 只收四个用户可编辑的文件。simple-config.yaml 故意不收——它是简化模式的
 * draft/published 状态机，单独回滚会和内存里的已发布配置对不上。
 */
const SNAPSHOT_FILES: { name: string; path: () => string }[] = [
  { name: 'mihomo.yaml', path: controledMihomoConfigPath },
  { name: 'profile.yaml', path: profileConfigPath },
  { name: 'override.yaml', path: overrideConfigPath },
  { name: 'config.yaml', path: appConfigPath }
]

function snapshotDir(id: string): string {
  return path.join(configHistoryDir(), id)
}

function targetPath(name: string): string | undefined {
  return SNAPSHOT_FILES.find((file) => file.name === name)?.path()
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

async function readMeta(dir: string): Promise<IConfigSnapshotMeta | undefined> {
  try {
    const raw = await readFile(path.join(dir, 'meta.json'), 'utf-8')
    const meta = JSON.parse(raw) as IConfigSnapshotMeta
    if (!meta?.id || !Array.isArray(meta.files)) return undefined
    return meta
  } catch {
    return undefined
  }
}

export async function listConfigSnapshots(): Promise<IConfigSnapshotMeta[]> {
  const root = configHistoryDir()
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  const metas: IConfigSnapshotMeta[] = []
  for (const entry of entries) {
    const meta = await readMeta(path.join(root, entry))
    if (meta) metas.push(meta)
  }
  return metas.sort((a, b) => b.createdAt - a.createdAt)
}

/** 目录名精确到分钟，同一分钟内连建两次要加后缀，不能互相覆盖 */
async function allocateSnapshotId(now: number): Promise<string> {
  const base = snapshotIdFromTime(now)
  for (let suffix = 1; suffix < 100; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`
    try {
      await stat(snapshotDir(candidate))
    } catch {
      return candidate
    }
  }
  throw new Error('Too many config snapshots in the same minute')
}

export async function createConfigSnapshot(
  reason: ConfigSnapshotReason
): Promise<IConfigSnapshotMeta | null> {
  const now = Date.now()
  const contents: { name: string; content: string; size: number }[] = []
  for (const file of SNAPSHOT_FILES) {
    const content = await readIfExists(file.path())
    if (content === undefined) continue
    contents.push({ name: file.name, content, size: Buffer.byteLength(content, 'utf8') })
  }
  if (contents.length === 0) return null

  const id = await allocateSnapshotId(now)
  const dir = snapshotDir(id)
  await mkdir(dir, { recursive: true })
  for (const file of contents) {
    await atomicWriteFile(path.join(dir, file.name), file.content)
  }
  const files: IConfigSnapshotFile[] = contents.map((file) => ({
    name: file.name,
    size: file.size
  }))
  const meta: IConfigSnapshotMeta = { id, createdAt: now, reason, files }
  await atomicWriteFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))

  const stale = pruneSnapshotIds(await listConfigSnapshots(), CONFIG_SNAPSHOT_KEEP)
  for (const staleId of stale) {
    await rm(snapshotDir(staleId), { recursive: true, force: true }).catch((error) =>
      logger.warn(`[ConfigHistory] Failed to prune snapshot ${staleId}`, error)
    )
  }
  return meta
}

/** 与磁盘上的当前配置逐文件比对，只返回有差异的文件 */
export async function diffConfigSnapshot(id: string): Promise<IConfigSnapshotDiff[]> {
  const dir = snapshotDir(id)
  const meta = await readMeta(dir)
  if (!meta) throw new Error('Config snapshot not found')
  const diffs: IConfigSnapshotDiff[] = []
  for (const file of meta.files) {
    const before = await readIfExists(path.join(dir, file.name))
    if (before === undefined) continue
    const after = (await readIfExists(targetPath(file.name) ?? '')) ?? ''
    if (before === after) continue
    diffs.push({ name: file.name, before, after })
  }
  return diffs
}

async function applyRestoredConfig(): Promise<void> {
  // 缓存不刷新的话，写入磁盘的新配置要等下次重启才会生效，等于「假回滚」
  await getAppConfig(true).catch(() => undefined)
  await getProfileConfig(true).catch(() => undefined)
  await getControledMihomoConfig(true).catch(() => undefined)

  const { mainWindow } = await import('../window')
  mainWindow?.webContents.send('appConfigUpdated')
  mainWindow?.webContents.send('profileConfigUpdated')
  mainWindow?.webContents.send('controledMihomoConfigUpdated')

  try {
    const { restartCore } = await import('./manager')
    await restartCore()
  } catch (error) {
    // 内核没跑或重启失败都不影响配置已经落盘，交给用户手动重启
    await logger.warn('[ConfigHistory] Failed to restart core after restore', error)
  }
}

export async function restoreConfigSnapshot(id: string): Promise<void> {
  const dir = snapshotDir(id)
  const meta = await readMeta(dir)
  if (!meta) throw new Error('Config snapshot not found')

  // 回滚本身也要可回滚：先把当前状态存一份
  await createConfigSnapshot('beforeRestore')

  for (const file of meta.files) {
    const target = targetPath(file.name)
    if (!target) continue
    const content = await readFile(path.join(dir, file.name), 'utf-8')
    await atomicWriteFile(target, content)
  }
  await applyRestoredConfig()
}

export async function removeConfigSnapshot(id: string): Promise<void> {
  if (!/^[0-9]{8}-[0-9]{4}(-[0-9]{1,2})?$/.test(id)) throw new Error('Invalid snapshot id')
  await rm(snapshotDir(id), { recursive: true, force: true })
}

/** 应用启动时调用：配置有变化或距上次自动快照够久就存一份 */
export async function initConfigHistory(): Promise<void> {
  try {
    const metas = await listConfigSnapshots()
    const files: IConfigSnapshotFile[] = []
    for (const file of SNAPSHOT_FILES) {
      const content = await readIfExists(file.path())
      if (content !== undefined) {
        files.push({ name: file.name, size: Buffer.byteLength(content, 'utf8') })
      }
    }
    if (files.length === 0) return
    // 只看最近一次「自动」快照：手动快照不该阻塞当天的自动存档
    const latestAuto = metas.find((meta) => meta.reason === 'auto')
    if (!isSnapshotDue(latestAuto, files, Date.now())) return
    await createConfigSnapshot('auto')
  } catch (error) {
    await logger.warn('[ConfigHistory] Failed to create startup snapshot', error)
  }
}
