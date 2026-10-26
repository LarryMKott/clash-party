/**
 * 订阅额度评估：只做纯计算，不碰 IO、不返回文案。
 *
 * 数据源是订阅响应头 `subscription-userinfo`（upload/download/total/expire），已经在
 * `src/main/config/profile.ts` 的 parseSubinfo 里解析进 IProfileItem.extra。
 * 机场的额度只会被订阅更新刷新，所以「还剩多少」是准的，「每天烧多快」必须自己采样：
 * IQuotaBaseline 记录某一天已经用掉多少，之后用增量除以天数得到日均速率。
 */

export type QuotaState = 'unknown' | 'healthy' | 'warning' | 'critical' | 'exhausted' | 'expired'

const DAY_MS = 24 * 60 * 60 * 1000
/** 样本窗口短于 1 小时时算出来的日均速率没有参考价值，直接不给估算 */
const MIN_RATE_WINDOW_MS = 60 * 60 * 1000

export const QUOTA_WARNING_PERCENT = 0.7
export const QUOTA_CRITICAL_PERCENT = 0.9
/** 到期前多少天开始提示 */
export const QUOTA_EXPIRING_SOON_DAYS = 3

/** 订阅额度相关的原始字段；IProfileItem.extra 结构上兼容，测试里可以只传部分字段 */
export interface ISubscriptionQuotaInfo {
  upload?: number
  download?: number
  total?: number
  expire?: number
}

export interface IQuotaStatus {
  state: QuotaState
  /** 已用流量（上传 + 下载），字节 */
  used: number
  /** 总流量，字节；0 表示机场没下发额度 */
  total: number
  /** 剩余流量，字节，不会小于 0 */
  remaining: number
  /** 已用比例，0..1（超出额度时截断为 1） */
  percent: number
  /** 到期时间，unix 秒；0 表示长期有效 */
  expireAt: number
  /** 距到期天数，长期有效时为 null */
  daysToExpire: number | null
  /** 日均消耗，字节；样本不足时为 null */
  dailyRate: number | null
  /** 按当前速度还能用几天；无法估算时为 null */
  daysToExhausted: number | null
  /** 预计耗尽时间戳（ms）；无法估算时为 null */
  exhaustedAt: number | null
  /** 是否在到期前的提醒窗口内 */
  expiringSoon: boolean
}

/** 严重度排序：用于判断状态是否在变坏，以及是否需要推送通知 */
const STATE_RANK: Record<QuotaState, number> = {
  unknown: 0,
  healthy: 1,
  warning: 2,
  critical: 3,
  exhausted: 4,
  expired: 4
}

/** 需要推送通知的最低严重度（warning） */
const NOTIFY_MIN_RANK = STATE_RANK.warning

function safeNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

/** 上传 + 下载；undefined / NaN / 负数都按 0 处理，防止机场下发脏数据把估算带偏 */
export function quotaUsed(info: ISubscriptionQuotaInfo | undefined): number {
  if (!info) return 0
  return safeNumber(info.upload) + safeNumber(info.download)
}

export function quotaStateRank(state: QuotaState): number {
  return STATE_RANK[state]
}

/**
 * 评估当前额度。优先级：无额度 → 已过期 → 已耗尽 → 按比例分档。
 * 过期优先于耗尽：订阅到期了，剩多少流量都没意义。
 */
