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
