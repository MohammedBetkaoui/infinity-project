import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, CircleAlert, LoaderCircle, Pencil, RotateCw } from 'lucide-react'
import {
  AIVEX_BUSINESS_TIME_ZONE, campaignStatusFor, combineAlgiersDateTime,
  formatCampaignDateTime, splitAlgiersTimestamp,
} from '../../shared/aivex/campaign-schedule.js'
import { Button, Modal, StatusBadge } from './AdminUI'
import { useAdminAivexCampaignSettings } from './useAdminAivexCampaignSettings'

const STATUS_LABELS = Object.freeze({
  not_open: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  disabled: 'Disabled',
})

function draftFrom(settings) {
  const opens = splitAlgiersTimestamp(settings?.registrationOpenAt)
  const closes = splitAlgiersTimestamp(settings?.registrationCloseAt)
  const signed = splitAlgiersTimestamp(settings?.signedDocumentDeadline)
  return {
    registrationEnabled: settings?.registrationEnabled === true,
    openDate: opens.date,
    openTime: opens.time,
    closeDate: closes.date,
    closeTime: closes.time,
    signedDate: signed.date,
    signedTime: signed.time,
  }
}

function payloadFrom(draft) {
  return {
    registrationEnabled: draft.registrationEnabled,
    registrationOpenAt: combineAlgiersDateTime(draft.openDate, draft.openTime),
    registrationCloseAt: combineAlgiersDateTime(draft.closeDate, draft.closeTime),
    signedDocumentDeadline: combineAlgiersDateTime(draft.signedDate, draft.signedTime),
  }
}

function validateDraft(draft) {
  const payload = payloadFrom(draft)
  if (!payload.registrationOpenAt) return { ok: false, message: 'Enter a valid registration opening date and time.' }
  if (!payload.registrationCloseAt) return { ok: false, message: 'Enter a valid registration closing date and time.' }
  if (!payload.signedDocumentDeadline) return { ok: false, message: 'Enter a valid signed-document deadline.' }
  if (Date.parse(payload.registrationCloseAt) <= Date.parse(payload.registrationOpenAt)) {
    return { ok: false, message: 'Registration closing must be after registration opening.' }
  }
  if (Date.parse(payload.signedDocumentDeadline) < Date.parse(payload.registrationCloseAt)) {
    return { ok: false, message: 'The signed-document deadline cannot be earlier than registration closing.' }
  }
  return { ok: true, payload }
}

function DateTimeFields({ label, date, time, disabled, onDate, onTime }) {
  return (
    <fieldset className="adm-campaign-datetime" disabled={disabled}>
      <legend>{label}</legend>
      <label><span>Date</span><input type="date" value={date} onChange={(event) => onDate(event.target.value)} required /></label>
      <label><span>Time</span><input type="time" step="1" value={time} onChange={(event) => onTime(event.target.value)} required /></label>
    </fieldset>
  )
}

