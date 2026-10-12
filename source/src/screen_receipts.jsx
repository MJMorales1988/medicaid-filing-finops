import { fmtDate, fmtUSD, sum, toCSV, centsCsv } from './util.js';
import { useApp, Panel, Badge, StatusBadge, Money, Select, Empty, useSorted, SortTh, usePaged, Pager, Btn, Callout } from './ui_core.jsx';
import { RecordReceiptDialog, VerifyReceiptDialog, AllocateDialog, ReverseDialog, RefundDialog } from './dialogs.jsx';
const { useState, useMemo, useEffect } = React;

const E0 = { q: '', recipient: '', state: '', ptype: '', unapplied: false, month: false };

export default function Receipts({ params }) {
  const { db, d, csv } = useApp();
  const [f, setF] = useState({ ...E0, ...(params.f || {}), q: params.focus || '' });
  const [dlg, setDlg] = useState(params.allocate ? ['alloc', params.allocate] : null);
  const rows = useMemo(() => db.receipts.map((r) => ({ ...r, ...d.rc[r.id], pendingRefund: db.approvals.some((a) => a.kind === 'Refund' && a.status === 'Pending' && a.payload && a.payload.receiptId === r.id) }))
    .filter((r) => (!f.q || (r.id + r.payerName + r.reference + (r.qboRef || '')).toLowerCase().includes(f.q.toLowerCase())) && (!f.recipient || r.recipient === f.recipient) && (!f.state || r.state === f.state) && (!f.ptype || r.payerType === f.ptype) && (!f.unapplied || r.available > 0) && (!f.month || r.receivedDate.slice(0, 7) === '2026-10')), [db, d, f]);
  const s = useSorted(rows, 'receivedDate', -1); const pg = usePaged(s.sorted, 8);
  const live = db.receipts.filter((r) => r.kind === 'receipt' && r.state === 'Verified');
  const stats = [
    ['Verified MFC cash (USD, all time)', fmtUSD(sum(live.filter((r) => r.recipient === 'MFC' && r.currency === 'USD'), (r) => r.amountCents))],
    ['Unapplied, MFC USD', fmtUSD(d.k.unapplied)], ['Held by PS/SS (not MFC cash)', fmtUSD(d.k.unappliedOther)],
    ['Reported, not yet verified', fmtUSD(sum(db.receipts.filter((r) => r.state === 'Reported'), (r) => r.amountCents))],
  ];
  const exportCsv = () => csv('Receipts ledger', toCSV(s.sorted, [{ label: 'Receipt', get: (r) => r.id }, { label: 'Payer', get: (r) => r.payerName }, { label: 'Payer type', get: (r) => r.payerType }, { label: 'Recipient', get: (r) => r.recipient }, { label: 'Received', get: (r) => r.receivedDate }, { label: 'Deposited', get: (r) => r.depositedDate || '' }, { label: 'Currency', get: (r) => r.currency }, { label: 'Amount', get: (r) => centsCsv(r.amountCents) }, { label: 'Method', get: (r) => r.method }, { label: 'Reference', get: (r) => r.reference }, { label: 'State', get: (r) => r.state }, { label: 'Allocated', get: (r) => centsCsv(r.allocated) }, { label: 'Unapplied', get: (r) => centsCsv(r.available) }, { label: 'QBO ref', get: (r) => r.qboRef || '' }]), s.sorted.length);
  const rec = (id) => db.receipts.find((r) => r.id === id);
  const active = f.q || f.recipient || f.state || f.ptype || f.unapplied || f.month;
  return (
    <>
      <div className="grid g-kpi">{stats.map(([l, v]) => <div key={l} className="kpi" style={{ cursor: 'default' }}><span className="l">{l}</span><span className="v" style={{ fontSize: 20 }}>{v}</span></div>)}</div>
      <Panel flush title="Receipts ledger" actions={<><button className="btn sm" onClick={exportCsv}>Export CSV</button><Btn kind="pri" perm="recordReceipt" onClick={() => setDlg(['record'])}>Record receipt</Btn></>}>
        <div className="filters">
          <label className="field"><span className="lab">Search</span><input type="search" placeholder="Receipt, payer, reference, QBO" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <label className="field"><span className="lab">Recipient entity</span><Select value={f.recipient} onChange={(v) => setF({ ...f, recipient: v })} options={[['', 'Any'], 'MFC', 'PS', 'SS']} /></label>
          <label className="field"><span className="lab">Verification state</span><Select value={f.state} onChange={(v) => setF({ ...f, state: v })} options={[['', 'Any'], 'Reported', 'Verified', 'Reversed', 'Reversal']} /></label>
          <label className="field"><span className="lab">Payer type</span><Select value={f.ptype} onChange={(v) => setF({ ...f, ptype: v })} options={[['', 'Any'], 'Client', 'Attorney', 'Policy Solutions', 'Simply Sold', 'Title/Escrow']} /></label>
          <label className="field"><span className="lab">Show only</span><span className="row"><label className="row sm"><input type="checkbox" checked={f.unapplied} onChange={(e) => setF({ ...f, unapplied: e.target.checked })} /> Unapplied</label><label className="row sm"><input type="checkbox" checked={f.month} onChange={(e) => setF({ ...f, month: e.target.checked })} /> This month</label></span></label>
          {active ? <div className="row" style={{ alignItems: 'flex-end' }}><button className="btn sm" onClick={() => setF(E0)}>Clear filters</button></div> : null}
        </div>
        <div className="tw"><table>
          <thead><tr><SortTh s={s} k="id">Receipt</SortTh><SortTh s={s} k="payerName">Payer</SortTh><SortTh s={s} k="recipient">Recipient</SortTh><SortTh s={s} k="receivedDate">Received</SortTh><th>Deposited</th><SortTh s={s} k="amountCents" num>Amount</SortTh><th>Method / reference</th><SortTh s={s} k="state">State</SortTh><th>Evidence</th><th>QBO ref</th><th className="num">Applied / unapplied</th><th>Actions</th></tr></thead>
          <tbody>{pg.items.map((r) => (
            <tr key={r.id} className={r.kind === 'contra' || r.state === 'Reversed' ? 'muted' : r.id === params.focus ? 'hl' : ''}>
              <td className="mono">{r.id}{r.kind === 'contra' ? <div className="sub">Reversal of {r.reversalOf}</div> : null}{r.reversedBy ? <div className="sub">Reversed by {r.reversedBy}</div> : null}</td>
              <td>{r.payerName}<div className="sub">{r.payerType}{r.internal ? ' · internal transfer' : ''}</div></td>
              <td><Badge tone={r.recipient === 'MFC' ? 'acc' : 'muted'}>{r.recipient}</Badge></td>
              <td>{fmtDate(r.receivedDate)}</td><td>{r.depositedDate ? fmtDate(r.depositedDate) : <span className="muted">—</span>}</td>
              <td className="num"><Money c={r.amountCents} cur={r.currency} strong /></td>
              <td>{r.method}<div className="sub mono">{r.reference}</div></td>
              <td><StatusBadge s={r.state} />{r.state === 'Reported' ? <div className="sub">Not counted as cash</div> : null}{r.pendingRefund ? <div><Badge tone="warn">Refund pending</Badge></div> : null}</td>
              <td className="sm" style={{ maxWidth: 150 }}>{r.evidence || <span className="muted">None</span>}</td>
              <td className="mono sm">{r.qboRef || <span className="muted">—</span>}</td>
              <td className="num">{r.counts ? <><Money c={r.allocated} cur={r.currency} /><div className="sub" style={{ color: r.available > 0 ? 'var(--warn)' : undefined }}>{r.available > 0 ? <b>{fmtUSD(r.available, r.currency)} unapplied</b> : 'fully applied'}</div></> : '—'}</td>
              <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                {r.state === 'Reported' ? <Btn sm perm="verifyReceipt" onClick={() => setDlg(['verify', r.id])}>Verify</Btn> : null}
                {r.state === 'Verified' && r.available > 0 ? <Btn sm kind="pri" perm="allocate" onClick={() => setDlg(['alloc', r.id])}>Allocate</Btn> : null}
                {r.state === 'Verified' && r.available > 0 ? <Btn sm perm="refund" onClick={() => setDlg(['refund', r.id])}>Refund</Btn> : null}
                {['Verified', 'Reported'].includes(r.state) && r.kind !== 'contra' ? <Btn sm perm="reverse" onClick={() => setDlg(['reverse', r.id])}>Reverse</Btn> : null}
              </div></td>
            </tr>))}</tbody>
        </table>{!pg.items.length ? <Empty title="No receipts match" hint={active ? 'Clear filters to see the full ledger.' : 'Record a receipt to start.'} /> : null}</div>
        <Pager p={pg} />
      </Panel>
      <Callout tone="info">Record → verify → allocate. Unverified (Reported) receipts never reduce a balance. Unapplied money stays visible here until it is allocated or refunded with approval. Receipts held by PS or SS are not MFC cash.</Callout>
      {dlg && dlg[0] === 'record' ? <RecordReceiptDialog onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'verify' ? <VerifyReceiptDialog r={rec(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'alloc' ? <AllocateDialog receiptId={dlg[1]} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'reverse' ? <ReverseDialog kind="receipt" id={dlg[1]} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'refund' ? <RefundDialog receiptId={dlg[1]} onClose={() => setDlg(null)} /> : null}
    </>
  );
}
