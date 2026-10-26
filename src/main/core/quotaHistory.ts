import { readFile } from 'fs/promises'
import { getCurrentProfileItem } from '../config'
import { quotaHistoryPath } from '../utils/dirs'
import { logger } from '../utils/logger'
import { atomicWriteFile, WriteQueue } from '../utils/safeFile'
import { recordQuotaUsage, summarizeQuotaHistory } from '../../shared/quota-history'
import type { IQuotaHistory, IQuotaHistorySummary } from '../../shared/quota-history'

/** profileId → 该订阅的每日用量账本 */
type QuotaHistoryStore = Record<string, IQuotaHistory>

const writeQueue = new WriteQueue()
let cache: QuotaHistoryStore | null = null

async function loadStore(): Promise<QuotaHistoryStore> {
  if (cache) return cache
  try {
    const raw = await readFile(quotaHistoryPath(), 'utf-8')
    const parsed = JSON.parse(raw) as QuotaHistoryStore
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // 文件不存在或已损坏都不该影响额度判定，直接当空账本重来
    cache = {}
  }
  return cache
}

async function persist(store: QuotaHistoryStore): Promise<void> {
  await writeQueue.run(async () => {
    await atomicWriteFile(quotaHistoryPath(), JSON.stringify(store))
  })
}

/**
 * 把一次额度采样写进账本。
 *
 * 只在账本真的变化时才落盘：渲染层每 5 分钟轮询一次，用量没增长（大多数时候）
 * 就不该反复写文件。首帧采样要落盘，否则重启后又要从头攒基准。
 */
export async function recordProfileQuotaUsage(
  profileId: string,
  usedTotal: number,
  now = Date.now()
): Promise<void> {
  if (!profileId || !Number.isFinite(usedTotal) || usedTotal <= 0) return
  try {
    const store = await loadStore()
    const before = store[profileId]
    const after = recordQuotaUsage(before, usedTotal, now)
    const dirty =
      !before ||
      before.last !== after.last ||
      JSON.stringify(before.days) !== JSON.stringify(after.days)
    if (!dirty) return
    store[profileId] = after
    await persist(store)
  } catch (error) {
    await logger.warn(`[QuotaHistory] Failed to record usage for ${profileId}`, error)
  }
}

export async function summarizeProfileQuotaUsage(
  profileId: string,
  now = Date.now(),
  windowDays = 7
): Promise<IQuotaHistorySummary> {
  try {
    const store = await loadStore()
    return summarizeQuotaHistory(store[profileId], now, windowDays)
  } catch (error) {
    await logger.warn(`[QuotaHistory] Failed to read usage for ${profileId}`, error)
    return summarizeQuotaHistory(undefined, now, windowDays)
  }
}

/** 渲染层用：当前订阅最近若干天的用量 */
export async function getCurrentQuotaHistory(windowDays = 7): Promise<IQuotaHistorySummary> {
  const item = await getCurrentProfileItem()
  return await summarizeProfileQuotaUsage(item.id, Date.now(), windowDays)
}
