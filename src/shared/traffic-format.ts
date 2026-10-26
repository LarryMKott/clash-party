/**
 * 流量单位格式化：主进程（额度告警通知）与渲染层（额度面板 / 订阅卡片）共用，
 * 避免同一条数据在两个进程里显示出不同的数字。
 */

function formatNumString(num: number): string {
  let str = num.toFixed(2)
  if (str.length <= 5) return str
  if (str.length === 6) {
    str = num.toFixed(1)
    return str
  }
  str = Math.round(num).toString()
  return str
}

export function formatTraffic(byte: number): string {
  if (!Number.isFinite(byte)) return '0 B'
  if (byte < 1024) return `${formatNumString(byte)} B`
  let value = byte
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} KB`
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} MB`
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} GB`
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} TB`
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} PB`
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} EB`
  value /= 1024
  if (value < 1024) return `${formatNumString(value)} ZB`
  value /= 1024
  return `${formatNumString(value)} YB`
}
