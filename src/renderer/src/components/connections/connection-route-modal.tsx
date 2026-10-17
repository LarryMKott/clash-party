import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Spinner
} from '@heroui/react'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dump, load } from 'js-yaml'
import { toast } from '@renderer/components/base/toast'
import { useGroups } from '@renderer/hooks/use-groups'
import {
  getProfileConfig,
  getRuleStr,
  mihomoHotReloadConfig,
  setRuleStr
} from '@renderer/utils/ipc'
import {
  buildRuleCandidates,
  composeRule,
  type RuleCandidate
} from '../../../../shared/connection-rule'

interface Props {
  connection: IMihomoConnectionDetail
  onClose: () => void
}

const BUILTIN_TARGETS = ['DIRECT', 'REJECT', 'REJECT-DROP']

const ConnectionRouteModal: React.FC<Props> = ({ connection, onClose }) => {
  const { t } = useTranslation()
  const { groups } = useGroups()

  const candidates = useMemo(() => buildRuleCandidates(connection), [connection])
  const [candidateRule, setCandidateRule] = useState(() => candidates[0]?.rule ?? '')

  // 默认出口取这条连接最外层的策略组，拿不到就退回 DIRECT
  const defaultTarget = useMemo(() => {
    const chains = connection.chains ?? []
    return chains.length > 0 ? (chains[chains.length - 1] ?? 'DIRECT') : 'DIRECT'
  }, [connection.chains])

  const [target, setTarget] = useState(defaultTarget)
  const [profileId, setProfileId] = useState('')
  const [existingRules, setExistingRules] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const targetOptions = useMemo(() => {
    const names = new Set<string>(BUILTIN_TARGETS)
    if (groups) {
      groups.forEach((group) => {
        if (group.name) names.add(group.name)
      })
    }
    if (defaultTarget) names.add(defaultTarget)
    return [...names]
  }, [defaultTarget, groups])

  useEffect(() => {
    const load1 = async (): Promise<void> => {
      try {
        const config = await getProfileConfig()
        const current = config.current
        if (!current) return
        setProfileId(current)
        const raw = await getRuleStr(current)
        const data = (load(raw) ?? {}) as { prepend?: string[]; append?: string[] }
        setExistingRules([
          ...(Array.isArray(data.prepend) ? data.prepend : []),
          ...(Array.isArray(data.append) ? data.append : [])
        ])
      } catch (error) {
        console.error('[Connections] failed to load profile rules', error)
      } finally {
        setLoading(false)
      }
    }
    void load1()
  }, [])

  const candidate = candidates.find((item) => item.rule === candidateRule)
  const ruleText = candidate ? composeRule(candidate, target) : ''
  const existed = existingRules.includes(ruleText)

  const kindHint = (item: RuleCandidate): string => {
    switch (item.kind) {
      case 'suffix':
        return t('connections.route.kind.suffix')
      case 'domain':
        return t('connections.route.kind.domain')
      case 'process':
        return t('connections.route.kind.process')
      default:
        return t('connections.route.kind.ip')
    }
  }

  const submit = async (): Promise<void> => {
    if (!candidate || !profileId) return
    setSaving(true)
    try {
      const raw = await getRuleStr(profileId)
      const data = (load(raw) ?? {}) as Record<string, unknown>
      const prepend = Array.isArray(data.prepend) ? [...(data.prepend as string[])] : []
      const append = Array.isArray(data.append) ? (data.append as string[]) : []
      if (prepend.includes(ruleText) || append.includes(ruleText)) {
        toast.warning(t('connections.route.existed'))
        return
      }
      // prepend 不带前导数字 = 插到规则最前面，保证优先于现有规则命中
      prepend.unshift(ruleText)
      await setRuleStr(profileId, dump({ ...data, prepend }))
      await mihomoHotReloadConfig()
      toast.success(t('connections.route.saved'))
      onClose()
    } catch (error) {
      toast.error(
        `${t('connections.route.error')}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setSaving(false)
    }
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
        <ModalHeader className="flex app-drag">{t('connections.route.title')}</ModalHeader>
        <ModalBody className="gap-4">
          <p className="text-sm text-default-500">{t('connections.route.desc')}</p>

          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-warning">{t('connections.route.noCandidate')}</p>
          ) : (
            <>
              <RadioGroup
                label={t('connections.route.matcher')}
                value={candidateRule}
                onValueChange={setCandidateRule}
              >
                {candidates.map((item) => (
                  <Radio key={item.rule} value={item.rule} className="max-w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">{item.rule}</span>
                      <span className="text-xs text-default-500">{kindHint(item)}</span>
                    </div>
                  </Radio>
                ))}
              </RadioGroup>

              <Autocomplete
                label={t('connections.route.target')}
                placeholder={t('connections.route.targetPlaceholder')}
                selectedKey={target}
                onSelectionChange={(key) => key && setTarget(String(key))}
                inputValue={target}
                onInputChange={(value) => value && setTarget(value)}
              >
                {targetOptions.map((name) => (
                  <AutocompleteItem key={name} textValue={name}>
                    {name}
                  </AutocompleteItem>
                ))}
              </Autocomplete>

              <div className="rounded-lg border border-default-200 bg-default-50/40 p-3">
                <div className="mb-1 text-xs text-default-500">
                  {t('connections.route.preview')}
                </div>
                <code className="break-all font-mono text-sm">{ruleText}</code>
              </div>

              <p className="text-xs text-default-500">{t('connections.route.position')}</p>
              {!profileId && (
                <p className="text-xs text-warning">{t('connections.route.noProfile')}</p>
              )}
              {existed && <p className="text-xs text-warning">{t('connections.route.existed')}</p>}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" onPress={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            color="primary"
            isLoading={saving}
            isDisabled={loading || !candidate || existed}
            onPress={submit}
          >
            {t('connections.route.save')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default ConnectionRouteModal
