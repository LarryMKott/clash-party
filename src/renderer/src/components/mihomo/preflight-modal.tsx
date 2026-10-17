import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner
} from '@heroui/react'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BiCheckCircle, BiErrorCircle, BiInfoCircle } from 'react-icons/bi'
import { runPreflight } from '@renderer/utils/ipc'
import type { PreflightCheck, PreflightReport } from '../../../../shared/preflight'

interface Props {
  onClose: () => void
}

const LEVEL_TEXT: Record<PreflightCheck['level'], string> = {
  error: 'text-danger',
  warning: 'text-warning'
}

const LEVEL_DOT: Record<PreflightCheck['level'], string> = {
  error: 'bg-danger',
  warning: 'bg-warning'
}

const PreflightModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation()
  const [report, setReport] = useState<PreflightReport>()
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setReport(await runPreflight())
    } catch (error) {
      console.error('[Preflight] failed to run checks', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 有的检查项是「有就带上、没有就不显示」，把括号在渲染层拼好，i18n 只留一条文案
  const describe = (check: PreflightCheck): string => {
    const params: Record<string, string | number> = { ...check.params }
    if (check.id === 'portInUse') {
      params.owner = check.params?.owner ? `（${check.params.owner}）` : ''
    }
    if (check.id === 'configInvalid') {
      params.at = check.params?.line
        ? t('mihomo.preflight.atLine', { line: check.params.line })
        : ''
    }
    return t(`mihomo.preflight.issue.${check.id}`, params)
  }

  return (
    <Modal
      backdrop="blur"
      classNames={{ backdrop: 'top-[48px]' }}
      size="lg"
      hideCloseButton
      isOpen={true}
      onOpenChange={onClose}
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex app-drag">{t('mihomo.preflight.title')}</ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-default-500">{t('mihomo.preflight.description')}</p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : report && report.issues.length > 0 ? (
            <ul className="space-y-2">
              {report.issues.map((issue, index) => (
                <li
                  key={`${issue.id}-${index}`}
                  className={`flex items-start gap-2 text-sm leading-6 ${LEVEL_TEXT[issue.level]}`}
                >
                  <span
                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[issue.level]}`}
                  />
                  <span className="min-w-0 flex-1 break-words">{describe(issue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-default-200 bg-default-50/40 p-3 text-sm">
              <BiCheckCircle className="text-lg text-success" />
              <span>{t('mihomo.preflight.passed', { count: report?.checked ?? 0 })}</span>
            </div>
          )}

          {!loading && report && report.issues.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-default-500">
              <BiInfoCircle className="text-sm" />
              {t('mihomo.preflight.hint')}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            size="sm"
            variant="light"
            isLoading={loading}
            startContent={loading ? undefined : <BiErrorCircle className="text-sm" />}
            onPress={load}
          >
            {t('mihomo.preflight.rerun')}
          </Button>
          <Button size="sm" color="primary" onPress={onClose}>
            {t('common.close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default PreflightModal
