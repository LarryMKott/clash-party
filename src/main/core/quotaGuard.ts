import { Notification } from 'electron'
import i18next from 'i18next'
import { getCurrentProfileItem } from '../config'
import { updateProfileConfig } from '../config/profile'
import {
  createQuotaBaseline,
  evaluateQuota,
  isQuotaRecovered,
  needsQuotaRebaseline,
  shouldNotifyQuota
} from '../../shared/quota'
import type { IQuotaStatus, QuotaState } from '../../shared/quota'
import { formatTraffic } from '../../shared/traffic-format'
import { logger } from '../utils/logger'
import { recordProfileQuotaUsage } from './quotaHistory'

/** 额度只在订阅更新时刷新，30 分钟评估一次足够；真正变化的是我们自己的采样速率 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

let timer: NodeJS.Timeout | null = null

/**
 * 只改额度相关的两个字段，不整条覆盖 IProfileItem：
 * 后台订阅更新可能同时写 extra，整条写回会把它覆盖回旧值。
 */
async function patchQuotaFields(id: string, patch: Partial<IProfileItem>): Promise<void> {
  try {
    await updateProfileConfig((config) => {
      const target = config.items.find((item) => item.id === id)
      if (target) Object.assign(target, patch)
      return config
    })
  } catch (error) {
    await logger.warn(`[QuotaGuard] Failed to persist quota state for ${id}`, error)
  }
}

function showQuotaNotification(name: string, status: IQuotaStatus): void {
  try {
    if (!Notification.isSupported()) return
    const params = {
      name,
      percent: Math.round(status.percent * 100),
      remaining: formatTraffic(status.remaining),
      days: status.daysToExpire === null ? 0 : Math.max(0, Math.ceil(status.daysToExpire))
    }
    new Notification({
      title: String(i18next.t('profiles.quota.notify.title')),
      body: String(i18next.t(`profiles.quota.notify.${status.state}`, params))
    }).show()
  } catch (error) {
    void logger.warn('[QuotaGuard] Failed to show quota notification', error)
  }
}

/**
 * 评估当前订阅的额度。
 *
 * - 首次评估 / 机场重置 / 换套餐时重建采样基准，否则日均速率会被历史数据带偏；
 * - `notify` 只影响是否推送系统通知，读取状态（渲染层轮询）时不要打扰用户；
 * - 已通知过的状态写回 profile，避免重启应用后又提醒一遍同一件事。
 */
export async function checkQuota(options: { notify?: boolean } = {}): Promise<IQuotaStatus> {
  const { notify = false } = options
  const now = Date.now()
  const item = await getCurrentProfileItem()
  const tracked = item.type !== 'local' && Boolean(item.id)

  if (tracked && needsQuotaRebaseline(item.extra, item.quotaBaseline, now)) {
    const baseline = createQuotaBaseline(item.extra, now)
    if (baseline) {
      item.quotaBaseline = baseline
      await patchQuotaFields(item.id, { quotaBaseline: baseline })
    }
  }

  const status = evaluateQuota(item.extra, item.quotaBaseline, now)
  if (!tracked) return status

  // 额度巡检同时充当用量采样点：账本按天累计，面板据此画趋势
  await recordProfileQuotaUsage(item.id, status.used, now)

  const notified = (item.quotaNotifiedState as QuotaState | undefined) || undefined
  if (notify && shouldNotifyQuota(notified, status.state)) {
    showQuotaNotification(item.name, status)
    await patchQuotaFields(item.id, { quotaNotifiedState: status.state })
  } else if (isQuotaRecovered(notified, status.state)) {
    // 机场重置流量或换套餐后额度回到安全区，清掉标记，下次再危险还能提醒
    await patchQuotaFields(item.id, { quotaNotifiedState: status.state })
  }

  return status
}

/** 应用启动时调用一次，之后按固定间隔在后台复查 */
export async function initQuotaGuard(): Promise<void> {
  const run = (): void => {
    void checkQuota({ notify: true }).catch((error) =>
      logger.warn('[QuotaGuard] Failed to check subscription quota', error)
    )
  }
  run()
  if (timer) clearInterval(timer)
  timer = setInterval(run, CHECK_INTERVAL_MS)
  timer.unref?.()
}

export function stopQuotaGuard(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