export default function AivexCampaignSettings({ addToast }) {
  const campaign = useAdminAivexCampaignSettings()
  const [draft, setDraft] = useState(() => draftFrom(null))
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const visibleDraft = editing ? draft : draftFrom(campaign.settings)
  const checked = validateDraft(visibleDraft)
  const authoritativeStatus = campaign.settings
    ? campaignStatusFor(campaign.settings, clock)
    : 'disabled'
  const nextStatus = checked.ok ? campaignStatusFor(checked.payload, clock) : 'disabled'
  const closesActiveCampaign = authoritativeStatus === 'open' && nextStatus !== 'open'

  if (campaign.loading && !campaign.settings) {
    return <section className="adm-panel adm-campaign-settings adm-campaign-settings-loading" role="status" aria-label="Loading AIVEX campaign settings"><i/><span/><span/><span/></section>
  }

  if (!campaign.settings) {
    return <section className="adm-panel adm-campaign-settings-error" role="alert"><CircleAlert size={22}/><div><h2>AIVEX campaign settings are unavailable</h2><p>{campaign.error || 'The authoritative settings could not be loaded.'}</p><Button variant="secondary" onClick={campaign.refresh} icon={<RotateCw size={15}/>}>Retry</Button></div></section>
  }

  const startEditing = () => {
    setDraft(draftFrom(campaign.settings))
    setError('')
    setEditing(true)
  }
  const cancelEditing = () => {
    setDraft(draftFrom(campaign.settings))
    setError('')
    setEditing(false)
  }
  const requestConfirmation = (event) => {
    event.preventDefault()
    if (!checked.ok) return setError(checked.message)
    setError('')
    setConfirming(true)
  }
  const confirmUpdate = async () => {
    if (!checked.ok || campaign.saving) return
    setError('')
    const result = await campaign.update(checked.payload)
    if (!result.ok) {
      setError(result.message || 'Unable to update the AIVEX campaign.')
      setConfirming(false)
      return
    }
    setConfirming(false)
    setEditing(false)
    setDraft(draftFrom(result.settings))
    addToast('AIVEX campaign updated', 'The authoritative production schedule was saved and refreshed.')
  }

  return (
    <>
      <div className="adm-settings-layout adm-campaign-settings-layout">
        <form className="adm-panel adm-settings-form adm-campaign-settings" onSubmit={requestConfirmation}>
          <header className="adm-campaign-settings-head">
            <div><span className="adm-eyebrow">AIVEX · Edition 02</span><h2>Registration campaign</h2></div>
            <StatusBadge tone={STATUS_LABELS[authoritativeStatus].toLowerCase()}>{STATUS_LABELS[authoritativeStatus]}</StatusBadge>
          </header>
          <p>These production settings come from Supabase. They control new registrations only; existing team access and document workflows remain separate.</p>

          <label className="adm-setting-toggle adm-campaign-enabled">
            <span><b>Registration enabled</b><small>Keep enabled to let the campaign open and close automatically on schedule.</small></span>
            <input type="checkbox" checked={visibleDraft.registrationEnabled} disabled={!editing || campaign.saving}
              onChange={(event) => setDraft((current) => ({ ...current, registrationEnabled: event.target.checked }))} />
          </label>

          <DateTimeFields label="Registration opens" date={visibleDraft.openDate} time={visibleDraft.openTime} disabled={!editing || campaign.saving}
            onDate={(value) => setDraft((current) => ({ ...current, openDate: value }))}
            onTime={(value) => setDraft((current) => ({ ...current, openTime: value }))} />
          <DateTimeFields label="Registration closes" date={visibleDraft.closeDate} time={visibleDraft.closeTime} disabled={!editing || campaign.saving}
            onDate={(value) => setDraft((current) => ({ ...current, closeDate: value }))}
            onTime={(value) => setDraft((current) => ({ ...current, closeTime: value }))} />
          <DateTimeFields label="Signed document deadline" date={visibleDraft.signedDate} time={visibleDraft.signedTime} disabled={!editing || campaign.saving}
            onDate={(value) => setDraft((current) => ({ ...current, signedDate: value }))}
            onTime={(value) => setDraft((current) => ({ ...current, signedTime: value }))} />

          <div className="adm-campaign-timezone"><span>Timezone</span><strong>{AIVEX_BUSINESS_TIME_ZONE} (UTC+1)</strong></div>
          {error && <p className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error}</p>}
          <div className="adm-campaign-actions">
            {!editing
              ? <Button type="button" onClick={startEditing} icon={<Pencil size={15}/>}>Edit</Button>
              : <><Button type="button" variant="secondary" onClick={cancelEditing} disabled={campaign.saving}>Cancel</Button><Button type="submit" disabled={campaign.saving}>{campaign.saving ? 'Saving…' : 'Save changes'}</Button></>}
          </div>
        </form>

        <aside className="adm-panel adm-campaign-summary">
          <CalendarClock size={24} aria-hidden="true" />
          <span className="adm-eyebrow">Registration window</span>
          <strong>{formatCampaignDateTime(campaign.settings.registrationOpenAt, 'en')}</strong>
          <i aria-hidden="true">→</i>
          <strong>{formatCampaignDateTime(campaign.settings.registrationCloseAt, 'en')}</strong>
          <small>Signed document deadline<br/><b>{formatCampaignDateTime(campaign.settings.signedDocumentDeadline, 'en')}</b></small>
        </aside>
      </div>

      <Modal open={confirming} onClose={() => !campaign.saving && setConfirming(false)} title="Update AIVEX registration period?"
        footer={<><Button variant="secondary" onClick={() => setConfirming(false)} disabled={campaign.saving}>Cancel</Button><Button onClick={confirmUpdate} disabled={campaign.saving}>{campaign.saving ? <><LoaderCircle className="adm-spin" size={15}/>Saving…</> : 'Confirm update'}</Button></>}>
        <dl className="adm-campaign-confirmation">
          <div><dt>Registration will open</dt><dd>{checked.ok ? formatCampaignDateTime(checked.payload.registrationOpenAt, 'en') : '—'}</dd></div>
          <div><dt>Registration will close</dt><dd>{checked.ok ? formatCampaignDateTime(checked.payload.registrationCloseAt, 'en') : '—'}</dd></div>
          <div><dt>Signed document deadline</dt><dd>{checked.ok ? formatCampaignDateTime(checked.payload.signedDocumentDeadline, 'en') : '—'}</dd></div>
          <div><dt>Timezone</dt><dd>{AIVEX_BUSINESS_TIME_ZONE}</dd></div>
        </dl>
        {closesActiveCampaign && <div className="adm-campaign-warning" role="alert"><AlertTriangle size={18}/><p><b>This will close the active campaign immediately.</b> New registrations will stop as soon as this update is confirmed.</p></div>}
      </Modal>
    </>
  )
}
