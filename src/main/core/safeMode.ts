/**
 * 安全模式：用「订阅主体 + 端口 + 关掉 TUN，且不加载任何覆写」的最小配置起一次内核。
 *
 * 目标场景是覆写脚本写坏、TUN 配置把路由打飞这类「配置本身还能读，但一应用就断网」，
 * 此时应用需要一个能把人救回来的启动方式。订阅本身坏掉的情况救不回来——那属于换订阅，
 * 不属于安全模式。
 *
 * 生成结果会先用核心 `-t` 校验，校验不过就抛错、不进入安全模式，
 * 避免"以为是安全模式，其实是另一个坏配置"。
 */
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { dump, load } from 'js-yaml'

const PORT_KEYS = ['mixed-port', 'socks-port', 'port', 'redir-port', 'tproxy-port'] as const

export interface SafeModePaths {
  workDir: string
  configPath: string
}

/**
 * 纯合并：订阅主体 + 受控端口 + 强制关 TUN。
 *
 * 覆写不走这里——调用方在生成阶段就不传 override，所以这里不存在"剥掉覆写"的逻辑。
 */
export function buildSafeModeConfig(
  base: Record<string, unknown>,
  controled: Partial<IMihomoConfig>
): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...base }
  const controledRecord = controled as Record<string, unknown>

  for (const key of PORT_KEYS) {
    const value = controledRecord[key]
    if (typeof value === 'number' && value >= 0) safe[key] = value
  }
  for (const key of ['external-controller', 'secret'] as const) {
    const value = controledRecord[key]
    if (typeof value === 'string' && value) safe[key] = value
  }

  // 安全模式不该把代理暴露到局域网，也不该再把 TUN 打开
  safe['allow-lan'] = false
  safe['log-level'] = 'info'
  const baseTun = base.tun
  safe.tun = {
    ...(baseTun && typeof baseTun === 'object' ? (baseTun as Record<string, unknown>) : {}),
    enable: false
  }

  return safe
}

export function safeModeWorkDir(dataDirPath: string): SafeModePaths {
  const workDir = join(dataDirPath, 'safe-mode')
  return { workDir, configPath: join(workDir, 'config.yaml') }
}

/**
 * 生成安全模式的工作目录与配置，并用核心 `-t` 校验一次。
 * 校验失败会抛错，调用方据此放弃进入安全模式。
 */
export async function prepareSafeModeWorkDir(dataDirPath: string): Promise<SafeModePaths> {
  const [{ getAppConfig, getProfileConfig, getProfileStr }, { getControledMihomoConfig }] =
    await Promise.all([import('../config'), import('../config/controledMihomo')])
  const { checkProfileConfig } = await import('./manager')

  const paths = safeModeWorkDir(dataDirPath)
  await rm(paths.workDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(paths.workDir, { recursive: true })

  const { current } = await getProfileConfig(true)
  const [profileStr, controled, appConfig] = await Promise.all([
    getProfileStr(current).catch(() => ''),
    getControledMihomoConfig(),
    getAppConfig()
  ])

  const base = (load(profileStr) ?? {}) as Record<string, unknown>
  await writeFile(paths.configPath, dump(buildSafeModeConfig(base, controled)), 'utf-8')

  // 只用 -t 校验安全配置本身，不碰用户那份可能已经坏掉的运行时配置
  await checkProfileConfig(paths.configPath, appConfig.core ?? 'mihomo')

  return paths
}

export async function clearSafeModeWorkDir(dataDirPath: string): Promise<void> {
  await rm(safeModeWorkDir(dataDirPath).workDir, { recursive: true, force: true }).catch(() => {})
}
