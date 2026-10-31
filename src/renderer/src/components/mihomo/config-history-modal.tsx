import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner
} from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MdDeleteOutline, MdRestore, MdSave } from 'react-icons/md'
import { toast } from '@renderer/components/base/toast'
import {
  configHistoryCreate,
  configHistoryDiff,
  configHistoryList,
  configHistoryRemove,
  configHistoryRestore
} from '@renderer/utils/ipc'
import { diffLines } from '../../../../shared/config-history'
import type { IConfigSnapshotDiff, IConfigSnapshotMeta } from '../../../../shared/config-history'

/* eslint-disable react/prop-types */

interface Props {
  onClose: () => void
}

const MAX_PREVIEW_LINES = 200

const reasonColor = (reason: IConfigSnapshotMeta['reason']): 'primary' | 'default' | 'warning' => {
  if (reason === 'manual') return 'primary'
  if (reason === 'beforeRestore') return 'warning'
  return 'default'
}

/**
 * 本地配置快照：列表、逐文件差异、整份回滚。
 * 回滚是破坏性操作，界面上必须点两次（恢复 → 确认恢复），并且主进程会先自动
 * 备份当前状态，所以「恢复错了」还能恢复回去。
 */
const ConfigHistoryModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation()
  const [snapshots, setSnapshots] = useState<IConfigSnapshotMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, IConfigSnapshotDiff[]>>({})
  const [diffLoading, setDiffLoading] = useState(false)
  const [confirming, setConfirming] = useState<{ id: string; action: 'restore' | 'remove' } | null>(
    null
  )

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setSnapshots(await configHistoryList())
    } catch (error) {
      toast.error(t('mihomo.configHistory.loadFailed', { message: String(error) }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const showDiff = async (id: string): Promise<void> => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (diffs[id]) return
    setDiffLoading(true)
    try {
      const files = await configHistoryDiff(id)
      setDiffs((current) => ({ ...current, [id]: files }))
    } catch (error) {
      toast.error(t('mihomo.configHistory.loadFailed', { message: String(error) }))
    } finally {
      setDiffLoading(false)
    }
  }

  const createSnapshot = async (): Promise<void> => {
    setBusyId('create')
    try {
      const meta = await configHistoryCreate()
      if (meta) toast.success(t('mihomo.configHistory.created'))
      await load()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusyId(null)
    }
  }

  const restore = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await configHistoryRestore(id)
      toast.success(t('mihomo.configHistory.restored'))
      setDiffs({})
      await load()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusyId(null)
      setConfirming(null)
    }
  }

  const remove = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await configHistoryRemove(id)
      toast.success(t('mihomo.configHistory.removed'))
      setDiffs((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      await load()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusyId(null)
      setConfirming(null)
    }
  }

  const renderDiff = (files: IConfigSnapshotDiff[]): React.ReactNode => {
    if (diffLoading) {
      return (
        <div className="flex justify-center py-3">
          <Spinner size="sm" />
        </div>
      )
    }
    if (files.length === 0) {
      return <p className="py-2 text-tiny text-default-500">{t('mihomo.configHistory.noDiff')}</p>
    }
    return (
      <div className="mt-2 flex flex-col gap-2">
        {files.map((file) => {
          const result = diffLines(file.before, file.after, 2, MAX_PREVIEW_LINES)
          return (
            <div key={file.name} className="rounded-md border border-default-200">
              <div className="flex items-center justify-between border-b border-default-200 px-2 py-1">
                <span className="text-tiny font-medium">{file.name}</span>
                <span className="text-tiny text-default-500">
                  <span className="text-success">+{result.added}</span>{' '}
                  <span className="text-danger">-{result.removed}</span>
                </span>
              </div>
              <div className="max-h-56 overflow-auto px-2 py-1 font-mono text-[11px] leading-5">
                {result.lines.map((line, index) => (
                  <div
                    key={index}
                    className={
                      line.type === 'add'
                        ? 'text-success'
                        : line.type === 'del'
                          ? 'text-danger'
                          : 'text-default-500'
                    }
                  >
                    <span className="mr-1 select-none">
                      {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{line.text}</span>
                  </div>
                ))}
                {result.truncated && (
                  <p className="mt-1 text-default-400">
                    {t('mihomo.configHistory.truncated', { count: result.lines.length })}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="3xl"
      backdrop="blur"
      classNames={{ backdrop: 'top-[48px]' }}
      hideCloseButton
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex-col gap-1 pb-2">
          <p className="text-base">{t('mihomo.configHistory.title')}</p>
          <p className="text-tiny font-normal text-default-500">{t('mihomo.configHistory.hint')}</p>
        </ModalHeader>
        <ModalBody className="pb-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="py-6 text-center text-small text-default-500">
              {t('mihomo.configHistory.empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {snapshots.map((snapshot) => {
                const confirmingThis = confirming?.id === snapshot.id
                return (
                  <div key={snapshot.id} className="rounded-md border border-default-200 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Chip size="sm" variant="flat" color={reasonColor(snapshot.reason)}>
                          {t(`mihomo.configHistory.reason.${snapshot.reason}`)}
                        </Chip>
                        <span className="truncate text-small">
                          {new Date(snapshot.createdAt).toLocaleString()}
                        </span>
                        <span className="shrink-0 text-tiny text-default-500">
                          {t('mihomo.configHistory.files', { count: snapshot.files.length })}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="light"
                          onPress={() => void showDiff(snapshot.id)}
                        >
                          {expandedId === snapshot.id
                            ? t('mihomo.configHistory.hideDiff')
                            : t('mihomo.configHistory.compare')}
                        </Button>
                        <Button
                          size="sm"
                          variant={confirmingThis ? 'solid' : 'flat'}
                          color={
                            confirming?.action === 'restore' && confirmingThis
                              ? 'danger'
                              : 'primary'
                          }
                          isLoading={busyId === snapshot.id}
                          isDisabled={busyId !== null}
                          startContent={<MdRestore />}
                          onPress={() => {
                            if (confirmingThis && confirming?.action === 'restore') {
                              void restore(snapshot.id)
                            } else {
                              setConfirming({ id: snapshot.id, action: 'restore' })
                            }
                          }}
                        >
                          {confirmingThis && confirming?.action === 'restore'
                            ? t('mihomo.configHistory.confirmRestore')
                            : t('mihomo.configHistory.restore')}
                        </Button>
                        <Button
                          size="sm"
                          variant={confirmingThis ? 'solid' : 'light'}
                          color={
                            confirming?.action === 'remove' && confirmingThis ? 'danger' : 'default'
                          }
                          isIconOnly
                          isDisabled={busyId !== null}
                          title={
                            confirmingThis && confirming?.action === 'remove'
                              ? t('mihomo.configHistory.confirmRemove')
                              : t('mihomo.configHistory.remove')
                          }
                          onPress={() => {
                            if (confirmingThis && confirming?.action === 'remove') {
                              void remove(snapshot.id)
                            } else {
                              setConfirming({ id: snapshot.id, action: 'remove' })
                            }
                          }}
                        >
                          <MdDeleteOutline className="text-lg" />
                        </Button>
                      </div>
                    </div>
                    {expandedId === snapshot.id && renderDiff(diffs[snapshot.id] ?? [])}
                  </div>
                )
              })}
            </div>
          )}
        </ModalBody>
        <ModalFooter className="pt-0">
          <Button
            size="sm"
            variant="flat"
            startContent={<MdSave />}
            isLoading={busyId === 'create'}
            onPress={() => void createSnapshot()}
          >
            {t('mihomo.configHistory.create')}
          </Button>
          <Button size="sm" variant="light" onPress={onClose}>
            {t('common.close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default ConfigHistoryModal
