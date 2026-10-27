import { Button, Card, CardBody, Chip } from '@heroui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analyzeRuleShadowing, findNeverHitRules } from '../../../../shared/rule-audit'

/* eslint-disable react/prop-types */

interface Props {
  rules: IMihomoRulesDetail[]
}

/** 折叠状态下最多列几条，剩下的用「还有 N 条」带过 */
const COLLAPSED_COUNT = 4

interface AuditEntry {
  key: string
  /** 1 起始的展示用序号 */
  index: number
  rule: string
  reason: string
  severity: 'shadow' | 'neverHit'
}

/**
 * 规则体检面板：把「加了却永远不生效」的规则揪出来。
 * 静态遮蔽（被前面的规则完全覆盖）+ 运行期零命中（评估过但一次没中）一起看，
 * 两类都不会自动改配置，只提示用户自己决定删还是挪位置。
 */
const RuleAuditPanel: React.FC<Props> = ({ rules }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const { entries, shadowCount, neverHitCount } = useMemo(() => {
    const shadow = analyzeRuleShadowing(rules)
    const neverHit = findNeverHitRules(rules)
    const shadowEntries: AuditEntry[] = shadow.map((finding) => ({
      key: `shadow:${finding.index}`,
      index: finding.index + 1,
      rule: `${finding.type},${finding.payload}`,
      severity: 'shadow',
      reason: `${t('rules.audit.shadowItem', {
        index: finding.index + 1,
        by: finding.byIndex + 1
      })} · ${t(`rules.audit.kind.${finding.kind}`)}`
    }))
    const neverHitEntries: AuditEntry[] = neverHit.map((finding) => ({
      key: `neverHit:${finding.index}`,
      index: finding.index + 1,
      rule: `${finding.type},${finding.payload}`,
      severity: 'neverHit',
      reason: t('rules.audit.neverHitItem', {
        index: finding.index + 1,
        count: finding.evaluations
      })
    }))
    return {
      entries: [...shadowEntries, ...neverHitEntries],
      shadowCount: shadow.length,
      neverHitCount: neverHit.length
    }
  }, [rules, t])

  if (rules.length === 0 || entries.length === 0) return null

  const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT)
  const hidden = entries.length - visible.length

  return (
    <Card className="mx-2 mt-2" shadow="sm">
      <CardBody className="py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Chip size="sm" variant="flat" color={shadowCount > 0 ? 'danger' : 'warning'}>
              {t('rules.audit.title')}
            </Chip>
            <span className="truncate text-tiny text-default-500">
              {t('rules.audit.summary', { shadow: shadowCount, neverHit: neverHitCount })}
            </span>
          </div>
          <Button size="sm" variant="light" onPress={() => setExpanded((value) => !value)}>
            {expanded ? t('rules.audit.collapse') : t('rules.audit.expand')}
          </Button>
        </div>
        {expanded && <p className="mt-2 text-tiny text-default-500">{t('rules.audit.hint')}</p>}
        <div className="mt-2 flex flex-col gap-2">
          {visible.map((entry) => (
            <div key={entry.key} className="flex items-start gap-2">
              <Chip
                size="sm"
                variant="bordered"
                color={entry.severity === 'shadow' ? 'danger' : 'warning'}
                className="shrink-0 text-xs"
              >
                {entry.index}
              </Chip>
              <div className="min-w-0">
                <p className="truncate text-tiny font-medium" title={entry.rule}>
                  {entry.rule}
                </p>
                <p className="text-tiny text-default-500">{entry.reason}</p>
              </div>
            </div>
          ))}
        </div>
        {hidden > 0 && (
          <p className="mt-2 text-tiny text-default-400">
            {t('rules.audit.more', { count: hidden })}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

export default RuleAuditPanel
