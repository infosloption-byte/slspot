import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { adminApi, type AdminAlert, type RiskLimits, type RiskSettingsView } from './api'

const AMOUNT_FIELDS: Array<{ key: 'minTradeAmount' | 'maxTradeAmount' | 'maxUserOpenExposure' | 'maxPlatformOpenProfit' | 'maxAssetOpenProfit' | 'maxDirectionOpenProfit'; label: string; help: string }> = [
  { key: 'minTradeAmount', label: 'Smallest trade (USD)', help: 'Applies to demo and real trades.' },
  { key: 'maxTradeAmount', label: 'Largest trade (USD)', help: 'Applies to demo and real trades. Keep it low at launch.' },
  { key: 'maxUserOpenExposure', label: 'Most one customer can have open (USD stake)', help: 'Total stake of one customer’s open real trades.' },
  { key: 'maxPlatformOpenProfit', label: 'Platform open-profit cap (USD)', help: 'Most profit you could owe if every open real trade won.' },
  { key: 'maxAssetOpenProfit', label: 'Per-asset open-profit cap (USD)', help: 'Same measure, for one asset.' },
  { key: 'maxDirectionOpenProfit', label: 'Per-direction open-profit cap (USD)', help: 'Same measure, for one asset and one direction (up or down).' },
]

function money(value: string) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value
}

function Bar({ label, used, limit, percent }: { label: string; used: string; limit: string; percent: number }) {
  const tone = percent >= 100 ? 'risk-track risk-track--full' : percent >= 80 ? 'risk-track risk-track--warn' : 'risk-track'
  return <div className="risk-row">
    <div><strong>{label}</strong><span>{money(used)} of {money(limit)} ({Math.round(percent)}%)</span></div>
    <div className={tone}><span style={{ width: Math.min(100, percent) + '%' }} /></div>
  </div>
}

/** Current alerts for the Dashboard. Shows nothing when all is well. */
export function AlertsBanner({ refreshKey }: { refreshKey: number }) {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    adminApi.alerts().then((r) => { if (!cancelled) { setAlerts(r.alerts); setFailed(false) } }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [refreshKey])
  if (failed) return <div className="notice"><AlertTriangle size={17} /><span>Alerts could not be checked just now.</span></div>
  if (alerts.length === 0) return <div className="notice"><CheckCircle2 size={17} className="text-positive" /><span>No active alerts.</span></div>
  return <section className="alert-list" aria-label="Active alerts">
    {alerts.map((alert) => <div key={alert.key} className={alert.severity === 'CRITICAL' ? 'notice notice--error' : 'notice notice--warn'} role="alert">
      <AlertTriangle size={17} /><span><strong>{alert.title}.</strong> {alert.message}</span>
    </div>)}
  </section>
}

type Draft = Omit<RiskLimits, 'payoutRates' | 'restrictedCountries' | 'maxUserOpenPositions' | 'alertKycReviewHours'> & {
  maxUserOpenPositions: string
  alertKycReviewHours: string
  payoutPercent: Record<string, string>
  countries: string
}

function toDraft(view: RiskSettingsView): Draft {
  const { limits } = view
  return {
    minTradeAmount: limits.minTradeAmount, maxTradeAmount: limits.maxTradeAmount, maxUserOpenExposure: limits.maxUserOpenExposure,
    maxPlatformOpenProfit: limits.maxPlatformOpenProfit, maxAssetOpenProfit: limits.maxAssetOpenProfit, maxDirectionOpenProfit: limits.maxDirectionOpenProfit,
    maxUserOpenPositions: String(limits.maxUserOpenPositions), alertKycReviewHours: String(limits.alertKycReviewHours),
    payoutPercent: Object.fromEntries(view.payouts.map((p) => [p.symbol, String(Math.round(Number(p.rate) * 10000) / 100)])),
    countries: limits.restrictedCountries.join(', '),
  }
}

function toLimits(draft: Draft, view: RiskSettingsView): RiskLimits {
  const payoutRates: Record<string, string> = {}
  for (const payout of view.payouts) {
    const percent = Number(draft.payoutPercent[payout.symbol])
    if (!Number.isFinite(percent)) throw new Error('Payout for ' + payout.symbol + ' must be a number such as 85')
    const rate = (Math.round(percent * 100) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    // Only store an override when it differs from the built-in rate.
    if (Number(rate) !== Number(payout.defaultRate)) payoutRates[payout.symbol] = rate.includes('.') ? rate : rate + '.0'
  }
  // Keep overrides for assets that are currently inactive.
  for (const [symbol, rate] of Object.entries(view.limits.payoutRates)) if (!view.payouts.some((p) => p.symbol === symbol)) payoutRates[symbol] = rate
  return {
    minTradeAmount: draft.minTradeAmount.trim(), maxTradeAmount: draft.maxTradeAmount.trim(), maxUserOpenExposure: draft.maxUserOpenExposure.trim(),
    maxPlatformOpenProfit: draft.maxPlatformOpenProfit.trim(), maxAssetOpenProfit: draft.maxAssetOpenProfit.trim(), maxDirectionOpenProfit: draft.maxDirectionOpenProfit.trim(),
    maxUserOpenPositions: Number(draft.maxUserOpenPositions), alertKycReviewHours: Number(draft.alertKycReviewHours),
    payoutRates,
    restrictedCountries: draft.countries.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean),
  }
}

