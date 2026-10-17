import { Button, Chip } from '@heroui/react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { BiCheck, BiCopy } from 'react-icons/bi'
import {
  explainConnection,
  type ConnectionExplainVerdict,
  type ConnectionExplainSeverity
} from '@renderer/utils/connection-explain'

interface Props {
  connection: IMihomoConnectionDetail
}

const VERDICT_COLOR: Record<
  ConnectionExplainVerdict,
  'default' | 'primary' | 'danger' | 'warning'
> = {
  proxied: 'primary',
  direct: 'default',
  rejected: 'danger',
  unknown: 'warning'
}

const SEVERITY_TEXT: Record<ConnectionExplainSeverity, string> = {
  ok: 'text-default-500',
  info: 'text-default-500',
  warning: 'text-warning',
  critical: 'text-danger'
}

const SEVERITY_DOT: Record<ConnectionExplainSeverity, string> = {
  ok: 'bg-success',
  info: 'bg-default-400',
  warning: 'bg-warning',
  critical: 'bg-danger'
}

const DEFAULT_POLICY = 'DIRECT'

const ConnectionExplain: React.FC<Props> = ({ connection }) => {
  const { t } = useTranslation()
  const [copied, setCopied] = React.useState(false)

  const result = React.useMemo(() => explainConnection(connection), [connection])

  const ruleLabel = result.rule
    ? result.rulePayload
      ? `${result.rule}(${result.rulePayload})`
      : result.rule
    : '—'

  const policiesText =
    result.policies.length > 0 ? result.policies.join(' >> ') : t('connections.explain.noPolicy')

  const headline = React.useMemo(() => {
    const primary = result.findings[0]
    if (primary?.code === 'fakeIpNoSniff') {
      return t('connections.explain.headline.fakeIpNoSniff', { ip: primary.params?.ip })
    }
    if (result.verdict === 'proxied') {
      return t('connections.explain.headline.proxied', {
        rule: ruleLabel,
        policies: policiesText,
        outbound: result.outbound
      })
    }
    if (result.verdict === 'direct') {
      return t('connections.explain.headline.direct', { rule: ruleLabel })
    }
    if (result.verdict === 'rejected') {
      return t('connections.explain.headline.rejected', { rule: ruleLabel })
    }
    return t('connections.explain.headline.unknown')
  }, [policiesText, result, ruleLabel, t])

  const report = React.useMemo(() => {
    const lines = [
      `${t('connections.explain.report.target')}: ${result.target || '-'}`,
      `${t('connections.explain.report.rule')}: ${ruleLabel}`,
      `${t('connections.explain.report.chain')}: ${
        [...result.policies, result.outbound].filter(Boolean).join(' >> ') || '-'
      }`,
      `${t('connections.explain.report.dns')}: ${connection.metadata.dnsMode || '-'} / ${
        connection.metadata.sniffHost || '-'
      }`,
      `${t('connections.explain.report.conclusion')}: ${headline}`
    ]
    result.findings.forEach((finding) => {
      lines.push(`- ${t(`connections.explain.finding.${finding.code}`, finding.params)}`)
    })
    return lines.join('\n')
  }, [connection.metadata, headline, result, ruleLabel, t])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      console.error('[Connections] failed to copy explain report', error)
    }
  }

  return (
    <div className="mb-2 rounded-lg border border-default-200 bg-default-50/40 p-3">
      <div className="mb-2 flex items-start gap-2">
        <Chip size="sm" variant="flat" color={VERDICT_COLOR[result.verdict]}>
          {t(`connections.explain.verdict.${result.verdict}`)}
        </Chip>
        <span className="min-w-0 flex-1 text-sm leading-6">{headline}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-default-500">
        <span className="truncate" title={result.target}>
          {result.target || '-'}
        </span>
        <span>→</span>
        <span className="truncate" title={ruleLabel}>
          {ruleLabel}
        </span>
        <span>→</span>
        <span className="truncate" title={policiesText}>
          {policiesText}
        </span>
        <span>→</span>
        <span className="font-medium text-foreground">{result.outbound || DEFAULT_POLICY}</span>
      </div>

      {result.findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {result.findings.map((finding) => (
            <li
              key={finding.code}
              className={`flex items-start gap-2 text-xs leading-5 ${SEVERITY_TEXT[finding.severity]}`}
            >
              <span
                className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[finding.severity]}`}
              />
              <span className="min-w-0">
                {t(`connections.explain.finding.${finding.code}`, finding.params)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="light"
          className="h-7 min-w-0 px-2 text-xs"
          startContent={copied ? <BiCheck className="text-sm" /> : <BiCopy className="text-sm" />}
          onPress={copy}
        >
          {copied ? t('connections.explain.copied') : t('connections.explain.copy')}
        </Button>
      </div>
    </div>
  )
}

export default ConnectionExplain