export function evaluateQuota(
  info: ISubscriptionQuotaInfo | undefined,
  baseline: IQuotaBaseline | undefined,
  now = Date.now()
): IQuotaStatus {
  const used = quotaUsed(info)
  const total = safeNumber(info?.total)
  const expireAt = safeNumber(info?.expire)

  const base: IQuotaStatus = {
    state: 'unknown',
    used,
    total,
    remaining: 0,
    percent: 0,
    expireAt,
    daysToExpire: null,
    dailyRate: null,
    daysToExhausted: null,
    exhaustedAt: null,
    expiringSoon: false
  }

  // 机场没下发 total 时无法判断额度，只把已经采样到的速率留着，供渲染层提示「未提供额度」
  if (total <= 0) return base

  const remaining = Math.max(0, total - used)
  const percent = Math.min(1, used / total)
  const daysToExpire = expireAt > 0 ? Math.max(0, (expireAt * 1000 - now) / DAY_MS) : null
  const expired = expireAt > 0 && now >= expireAt * 1000
  const expiringSoon = !expired && daysToExpire !== null && daysToExpire <= QUOTA_EXPIRING_SOON_DAYS

  let state: QuotaState
  if (expired) state = 'expired'
  else if (remaining <= 0) state = 'exhausted'
  else if (percent >= QUOTA_CRITICAL_PERCENT) state = 'critical'
  else if (percent >= QUOTA_WARNING_PERCENT) state = 'warning'
  else state = 'healthy'

  const dailyRate = estimateDailyRate(used, baseline, now)
  const daysToExhausted =
    dailyRate !== null && dailyRate > 0 && remaining > 0 ? remaining / dailyRate : null

  return {
    ...base,
    state,
    remaining,
    percent,
    daysToExpire,
    dailyRate,
    daysToExhausted,
    exhaustedAt: daysToExhausted === null ? null : now + daysToExhausted * DAY_MS,
    expiringSoon
  }
}

/** 基线之后平均每天消耗多少字节；样本窗口太短、流量回退（机场重置）都给 null */
function estimateDailyRate(
  used: number,
  baseline: IQuotaBaseline | undefined,
  now: number
): number | null {
  if (!baseline) return null
  const since = safeNumber(baseline.at)
  if (since <= 0 || now <= since) return null
  const elapsed = now - since
  if (elapsed < MIN_RATE_WINDOW_MS) return null
  const baselineUsed = safeNumber(baseline.used)
  if (used <= baselineUsed) return null
  return (used - baselineUsed) / (elapsed / DAY_MS)
}

/** 是否需要重建基准：没有基准、机场重置了流量、套餐总额变了（升级/降级）、系统时钟倒流 */
export function needsQuotaRebaseline(
  info: ISubscriptionQuotaInfo | undefined,
  baseline: IQuotaBaseline | undefined,
  now = Date.now()
): boolean {
  const total = safeNumber(info?.total)
  if (total <= 0) return false
  if (!baseline) return true
  const baselineAt = safeNumber(baseline.at)
  if (baselineAt <= 0 || baselineAt > now) return true
  if (baseline.total !== undefined && baseline.total !== total) return true
  return quotaUsed(info) < safeNumber(baseline.used)
}

/** 生成基准；机场没下发总额时返回 null，不写脏数据 */
export function createQuotaBaseline(
  info: ISubscriptionQuotaInfo | undefined,
  now = Date.now()
): IQuotaBaseline | null {
  const total = safeNumber(info?.total)
  if (total <= 0) return null
  return { used: quotaUsed(info), at: now, total }
}

/**
 * 状态变坏且达到告警级别时才通知。
 * 用过一次就不再重复（调用方负责持久化已通知的状态），避免每 30 分钟弹一次。
 */
export function shouldNotifyQuota(previous: QuotaState | undefined, next: QuotaState): boolean {
  const nextRank = STATE_RANK[next]
  if (nextRank < NOTIFY_MIN_RANK) return false
  const previousRank = previous ? STATE_RANK[previous] : 0
  return nextRank > previousRank
}

/** 状态是否已经好转（用于清掉「已通知」标记，下次再变坏还能提醒） */
export function isQuotaRecovered(previous: QuotaState | undefined, next: QuotaState): boolean {
  if (!previous) return false
  return STATE_RANK[next] < STATE_RANK[previous]
}

/** 需要走通知通道的状态 */
export function isQuotaAlarming(state: QuotaState): boolean {
  return STATE_RANK[state] >= NOTIFY_MIN_RANK
}