export function RiskLimitsPage({ refreshKey, role }: { refreshKey: number; role: string }) {
  const [view, setView] = useState<RiskSettingsView | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      const result = await adminApi.riskSettings()
      setView(result)
      setDraft(toDraft(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load risk limits')
    }
  }
  useEffect(() => { void load() }, [refreshKey])

  const changed = useMemo(() => Boolean(view && draft && JSON.stringify(toDraft(view)) !== JSON.stringify(draft)), [view, draft])

  async function save() {
    if (!view || !draft) return
    setBusy(true); setError(''); setSaved(false)
    try {
      const result = await adminApi.updateRiskSettings(toLimits(draft, view))
      setView(result); setDraft(toDraft(result)); setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save risk limits')
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: Partial<Draft>) => { setSaved(false); setDraft((current) => current ? { ...current, ...patch } : current) }

  if (!view || !draft) return <div className="page">{error ? <div className="notice notice--error" role="alert"><XCircle size={17} /><span>{error}</span></div> : <div className="loading-card"><Activity className="spin" size={20} /> Loading risk limits…</div>}</div>

  return <div className="page">
    {error ? <div className="notice notice--error" role="alert"><XCircle size={17} /><span>{error}</span></div> : null}
    {saved ? <div className="notice"><CheckCircle2 size={17} className="text-positive" /><span>Saved. The change is in the audit log and applies to new trades within seconds.</span></div> : null}
    {role !== 'SUPER_ADMIN' ? <div className="notice"><AlertTriangle size={17} /><span>You can lower limits and payouts and add restricted countries. Raising a limit, raising a payout or removing a country needs a super administrator.</span></div> : null}

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Live, real trades only</span><h2>Open exposure right now</h2><small>Open profit = stake × payout: what you would owe on top of the held stakes if every open real trade won.</small></div><span className="tag">{view.exposure.openPositions} open</span></div>
      <div className="risk-bars">
        <Bar label="Whole platform" {...view.exposure.platform} />
        {view.exposure.byAsset.map((row) => <Bar key={'a' + row.symbol} label={row.symbol} used={row.used} limit={row.limit} percent={row.percent} />)}
        {view.exposure.byDirection.map((row) => <Bar key={'d' + row.symbol} label={row.symbol} used={row.used} limit={row.limit} percent={row.percent} />)}
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Limits</span><h2>Trade and exposure caps</h2></div></div>
      <div className="form-grid">
        {AMOUNT_FIELDS.map((f) => <label className="field" key={f.key}><span>{f.label}</span><input inputMode="decimal" value={draft[f.key]} onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)} /><small className="muted-label">{f.help}</small></label>)}
        <label className="field"><span>Most open trades per customer</span><input inputMode="numeric" value={draft.maxUserOpenPositions} onChange={(e) => set({ maxUserOpenPositions: e.target.value })} /></label>
        <label className="field"><span>Alert when an identity check waits longer than (hours)</span><input inputMode="numeric" value={draft.alertKycReviewHours} onChange={(e) => set({ alertKycReviewHours: e.target.value })} /></label>
      </div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Payouts</span><h2>Profit paid on a winning trade</h2><small>The break-even win rate is the share of trades customers must win for you to make nothing.</small></div></div>
      <div className="table-wrap"><table className="admin-table"><thead><tr><th>Asset</th><th>Payout %</th><th>Built-in</th><th>Customers break even at</th></tr></thead><tbody>
        {view.payouts.map((p) => {
          const percent = Number(draft.payoutPercent[p.symbol])
          const breakEven = Number.isFinite(percent) && percent > -100 ? (100 / (1 + percent / 100)).toFixed(1) + '% wins' : '—'
          return <tr key={p.symbol}><td><strong>{p.symbol}</strong></td><td><input className="inline-input" inputMode="decimal" value={draft.payoutPercent[p.symbol] ?? ''} onChange={(e) => set({ payoutPercent: { ...draft.payoutPercent, [p.symbol]: e.target.value } })} aria-label={'Payout percent for ' + p.symbol} /></td><td>{Math.round(Number(p.defaultRate) * 100)}%</td><td>{breakEven}</td></tr>
        })}
      </tbody></table></div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Where you can operate</span><h2>Restricted countries</h2><small>Customers in these countries cannot open real trades, start identity verification or make real deposits. They can always withdraw.</small></div><span className="tag">{draft.countries.split(/[\s,;]+/).filter(Boolean).length} countries</span></div>
      <div className="form-grid form-grid--one">
        <label className="field"><span>Two-letter country codes, separated by commas</span><textarea value={draft.countries} onChange={(e) => set({ countries: e.target.value })} /></label>
        <p className="muted-label">The starting list copies what a comparable platform publishes (a 2023 third-party summary). It is not legal advice and may be out of date. Have a lawyer confirm where you may offer this service before launch.</p>
      </div>
    </section>

    <div className="action-row">
      <button type="button" className="button button--primary" disabled={busy || !changed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save audited changes'}</button>
      <button type="button" className="button button--ghost" disabled={busy || !changed} onClick={() => setDraft(toDraft(view))}>Discard changes</button>
      <span className="muted-label">{view.updatedAt ? 'Last saved ' + new Date(view.updatedAt).toLocaleString() : 'Using launch defaults'}</span>
    </div>
  </div>
}
