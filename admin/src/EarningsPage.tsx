import { useEffect, useMemo, useState } from 'react'
import { Activity, Download, TrendingUp, XCircle } from 'lucide-react'
import { adminApi, type EarningsDay, type EarningsReport } from './api'

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const now = new Date()
  const to = ymd(now)
  if (preset === 'today') return { from: to, to }
  if (preset === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  const back = preset === '7d' ? 6 : 29
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)), to }
}

function money(value: string | null | undefined) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return value ?? '0.00'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function signed(value: string) {
  const n = Number(value)
  return (n > 0 ? '+' : '') + money(value)
}

function tone(value: string) {
  const n = Number(value)
  return n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : ''
}

function Card({ label, value, detail, valueClass }: { label: string; value: string; detail: string; valueClass?: string }) {
  return <article className="metric"><span>{label}</span><strong className={valueClass}>{value}</strong><small>{detail}</small></article>
}

function DailyChart({ days }: { days: EarningsDay[] }) {
  const values = days.map((d) => Number(d.earnings))
  const max = Math.max(1, ...values.map((v) => Math.abs(v)))
  const width = Math.max(320, days.length * 26)
  const height = 180
  const mid = height / 2
  const bar = Math.min(18, Math.max(4, (width / Math.max(days.length, 1)) * 0.6))
  return <div className="earnings-chart" role="img" aria-label="Daily platform earnings">
    <svg viewBox={'0 0 ' + width + ' ' + (height + 22)} width="100%" preserveAspectRatio="none" style={{ minWidth: Math.min(width, 900) }}>
      <line x1="0" x2={width} y1={mid} y2={mid} stroke="rgba(255,255,255,.18)" />
      {days.map((d, i) => {
        const v = values[i] ?? 0
        const h = Math.max(1, (Math.abs(v) / max) * (mid - 8))
        const x = (i + 0.5) * (width / days.length) - bar / 2
        return <g key={d.date}>
          <title>{d.date + ': ' + signed(d.earnings) + ' USD'}</title>
          <rect x={x} y={v >= 0 ? mid - h : mid} width={bar} height={h} rx="2" fill={v >= 0 ? '#1fd27a' : '#ff5667'} />
          {days.length <= 31 && (i % Math.ceil(days.length / 12) === 0) ? <text x={x + bar / 2} y={height + 14} textAnchor="middle" fontSize="9" fill="#92929d">{d.date.slice(5)}</text> : null}
        </g>
      })}
    </svg>
  </div>
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

function exportCsv(report: EarningsReport) {
  const header = ['date', 'trades_settled', 'volume', 'wins', 'losses', 'draws', 'voided', 'house_result', 'fee_revenue', 'earnings', 'deposits_count', 'deposits', 'withdrawals_count', 'withdrawals', 'withdrawals_requested', 'net_cash_flow']
  const rows = report.days.map((d) => [d.date, d.tradesSettled, d.volume, d.wins, d.losses, d.draws, d.voided, d.houseResult, d.feeRevenue, d.earnings, d.deposits.count, d.deposits.amount, d.withdrawals.count, d.withdrawals.amount, d.withdrawalsRequested.amount, d.netCashFlow])
  const blob = new Blob([[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'slspot-earnings-' + report.range.from + '_' + report.range.to + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function EarningsPage({ refreshKey }: { refreshKey: number }) {
  const initial = presetRange('30d')
  const [preset, setPreset] = useState<Preset>('30d')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [report, setReport] = useState<EarningsReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function choose(next: Exclude<Preset, 'custom'>) {
    const r = presetRange(next)
    setPreset(next); setFrom(r.from); setTo(r.to)
  }

  useEffect(() => {
    if (!from || !to || from > to) return
    let cancelled = false
    setLoading(true); setError('')
    const offsetMinutes = -new Date().getTimezoneOffset()
    adminApi.earnings('?from=' + from + '&to=' + to + '&offsetMinutes=' + offsetMinutes)
      .then((data) => { if (!cancelled) setReport(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load earnings') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, refreshKey])

  const days = report?.days ?? []
  const newestFirst = useMemo(() => [...days].reverse(), [days])
  const t = report?.totals

  return <div className="page earnings-page">
    <section className="panel toolbar-panel">
      <div className="filter-row">
        <div className="segmented" role="group" aria-label="Period">
          {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month']] as const).map(([id, label]) =>
            <button key={id} type="button" className={preset === id ? 'seg seg--active' : 'seg'} onClick={() => choose(id)}>{label}</button>)}
        </div>
        <label className="field"><span>From</span><input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }} /></label>
        <label className="field"><span>To</span><input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setTo(e.target.value) }} /></label>
        <button type="button" className="button button--ghost" disabled={!report} onClick={() => report && exportCsv(report)}><Download size={15} /> Export CSV</button>
      </div>
      {from > to ? <p className="earnings-hint">“From” must be on or before “To”. Ranges are limited to 92 days.</p> : null}
    </section>

    {error ? <div className="notice notice--error" role="alert"><XCircle size={17} /><span>{error}</span></div> : null}
    {report?.truncated ? <div className="notice notice--error" role="alert"><XCircle size={17} /><span>This range has more records than the report can read, so the figures are incomplete. Choose a shorter period.</span></div> : null}

    {report && t ? <>
      <section className="metrics-grid">
        <Card label="Platform earnings" value={signed(t.earnings)} valueClass={tone(t.earnings)} detail={'House result + fees · ' + t.tradesSettled + ' trades'} />
        <Card label="House result" value={signed(t.houseResult)} valueClass={tone(t.houseResult)} detail={t.houseMargin ? 'Margin ' + (Number(t.houseMargin) * 100).toFixed(2) + '% of volume' : 'No volume in range'} />
        <Card label="Fee revenue" value={money(t.feeRevenue)} detail="Trade fees kept" />
        <Card label="Deposits" value={money(t.deposits.amount)} detail={t.deposits.count + ' completed'} />
        <Card label="Withdrawals paid" value={money(t.withdrawals.amount)} detail={t.withdrawals.count + ' completed'} />
        <Card label="Net cash flow" value={signed(t.netCashFlow)} valueClass={tone(t.netCashFlow)} detail="Deposits − withdrawals" />
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Right now</span><h2>Pending &amp; exposure</h2></div><Activity size={18} /></div>
          <div className="snapshot-list">
            <div><span>Pending withdrawals</span><strong>{money(report.snapshot.pendingWithdrawals.amount)} <small>({report.snapshot.pendingWithdrawals.count})</small></strong></div>
            <div><span>Awaiting review</span><strong>{report.snapshot.pendingWithdrawals.awaitingReview}</strong></div>
            <div><span>Oldest request</span><strong>{report.snapshot.pendingWithdrawals.oldestRequestedAt ? new Date(report.snapshot.pendingWithdrawals.oldestRequestedAt).toLocaleString() : '—'}</strong></div>
            <div><span>Pending deposits</span><strong>{money(report.snapshot.pendingDeposits.amount)} <small>({report.snapshot.pendingDeposits.count})</small></strong></div>
            <div><span>Open trades</span><strong>{report.snapshot.openTrades.count} · stake {money(report.snapshot.openTrades.stake)}</strong></div>
            <div><span>Max payout if all win</span><strong>{money(report.snapshot.openTrades.maxPayout)}</strong></div>
            <div><span>Required reserve</span><strong>{money(report.reserve.requiredReserve)} <small>= customer funds {money(report.reserve.customerFunds)} + open profit at risk {money(report.reserve.openProfitAtRisk)}</small></strong></div>
            <div><span>Customer balances</span><strong>{money(report.snapshot.customerBalances.available)} <small>+ {money(report.snapshot.customerBalances.held)} held</small></strong></div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Since launch</span><h2>All-time</h2></div><TrendingUp size={18} /></div>
          <div className="snapshot-list">
            <div><span>Platform earnings</span><strong className={tone(report.allTime.earnings)}>{signed(report.allTime.earnings)}</strong></div>
            <div><span>House result</span><strong className={tone(report.allTime.houseResult)}>{signed(report.allTime.houseResult)}</strong></div>
            <div><span>Fee revenue</span><strong>{money(report.allTime.feeRevenue)}</strong></div>
            <div><span>Total deposits</span><strong>{money(report.allTime.deposits)}</strong></div>
            <div><span>Total withdrawals</span><strong>{money(report.allTime.withdrawals)}</strong></div>
            <div><span>Net cash flow</span><strong className={tone(report.allTime.netCashFlow)}>{signed(report.allTime.netCashFlow)}</strong></div>
            <div><span>Rejected / failed in range</span><strong>{t.withdrawalsRejected.count} · {money(t.withdrawalsRejected.amount)}</strong></div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Per day</span><h2>Earnings by day (USD)</h2></div>{loading ? <Activity className="spin" size={18} /> : <TrendingUp size={18} />}</div>
        <DailyChart days={days} />
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Daily breakdown</span><h2>Day by day</h2></div></div>
        <div className="table-wrap"><table className="admin-table earnings-table">
          <thead><tr><th>Date</th><th>Trades</th><th>W / L / D / V</th><th>Volume</th><th>House result</th><th>Fees</th><th>Earnings</th><th>Deposits</th><th>Withdrawals</th><th>Requested</th><th>Net cash</th></tr></thead>
          <tbody>
            {newestFirst.map((d) => <tr key={d.date}>
              <td>{d.date}</td><td>{d.tradesSettled}</td><td>{d.wins} / {d.losses} / {d.draws} / {d.voided}</td><td>{money(d.volume)}</td>
              <td className={tone(d.houseResult)}>{signed(d.houseResult)}</td><td>{money(d.feeRevenue)}</td><td className={tone(d.earnings)}><strong>{signed(d.earnings)}</strong></td>
              <td>{money(d.deposits.amount)} <small>({d.deposits.count})</small></td><td>{money(d.withdrawals.amount)} <small>({d.withdrawals.count})</small></td>
              <td>{money(d.withdrawalsRequested.amount)} <small>({d.withdrawalsRequested.count})</small></td><td className={tone(d.netCashFlow)}>{signed(d.netCashFlow)}</td>
            </tr>)}
          </tbody>
          <tfoot><tr>
            <td>Total</td><td>{t.tradesSettled}</td><td>{t.wins} / {t.losses} / {t.draws} / {t.voided}</td><td>{money(t.volume)}</td>
            <td className={tone(t.houseResult)}>{signed(t.houseResult)}</td><td>{money(t.feeRevenue)}</td><td className={tone(t.earnings)}>{signed(t.earnings)}</td>
            <td>{money(t.deposits.amount)} <small>({t.deposits.count})</small></td><td>{money(t.withdrawals.amount)} <small>({t.withdrawals.count})</small></td>
            <td>{money(t.withdrawalsRequested.amount)} <small>({t.withdrawalsRequested.count})</small></td><td className={tone(t.netCashFlow)}>{signed(t.netCashFlow)}</td>
          </tr></tfoot>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">By payment provider</span><h2>Providers</h2></div></div>
        {report.providers.length === 0 ? <p className="earnings-hint">No completed deposits or withdrawals in this range.</p> : <div className="table-wrap"><table className="admin-table">
          <thead><tr><th>Provider</th><th>Deposits</th><th>Count</th><th>Withdrawals</th><th>Count</th></tr></thead>
          <tbody>{report.providers.map((p) => <tr key={p.provider}><td>{p.provider}</td><td>{money(p.deposits.amount)}</td><td>{p.deposits.count}</td><td>{money(p.withdrawals.amount)}</td><td>{p.withdrawals.count}</td></tr>)}</tbody>
        </table></div>}
      </section>
      <p className="earnings-hint">Real-money accounts only, USD. Earnings = what customers lose minus what they win, plus trade fees. Days follow your browser's time zone. Demo accounts are excluded.</p>
    </> : !error ? <div className="loading-card"><Activity className="spin" size={20} /> Loading earnings…</div> : null}
  </div>
}
