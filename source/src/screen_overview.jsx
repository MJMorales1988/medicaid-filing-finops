import { fmt0, fmtUSD, sum } from './util.js';
import { useApp, Panel, Badge, Empty } from './ui_core.jsx';

function Kpi({ label, value, sub, go: onGo, tone, hint }) {
  return <button className={'kpi ' + (tone || '')} onClick={onGo} aria-label={`${label}: ${value}. ${hint}`}><span className="l">{label}</span><span className="v">{value}</span><span className="s">{sub}</span><span className="go">{hint} →</span></button>;
}

export default function Overview() {
  const { db, d, go } = useApp();
  const k = d.k;
  const nCollect = db.obligations.filter((o) => o.triggerState === 'Active' && d.ob[o.id].outstanding > 0).length;
  const nCond = db.obligations.filter((o) => o.triggerState === 'Awaiting' && d.ob[o.id].outstanding > 0).length;
  const nOver = db.obligations.filter((o) => d.ob[o.id].daysPastDue > 0).length;
  const maxAge = Math.max(1, ...k.buckets.map((b) => b.cents));
  const types = Object.entries(k.byDebtor);
  const maxType = Math.max(1, ...types.map(([, v]) => v.collectible + v.conditional));
  const closed = db.cases.filter((c) => c.finClosed).length;
  const verified = db.cases.filter((c) => db.agreements.some((a) => a.caseId === c.id && a.verifiedVersion)).length;
  return (
    <>
      <div className="grid g-kpi">
        <Kpi label="MFC outstanding, collectible now" value={fmt0(k.collectible)} sub={`${nCollect} obligations with an active trigger`} hint="Open collectible items" go={() => go('collections', { tab: 'all', filters: { trig: 'Active' } })} />
        <Kpi label="Conditional, awaiting triggers" value={fmt0(k.conditional)} sub={`${nCond} obligation${nCond === 1 ? '' : 's'} (sale or closing pending)`} hint="Open awaiting trigger" go={() => go('collections', { tab: 'awaiting' })} />
        <Kpi tone="bad" label="Overdue balance" value={fmt0(k.overdue)} sub={`${nOver} obligations past due`} hint="Open overdue" go={() => go('collections', { tab: 'overdue' })} />
        <Kpi label="Verified MFC cash this month" value={fmt0(k.cashMonth)} sub="Received by MFC and verified (USD)" hint="Open receipts ledger" go={() => go('receipts', { f: { recipient: 'MFC', state: 'Verified', month: true } })} />
        <Kpi label="Unapplied receipts" value={fmt0(k.unapplied)} sub={`MFC USD only. Also held: ${fmt0(k.unappliedOther)} by PS/SS, CAD ${fmt0(k.unappliedFx, '').trim()}`} hint="Open unapplied cash" go={() => go('receipts', { f: { unapplied: true } })} />
        <Kpi tone={k.reconExceptions ? 'bad' : ''} label="Reconciliation exceptions" value={String(k.reconExceptions)} sub="Unmatched, differences and review items (simulated QBO)" hint="Open reconciliation" go={() => go('recon', {})} />
      </div>

      <div className="grid g-2">
        <Panel title="Aging of collectible balances">
          <div className="bars">
            {k.buckets.map((b, i) => (
              <div key={b.label} className={'bar' + (i > 0 ? ' late' : '')}>
                <span>{b.label}</span><span className="track" aria-hidden="true"><span className="fill" style={{ width: (b.cents / maxAge) * 100 + '%', display: 'block', opacity: b.cents ? 1 : 0 }} /></span>
                <span className="num">{fmt0(b.cents)} <span className="muted sm">({b.count})</span></span>
              </div>))}
          </div>
          <p className="muted sm" style={{ margin: '12px 0 0' }}>Counts in brackets are obligations. Conditional balances are not aged because no due date exists yet.</p>
        </Panel>
        <Panel title="Balances by debtor type">
          {types.length ? <div className="bars">
            {types.map(([t, v]) => (
              <div key={t} style={{ display: 'grid', gap: 3 }}>
                <div className="bar"><span>{t}</span><span className="track" aria-hidden="true"><span className="fill" style={{ width: (v.collectible / maxType) * 100 + '%', display: 'block' }} /></span><span className="num">{fmt0(v.collectible)}</span></div>
                {v.conditional ? <div className="bar cond"><span className="muted sm">conditional</span><span className="track" aria-hidden="true"><span className="fill" style={{ width: (v.conditional / maxType) * 100 + '%', display: 'block' }} /></span><span className="num">{fmt0(v.conditional)}</span></div> : null}
              </div>))}
          </div> : <Empty title="No outstanding balances" />}
          <p className="muted sm" style={{ margin: '12px 0 0' }}>Attorney remittances and PS exchange obligations are counted once, as what each party owes MFC. Client payments to an attorney are fulfillment, not MFC balance.</p>
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Prioritized action queue" actions={<button className="btn sm" onClick={() => go('tasks', {})}>Open task queue</button>} flush>
          {d.queue.length ? <ul className="queue">
            {d.queue.slice(0, 9).map((q, i) => (
              <li key={i}>
                <Badge tone={q.prio >= 90 ? 'bad' : q.prio >= 74 ? 'warn' : 'info'}>{q.kind}</Badge>
                <div><div className="t">{q.label}</div><div className="o">Owner: {q.owner}</div></div>
                <button className="btn sm" onClick={() => go(q.link.view, q.link.params)}>Open</button>
              </li>))}
          </ul> : <Empty title="Nothing needs action" hint="All balances are settled and reconciled." />}
        </Panel>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Panel title="Company-wide cash, this month">
            <div className="bars">
              <div className="bar"><span>MFC verified</span><span /><span className="num">{fmtUSD(k.cashMonth)}</span></div>
              <div className="bar"><span>Group external</span><span /><span className="num">{fmtUSD(k.groupExternal)}</span></div>
              <div className="bar"><span>Internal transfers</span><span /><span className="num">{fmtUSD(k.internalMonth)}</span></div>
            </div>
            <p className="muted sm" style={{ margin: '10px 0 0' }}>Group external cash is money from clients and outside payers received by any group company. PS/SS remittances to MFC are internal transfers and are never added on top, so company-wide totals are not double counted.</p>
          </Panel>
          <Panel title="Every signed case accounted for">
            <div className="kv">
              <div><div className="k">Cases</div><div className="v">{db.cases.length}</div></div>
              <div><div className="k">With verified agreement</div><div className="v">{verified}</div></div>
              <div><div className="k">Agreement exceptions</div><div className="v">{k.exceptionsCases.length}</div></div>
              <div><div className="k">Financially closed</div><div className="v">{closed}</div></div>
            </div>
            {k.exceptionsCases.length ? <p className="sm" style={{ margin: '10px 0 0' }}><Badge tone="bad">Exception</Badge> {k.exceptionsCases.join(', ')} have signed agreements without a verified amount. They show Unknown and are excluded from confirmed monetary totals.</p> : null}
          </Panel>
        </div>
      </div>
    </>
  );
}
