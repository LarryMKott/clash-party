import { Card, CardBody, Chip, Progress, Tooltip } from '@heroui/react'
import { calcTraffic } from '@renderer/utils/calc'
import dayjs from '@renderer/utils/dayjs'
import { getQuotaHistory, getQuotaStatus } from '@renderer/utils/ipc'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { QUOTA_EXPIRING_SOON_DAYS } from '../../../../shared/quota'

/* eslint-disable react/prop-types */

interface Props {
  /** 订阅刷新后变化的值，用来立刻重算一次，不必等轮询 */
  refreshKey?: string
}

type ProgressColor = 'success' | 'warning' | 'danger' | 'primary' | 'default'

function progressColor(state: string): ProgressColor {
  if (state === 'healthy') return 'success'
  if (state === 'warning') return 'warning'
  if (state === 'critical' || state === 'exhausted' || state === 'expired') return 'danger'
  return 'default'
}

/**
 * 当前订阅的额度一览：剩余流量 / 已用比例 / 到期倒计时 / 日均消耗与预计耗尽时间。
 * 数据由主进程计算（同一份评估也用于系统通知），这里只负责展示。
 */
const QuotaPanel: React.FC<Props> = (props) => {
  const { refreshKey } = props
  const { t } = useTranslation()
  const { data: quota, mutate } = useSWR('getQuotaStatus', getQuotaStatus, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false
  })
  const { data: history, mutate: mutateHistory } = useSWR('getQuotaHistory', getQuotaHistory, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false
  })

  useEffect(() => {
    void mutate()
    void mutateHistory()
  }, [refreshKey, mutate, mutateHistory])

  if (!quota || quota.state === 'unknown') return null

  const color = progressColor(quota.state)
  const percent = Math.round(quota.percent * 100)

  let expireText: string
  if (quota.expireAt <= 0) {
    expireText = t('profiles.quota.neverExpire')
  } else if (quota.state === 'expired') {
    expireText = t('profiles.quota.expiredOn', {
      date: dayjs.unix(quota.expireAt).format('YYYY-MM-DD')
    })
  } else if (quota.daysToExpire !== null && quota.daysToExpire < 1) {
    expireText = t('profiles.quota.expireToday')
  } else {
    const days = Math.ceil(quota.daysToExpire ?? 0)
    expireText = t('profiles.quota.expireIn', { days })
  }

  let rateText: string
  if (quota.dailyRate === null) {
    rateText = t('profiles.quota.rateSampling')
  } else {
    rateText = t('profiles.quota.dailyRate', { rate: calcTraffic(quota.dailyRate) })
  }

  let projectedText: string | null = null
  if (quota.daysToExhausted !== null && quota.exhaustedAt !== null) {
    projectedText =
      quota.daysToExhausted < 60
        ? t('profiles.quota.projectedDays', { days: Math.max(1, Math.ceil(quota.daysToExhausted)) })
        : t('profiles.quota.projectedDate', {
            date: dayjs(quota.exhaustedAt).format('YYYY-MM-DD')
          })
  }

  const historyDays = history?.days ?? []
  const historyMax = historyDays.reduce((max, day) => Math.max(max, day.bytes), 0)

  return (
    <Card className="mx-2 mt-2" shadow="sm">
      <CardBody className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-small text-default-500">{t('profiles.quota.remaining')}</p>
            <p className="text-2xl font-bold leading-8">{calcTraffic(quota.remaining)}</p>
            <p className="text-tiny text-default-500">
              {t('profiles.quota.usedOfTotal', {
                used: calcTraffic(quota.used),
                total: calcTraffic(quota.total)
              })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <Chip size="sm" color={color} variant="flat">
              {t(`profiles.quota.state.${quota.state}`)}
            </Chip>
            <span
              className={
                quota.expiringSoon || quota.state === 'expired'
                  ? 'text-tiny text-danger'
                  : 'text-tiny text-default-500'
              }
              title={expireText}
            >
              {expireText}
            </span>
            <Tooltip
              delay={600}
              placement="bottom"
              content={
                quota.daysToExhausted !== null && quota.daysToExhausted > 0
                  ? t('profiles.quota.projectedTooltip', {
                      days: Math.max(1, Math.ceil(quota.daysToExhausted))
                    })
                  : t('profiles.quota.rateTooltip')
              }
            >
              <span className="text-tiny text-default-500">
                {projectedText ? `${rateText} · ${projectedText}` : rateText}
              </span>
            </Tooltip>
          </div>
        </div>
        <Progress
          className="mt-2"
          size="sm"
          color={color}
          value={percent}
          aria-label={t('profiles.quota.remaining')}
        />
        {history && history.windowBytes > 0 && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-tiny text-default-500">{t('profiles.quota.history.title')}</p>
              <p className="text-tiny text-default-500">
                {t('profiles.quota.history.total', { bytes: calcTraffic(history.windowBytes) })}
              </p>
            </div>
            <div className="mt-1 flex h-12 items-end gap-1">
              {historyDays.map((day) => (
                <div
                  key={day.date}
                  className={`flex-1 rounded-t ${day.bytes > 0 ? 'bg-primary' : 'bg-default-200'}`}
                  style={{
                    height: `${Math.max(
                      day.bytes > 0 ? 8 : 3,
                      Math.round((day.bytes / (historyMax || 1)) * 100)
                    )}%`
                  }}
                  title={`${day.date} · ${calcTraffic(day.bytes)}`}
                />
              ))}
            </div>
            <p className="mt-1 text-tiny text-default-500">
              {t('profiles.quota.history.average', {
                rate: calcTraffic(history.averageDaily ?? 0)
              })}
            </p>
            <p className="text-tiny text-default-400">{t('profiles.quota.history.note')}</p>
          </div>
        )}
        {quota.expiringSoon && quota.state !== 'expired' && (
          <p className="mt-1 text-tiny text-danger">
            {t('profiles.quota.expiringSoon', { days: QUOTA_EXPIRING_SOON_DAYS })}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

export default QuotaPanel
