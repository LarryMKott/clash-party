import { Chip, Popover, PopoverContent, PopoverTrigger } from '@heroui/react'
import React, { useDeferredValue, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BiCheckCircle, BiErrorCircle } from 'react-icons/bi'
import { lintMihomoConfig, type MihomoLintIssue } from '../../../../shared/mihomo-lint'

interface Props {
  source: string
}

const SEVERITY_COLOR = {
  error: 'danger',
  warning: 'warning',
  info: 'default'
} as const

/**
 * 编辑器里已经有 JSON Schema 的实时提示，这里补语义问题：
 * 规则引用了不存在的组、端口打架、MATCH 之后的死规则等。
 */
const ConfigLint: React.FC<Props> = ({ source }) => {
  const { t } = useTranslation()
  const deferredSource = useDeferredValue(source)
  const { issues, counts } = useMemo(() => lintMihomoConfig(deferredSource), [deferredSource])

  const describe = (issue: MihomoLintIssue): string =>
    t(`config.lint.issue.${issue.code}`, issue.params)

  if (counts.error === 0 && counts.warning === 0) {
    return (
      <Chip
        size="sm"
        variant="flat"
        color="success"
        className="mr-auto"
        startContent={<BiCheckCircle className="text-sm" />}
      >
        {t('config.lint.passed')}
      </Chip>
    )
  }

  const total = counts.error + counts.warning
  const hasError = counts.error > 0

  return (
    <Popover placement="top-start" showArrow>
      <PopoverTrigger>
        <Chip
          size="sm"
          variant="flat"
          color={hasError ? 'danger' : 'warning'}
          className="mr-auto cursor-pointer"
          startContent={<BiErrorCircle className="text-sm" />}
        >
          {hasError
            ? t('config.lint.summaryError', { count: total })
            : t('config.lint.summaryWarning', { count: total })}
        </Chip>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[80vw] p-0">
        <div className="max-h-80 w-full overflow-y-auto p-2">
          {issues.map((issue, index) => (
            <div
              key={`${issue.code}-${issue.line}-${index}`}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm"
            >
              {issue.line > 0 ? (
                <span className="mt-0.5 shrink-0 rounded bg-default-100 px-1.5 py-0.5 font-mono text-xs text-default-500">
                  {t('config.lint.line', { line: issue.line })}
                </span>
              ) : (
                <span className="mt-0.5 shrink-0 rounded bg-default-100 px-1.5 py-0.5 font-mono text-xs text-default-500">
                  —
                </span>
              )}
              <span className="min-w-0 flex-1 break-words leading-5">{describe(issue)}</span>
              <Chip size="sm" variant="dot" color={SEVERITY_COLOR[issue.severity]}>
                {t(`config.lint.severity.${issue.severity}`)}
              </Chip>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ConfigLint
