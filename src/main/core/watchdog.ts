import i18next from 'i18next'
import { getAppConfig } from '../config'
import { createLogger } from '../utils/logger'
import { showNotification } from '../utils/notification'
import { getCoreOperationPhase, hasCoreProcess, restartCore } from './manager'
import { mihomoVersion } from './mihomoApi'

const watchdogLogger = createLogger('CoreWatchdog')

// 探活周期与判定阈值：连续 3 次（约 3 分钟）失联才动手，避开内核自更新、
// 配置热重载等短暂无响应窗口。进程死亡的快速恢复由 manager 的意外退出
// 自动重启负责，这里兜的是"进程还在但 API 持续失联"的长尾场景（#159）。
export const coreWatchdogIntervalMs = 60000
export const coreWatchdogFailureThreshold = 3

type CorePhase = ReturnType<typeof getCoreOperationPhase>

let watchdogTimer: NodeJS.Timeout | null = null
let consecutiveFailures = 0
let watchdogRecovering = false

export function shouldAttemptWatchdogRestart(
  phase: CorePhase,
  failures: number,
  enabled: boolean
): boolean {
  if (!enabled) return false
  if (phase !== 'ready') return false
  return failures >= coreWatchdogFailureThreshold
}

async function probeCoreAlive(): Promise<boolean> {
  if (!hasCoreProcess()) return false
  try {
    await mihomoVersion()
    return true
  } catch {
    return false
  }
}

export async function runWatchdogCheck(): Promise<void> {
  try {
    const { coreWatchdog } = await getAppConfig()
    if (coreWatchdog === false) {
      consecutiveFailures = 0
      return
    }

    const phase = getCoreOperationPhase()
    if (await probeCoreAlive()) {
      consecutiveFailures = 0
      return
    }
    consecutiveFailures += 1

    if (!shouldAttemptWatchdogRestart(phase, consecutiveFailures, true)) return

    // 无论重启成败都从新一轮计数开始，避免旧计数越积越多导致误判
    consecutiveFailures = 0
    if (watchdogRecovering) return
    watchdogRecovering = true
    try {
      await restartCore()
      watchdogLogger.info('Unresponsive core restarted by watchdog')
      showNotification({
        id: 'core-watchdog',
        title: i18next.t('core.watchdog.title'),
        body: i18next.t('core.watchdog.restarted')
      })
    } catch (error) {
      watchdogLogger.error('Watchdog core restart failed', error)
      showNotification({
        id: 'core-watchdog',
        title: i18next.t('core.watchdog.title'),
        body: i18next.t('core.watchdog.restartFailed')
      })
    } finally {
      watchdogRecovering = false
    }
  } catch (error) {
    watchdogLogger.warn('Watchdog check failed', error)
  }
}

export function startCoreWatchdog(): void {
  if (watchdogTimer) return
  watchdogTimer = setInterval(() => {
    void runWatchdogCheck()
  }, coreWatchdogIntervalMs)
  // 计时器不阻止应用退出
  watchdogTimer.unref()
}

export function stopCoreWatchdog(): void {
  if (!watchdogTimer) return
  clearInterval(watchdogTimer)
  watchdogTimer = null
  consecutiveFailures = 0
}
