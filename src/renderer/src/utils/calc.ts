import { formatTraffic } from '../../../shared/traffic-format'

// 实现放在 shared 里，主进程的额度通知与这里的展示必须保持同一套数字格式
export const calcTraffic = formatTraffic

export function calcPercent(
  upload: number | undefined,
  download: number | undefined,
  total: number | undefined
): number {
  if (upload === undefined || download === undefined || total === undefined) {
    return 100
  }
  return Math.round(((upload + download) / total) * 100)
}
