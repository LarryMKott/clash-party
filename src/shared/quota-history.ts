/**
 * 订阅额度的每日用量账本。
 *
 * 机场只在 `subscription-userinfo` 里给一个累计值，看不出「哪天用了多少」；
 * 这里按采样差值把它拆成按天（本地时区）的用量，供额度面板画趋势。
 * 约定：两次采样之间的增量记到「后一次采样所在的那天」——我们只知道它发生在
 * 这个区间里，把区间收益归给采样日比按比例瞎拆更不容易骗人。
 * 纯函数实现：主进程负责读写文件，判定逻辑全在这里，方便单测。
 */

/** 账本最多保留多少天，超过就丢弃最旧的 */
export const QUOTA_HISTORY_DAYS = 30

export interface IQuotaHistory {
  /** 上一次采样到的累计用量 */
  last: number
  /** YYYY-MM-DD（本地时区）→ 当天消耗的字节数 */
  days: Record<string, number>
  updatedAt: number
}

export interface IQuotaDayUsage {
  date: string
  bytes: number
}

export interface IQuotaHistorySummary {
  /** 升序，长度等于窗口天数，没有用量的那天填 0 */
  days: IQuotaDayUsage[]
  windowBytes: number
  /** 窗口内日均；窗口里一条用量都没有时为 null，避免显示 0 B 误导用户 */
  averageDaily: number | null
  hasSample: boolean
}

const DAY_MS = 86_400_000

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

export function localDateKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 以本地正午为锚点跨天，避开夏令时的 23/25 小时日 */
function shiftDayKey(key: string, offset: number): string {
  const [year, month, day] = key.split('-').map(Number)
  return localDateKey(new Date(year, month - 1, day, 12, 0, 0, 0).getTime() + offset * DAY_MS)
}

function pruneDays(days: Record<string, number>, now: number): Record<string, number> {
  const oldest = shiftDayKey(localDateKey(now), -(QUOTA_HISTORY_DAYS - 1))
  const kept: Record<string, number> = {}
  for (const [key, value] of Object.entries(days)) {
    if (key >= oldest && Number.isFinite(value) && value > 0) kept[key] = value
  }
  return kept
}

/**
 * 把一次采样并进账本。
 *
 * - 累计值变大 → 差值记到当天；
 * - 累计值变小（机场重置流量 / 换套餐）→ 当天不记负数，只把基准拉回新值；
 * - 累计值没变 → 不产生新的用量记录，但刷新采样时间。
 */
export function recordQuotaUsage(
  history: IQuotaHistory | undefined,
  usedTotal: number,
  now: number
): IQuotaHistory {
  if (!Number.isFinite(usedTotal) || usedTotal < 0) {
    return history ?? { last: 0, days: {}, updatedAt: now }
  }
  if (!history) return { last: usedTotal, days: {}, updatedAt: now }

  const delta = usedTotal - history.last
  const days = pruneDays(history.days, now)
  if (delta > 0) {
    const key = localDateKey(now)
    days[key] = (days[key] ?? 0) + delta
  }
  return { last: usedTotal, days, updatedAt: now }
}

export function summarizeQuotaHistory(
  history: IQuotaHistory | undefined,
  now: number,
  windowDays = 7
): IQuotaHistorySummary {
  const span = Math.max(1, Math.min(Math.floor(windowDays) || 1, QUOTA_HISTORY_DAYS))
  const today = localDateKey(now)
  const days: IQuotaDayUsage[] = []
  let windowBytes = 0

  for (let offset = span - 1; offset >= 0; offset--) {
    const date = shiftDayKey(today, -offset)
    const bytes = history?.days[date] ?? 0
    days.push({ date, bytes })
    windowBytes += bytes
  }

  return {
    days,
    windowBytes,
    averageDaily: windowBytes > 0 ? windowBytes / span : null,
    hasSample: Boolean(history && history.updatedAt > 0)
  }
}
