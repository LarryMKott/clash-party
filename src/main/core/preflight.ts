/**
 * 启动体检：在内核起不来之前，先把「环境里已经不对的地方」找出来。
 *
 * `evaluatePreflight` 是纯函数，只吃探测结果；`runPreflight` 才去摸磁盘、端口和
 * 内核文件。这样绝大多数分支都能直接单测，不用 mock 一堆 fs。
 */
import { execFile } from 'child_process'
import { constants } from 'fs'
import { access, rm, statfs, writeFile } from 'fs/promises'
import { createServer } from 'net'
import { join } from 'path'
import { promisify } from 'util'
import type { PreflightCheck, PreflightLevel, PreflightReport } from '../../shared/preflight'

const execFileAsync = promisify(execFile)

/** 剩余空间低于这个值才提示，避免正常的几百 G 磁盘被当成问题 */
export const LOW_DISK_MB = 300

export interface PreflightPort {
  port: number
  free: boolean
  owner?: string
}

export interface PreflightInput {
  corePath: string
  coreAccessible: boolean
  dataDirWritable: boolean
  freeDiskMb: number | null
  ports: PreflightPort[]
  configErrors: number
  configErrorLine?: number
  tunEnabled: boolean
  admin: boolean
  expiredProfiles: { name: string; expire: number }[]
}

const LEVEL_RANK: Record<PreflightLevel, number> = { ok: 0, warning: 1, error: 2 }

export function evaluatePreflight(input: PreflightInput): PreflightReport {
  const issues: PreflightCheck[] = []

  if (!input.coreAccessible) {
    issues.push({ id: 'coreMissing', level: 'error', params: { path: input.corePath } })
  }

  for (const port of input.ports) {
    if (port.free) continue
    issues.push({
      id: 'portInUse',
      level: 'error',
      params: port.owner ? { port: port.port, owner: port.owner } : { port: port.port }
    })
  }

  if (!input.dataDirWritable) {
    issues.push({ id: 'dataDirNotWritable', level: 'error' })
  }

  if (input.freeDiskMb !== null && input.freeDiskMb < LOW_DISK_MB) {
    issues.push({
      id: 'diskLow',
      level: 'warning',
      params: { freeMb: Math.max(0, Math.floor(input.freeDiskMb)) }
    })
  }

  if (input.configErrors > 0) {
    issues.push({
      id: 'configInvalid',
      level: 'error',
      params: input.configErrorLine
        ? { count: input.configErrors, line: input.configErrorLine }
        : { count: input.configErrors }
    })
  }

  // TUN 需要提权，普通权限下开 TUN 必然起不来
  if (input.tunEnabled && !input.admin) {
    issues.push({ id: 'tunNeedsAdmin', level: 'warning' })
  }

  for (const profile of input.expiredProfiles) {
    issues.push({ id: 'subscriptionExpired', level: 'warning', params: { name: profile.name } })
  }

  issues.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])

  return {
    level: issues.length > 0 ? issues[0].level : 'ok',
    checked: 5 + input.ports.length + input.expiredProfiles.length,
    issues
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    const finish = (free: boolean): void => {
      server.removeAllListeners()
      try {
        server.close()
      } catch {
        // 已经关掉了
      }
      resolve(free)
    }
    server.once('error', () => finish(false))
    server.once('listening', () => finish(true))
    server.listen(port, '127.0.0.1')
    // 极端情况下 listen 既不报错也不回调，别把体检卡死
    setTimeout(() => finish(false), 800).unref()
  })
}

/** 谁占了端口：只做尽力而为，拿不到就返回 undefined，绝不因此让体检失败。 */
async function findPortOwner(port: number): Promise<string | undefined> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'TCP'], {
        timeout: 1500,
        windowsHide: true
      })
      const pattern = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i')
      const matched = pattern.exec(stdout)
      const pid = matched?.[1]
      if (!pid || pid === '0') return undefined
      const list = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        timeout: 1500,
        windowsHide: true
      })
      const name = list.stdout.split(',')[0]?.replace(/"/g, '').trim()
      return name || `PID ${pid}`
    }

    // macOS / Linux：lsof 不一定装了，失败就当拿不到
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pc'],
      { timeout: 1500 }
    )
    const command = stdout
      .split('\n')
      .find((line) => line.startsWith('c'))
      ?.slice(1)
      .trim()
    return command || undefined
  } catch {
    return undefined
  }
}

async function probeFreeDiskMb(dir: string): Promise<number | null> {
  try {
    const stats = await statfs(dir)
    return (stats.bfree * stats.bsize) / (1024 * 1024)
  } catch {
    return null
  }
}

async function probeDataDirWritable(dir: string): Promise<boolean> {
  const probePath = join(dir, `.preflight-${process.pid}-${Date.now()}.tmp`)
  try {
    await writeFile(probePath, 'ok')
    return true
  } catch {
    return false
  } finally {
    await rm(probePath, { force: true }).catch(() => {})
  }
}

async function probeCoreAccessible(corePath: string): Promise<boolean> {
  try {
    // Windows 上 X_OK 等价于存在性检查，Unix 上才真的验可执行位
    await access(corePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function runPreflight(): Promise<PreflightReport> {
  const { getAppConfig, getControledMihomoConfig, getProfileConfig, getProfileStr } =
    await import('../config')
  const { hasCoreProcess } = await import('./manager')
  const { checkAdminPrivileges } = await import('./admin')
  const { dataDir, mihomoCorePath } = await import('../utils/dirs')
  const { lintMihomoConfig } = await import('../../shared/mihomo-lint')

  const appConfig = await getAppConfig()
  const controled = await getControledMihomoConfig()
  const corePath = mihomoCorePath(appConfig.core)

  const config = await getProfileConfig()
  let configErrors = 0
  let configErrorLine: number | undefined
  try {
    const content = await getProfileStr(config.current)
    const lint = lintMihomoConfig(content)
    const errors = lint.issues.filter((issue) => issue.severity === 'error')
    configErrors = errors.length
    configErrorLine = errors[0]?.line || undefined
  } catch {
    // 读不到配置就交给内核自己报错，这里不重复报
  }

  // 内核已经在跑的时候它本来就占着这些端口，此时做端口检查只会制造假警报
  const ports: PreflightPort[] = []
  if (!hasCoreProcess()) {
    const declared = [
      controled['mixed-port'],
      controled['socks-port'],
      controled['port'],
      controled['redir-port'],
      controled['tproxy-port']
    ]
      .map((value) => Number(value))
      .filter((port) => Number.isInteger(port) && port > 0)

    for (const port of [...new Set(declared)]) {
      const free = await isPortFree(port)
      ports.push({ port, free, owner: free ? undefined : await findPortOwner(port) })
    }
  }

  const now = Date.now()
  const expiredProfiles = config.items
    .filter((item) => item.type === 'remote' && item.extra?.expire)
    .filter((item) => Number(item.extra?.expire) * 1000 < now)
    .map((item) => ({ name: item.name, expire: Number(item.extra?.expire) }))

  return evaluatePreflight({
    corePath,
    coreAccessible: await probeCoreAccessible(corePath),
    dataDirWritable: await probeDataDirWritable(dataDir()),
    freeDiskMb: await probeFreeDiskMb(dataDir()),
    ports,
    configErrors,
    configErrorLine,
    tunEnabled: Boolean(controled.tun?.enable),
    admin: await checkAdminPrivileges().catch(() => false),
    expiredProfiles
  })
}
