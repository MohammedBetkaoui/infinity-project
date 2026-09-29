import { ArrowLeft, CalendarDays, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCampaignDate } from '../../../../shared/aivex/campaign-schedule.js'

export default function CampaignStatusPanel({ campaign, lang, t }) {
  if (campaign.status === 'loading') {
    return (
      <section className="axr-campaign-state axr-campaign-loading" role="status" aria-label={t.campaignLoading}>
        <div className="axr-campaign-skeleton-title" />
        <div className="axr-campaign-skeleton-line" />
        <div className="axr-campaign-skeleton-line is-short" />
        <div className="axr-campaign-skeleton-card" />
      </section>
    )
  }

  if (campaign.status === 'error') {
    return (
      <section className="axr-campaign-state" role="alert">
        <p className="axr-campaign-kicker">{t.campaignErrorKicker}</p>
        <h2>{t.campaignErrorTitle}</h2>
        <p className="axr-campaign-copy">{t.campaignErrorText}</p>
        <button type="button" className="af-button af-button-primary axr-campaign-retry" onClick={campaign.retry}>
          <RefreshCw size={15} aria-hidden="true" />{t.campaignRetry}
        </button>
      </section>
    )
  }

  const openDate = formatCampaignDate(campaign.registrationOpenAt, lang)
  const closeDate = formatCampaignDate(campaign.registrationCloseAt, lang)
  const content = campaign.status === 'not_open'
    ? {
        kicker: t.campaignNotOpenKicker,
        title: t.campaignNotOpenTitle,
        copy: t.campaignNotOpenText({ date: openDate }),
        note: t.campaignNotOpenNote,
        dateLabel: t.campaignPeriodLabel,
        dateValue: t.campaignPeriodValue({ openDate, closeDate }),
      }
    : campaign.status === 'closed'
      ? {
          kicker: t.campaignClosedKicker,
          title: t.campaignClosedTitle,
          copy: t.campaignClosedText,
          note: t.campaignClosedNote,
          dateLabel: t.campaignEndedLabel,
          dateValue: t.campaignEndedValue({ date: closeDate }),
        }
      : {
          kicker: t.campaignDisabledKicker,
          title: t.campaignDisabledTitle,
          copy: t.campaignDisabledText,
          note: '',
          dateLabel: '',
          dateValue: '',
        }

  return (
    <section className="axr-campaign-state" data-status={campaign.status} aria-live="polite">
      <p className="axr-campaign-kicker">{content.kicker}</p>
      <h2>{content.title}</h2>
      <p className="axr-campaign-copy">{content.copy}</p>
      {content.dateValue && (
        <div className="axr-campaign-period">
          <CalendarDays size={19} aria-hidden="true" />
          <span><small>{content.dateLabel}</small><strong>{content.dateValue}</strong></span>
        </div>
      )}
      {content.note && <p className="axr-campaign-note">{content.note}</p>}
      <Link to="/aivex" className="af-button af-button-secondary axr-campaign-back">
        <ArrowLeft size={15} aria-hidden="true" />{t.campaignBack}
      </Link>
    </section>
  )
}
