import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  coreWatchdogFailureThreshold,
  runWatchdogCheck,
  shouldAttemptWatchdogRestart,
  stopCoreWatchdog
} from './watchdog'

const mocks = vi.hoisted(() => ({
  getCoreOperationPhase: vi.fn(),
  hasCoreProcess: vi.fn(),
  restartCore: vi.fn(),
  mihomoVersion: vi.fn(),
  getAppConfig: vi.fn(),
  showNotification: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('electron', () => ({ app: {} }))
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }))
vi.mock('../config', () => ({ getAppConfig: mocks.getAppConfig }))
vi.mock('../utils/logger', () => ({ createLogger: () => mocks.logger }))
vi.mock('../utils/notification', () => ({ showNotification: mocks.showNotification }))
vi.mock('./manager', () => ({
  getCoreOperationPhase: mocks.getCoreOperationPhase,
  hasCoreProcess: mocks.hasCoreProcess,
  restartCore: mocks.restartCore
}))
vi.mock('./mihomoApi', () => ({ mihomoVersion: mocks.mihomoVersion }))

function mockCoreDown(phase: string): void {
  mocks.getAppConfig.mockResolvedValue({ coreWatchdog: true })
  mocks.getCoreOperationPhase.mockReturnValue(phase)
  mocks.hasCoreProcess.mockReturnValue(true)
  mocks.mihomoVersion.mockRejectedValue(new Error('connection failed'))
}

describe('shouldAttemptWatchdogRestart', () => {
  it('only acts in ready phase after reaching the failure threshold', () => {
    expect(shouldAttemptWatchdogRestart('ready', coreWatchdogFailureThreshold, true)).toBe(true)
    expect(shouldAttemptWatchdogRestart('ready', coreWatchdogFailureThreshold - 1, true)).toBe(
      false
    )
    expect(shouldAttemptWatchdogRestart('initializing', 10, true)).toBe(false)
    expect(shouldAttemptWatchdogRestart('blocked', 10, true)).toBe(false)
    expect(shouldAttemptWatchdogRestart('shutting-down', 10, true)).toBe(false)
  })

  it('never acts when the setting is disabled', () => {
    expect(shouldAttemptWatchdogRestart('ready', 100, false)).toBe(false)
  })
})

describe('runWatchdogCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopCoreWatchdog()
  })

  it('restarts the core after consecutive failures and notifies the user', async () => {
    mockCoreDown('ready')
    mocks.restartCore.mockResolvedValue(undefined)

    await runWatchdogCheck()
    await runWatchdogCheck()
    expect(mocks.restartCore).not.toHaveBeenCalled()

    await runWatchdogCheck()
    expect(mocks.restartCore).toHaveBeenCalledTimes(1)
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'core-watchdog' })
    )
  })

  it('resets the failure counter when the core comes back', async () => {
    mockCoreDown('ready')
    mocks.restartCore.mockResolvedValue(undefined)

    await runWatchdogCheck()
    await runWatchdogCheck()
    mocks.mihomoVersion.mockResolvedValue({ version: '1.0' })
    await runWatchdogCheck()

    mocks.mihomoVersion.mockRejectedValue(new Error('connection failed'))
    await runWatchdogCheck()
    await runWatchdogCheck()
    expect(mocks.restartCore).not.toHaveBeenCalled()
  })

  it('does not restart while the core is initializing', async () => {
    mockCoreDown('initializing')
    mocks.restartCore.mockResolvedValue(undefined)

    for (let i = 0; i < coreWatchdogFailureThreshold + 1; i++) {
      await runWatchdogCheck()
    }
    expect(mocks.restartCore).not.toHaveBeenCalled()
  })

  it('does nothing when the setting is disabled', async () => {
    mockCoreDown('ready')
    mocks.getAppConfig.mockResolvedValue({ coreWatchdog: false })

    for (let i = 0; i < coreWatchdogFailureThreshold + 1; i++) {
      await runWatchdogCheck()
    }
    expect(mocks.mihomoVersion).not.toHaveBeenCalled()
    expect(mocks.restartCore).not.toHaveBeenCalled()
  })

  it('notifies with the failure message when the restart itself fails', async () => {
    mockCoreDown('ready')
    mocks.restartCore.mockRejectedValue(new Error('start failed'))

    for (let i = 0; i < coreWatchdogFailureThreshold; i++) {
      await runWatchdogCheck()
    }
    expect(mocks.restartCore).toHaveBeenCalledTimes(1)
    expect(mocks.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'core-watchdog', body: 'core.watchdog.restartFailed' })
    )
  })
})
