import type { Readable } from 'stream'

// 内核的启动进度只有 stdout 一条通道。API 监听成功以后 /proxies 立刻可读，但此时
// proxy-provider 的初始拉取还没结束，组成员为空、组选中项会回落到第一个节点；
// 在那之前刷新代理组，UI 拿到的就是一份错的选中状态。

export function isCoreApiReadyLine(
  line: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === 'win32'
    ? line.includes('RESTful API pipe listening at')
    : line.includes('RESTful API unix listening at')
}

// 兼容 provider 与 proxy-provider 两种写法都会打印的那行默认 provider 日志
export function isInitialProviderLine(chunk: string): boolean {
  return chunk.toLowerCase().includes('start initial compatible provider default')
}

// 没有 proxy-provider 的配置（手写节点、整份配置只走 DIRECT）永远不会打印这行日志，
// 死等会让启动收尾一直不执行，代理组选择就停在启动前的旧快照上，只能等 30s 轮询兜底。
export const initialProviderTimeout = 5000

export type InitialProviderSignal = 'observed' | 'timeout' | 'closed'

// 有限等待：拿到日志、超时、内核提前退出三者之一都会解挂，并摘掉自己挂的监听器。
export function waitForInitialProvider(
  stream: Readable | null | undefined,
  timeoutMs: number = initialProviderTimeout
): Promise<InitialProviderSignal> {
  if (!stream || stream.destroyed) return Promise.resolve('closed')

  return new Promise((resolve) => {
    let settled = false

    const finish = (signal: InitialProviderSignal): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stream.off('data', onData)
      stream.off('close', onClose)
      resolve(signal)
    }
    const onData = (chunk: Buffer | string): void => {
      if (isInitialProviderLine(chunk.toString())) finish('observed')
    }
    const onClose = (): void => finish('closed')

    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    stream.on('data', onData)
    stream.once('close', onClose)
  })
}
