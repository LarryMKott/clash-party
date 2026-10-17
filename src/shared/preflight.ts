/** 启动体检的结果结构：只返回问题项，文案交给渲染层 i18n。 */

export type PreflightLevel = 'ok' | 'warning' | 'error'

export type PreflightCheckId =
  | 'coreMissing'
  | 'portInUse'
  | 'dataDirNotWritable'
  | 'diskLow'
  | 'configInvalid'
  | 'tunNeedsAdmin'
  | 'subscriptionExpired'

export interface PreflightCheck {
  id: PreflightCheckId
  level: Exclude<PreflightLevel, 'ok'>
  params?: Record<string, string | number>
}

export interface PreflightReport {
  level: PreflightLevel
  /** 一共检查了多少项，用于「全部通过」时给出个数 */
  checked: number
  issues: PreflightCheck[]
}

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * 把一条检查项渲染成可读文案。
 *
 * 可选参数（占用进程、行号）在这里拼成括号片段再塞进单条文案，
 * 否则「有 owner / 没 owner」这种组合会逼出成倍的 i18n 键。
 * 主进程的启动失败提示与渲染层的体检弹窗共用这一份，避免两边文案漂移。
 */
export function describePreflightIssue(check: PreflightCheck, t: Translate): string {
  const params: Record<string, string | number> = { ...check.params }
  if (check.id === 'portInUse') {
    params.owner = check.params?.owner ? `（${check.params.owner}）` : ''
  }
  if (check.id === 'configInvalid') {
    params.at = check.params?.line ? t('mihomo.preflight.atLine', { line: check.params.line }) : ''
  }
  return t(`mihomo.preflight.issue.${check.id}`, params)
}
