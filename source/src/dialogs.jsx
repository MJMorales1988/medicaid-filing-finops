// Financial dialogs shared by Collections, Cases and Receipts.
import { TODAY, fmtUSD, fmtDate, toCents, centsToInput, sum } from './util.js';
import { OWNERS } from './seed.js';
import { obCalc, rcCalc } from './calc.js';
import * as A1 from './actions1.js';
import { useApp, Modal, Field, MoneyInput, Select, Callout, Badge, StatusBadge, Money, KV, Empty } from './ui_core.jsx';
const { useState, useMemo } = React;

export function AssignOwnerDialog({ ob, onClose }) {
  const { act } = useApp(); const [owner, setOwner] = useState(ob.owner); const [e, setE] = useState('');
  const save = () => { const r = act(A1.assignOwner, { obId: ob.id, owner }); if (r.ok) onClose(); else setE(r.error); };
  return (
    <Modal title="Assign owner" sub={`${ob.id} · ${ob.debtorName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Assign owner</button></>}>
      <Field label="Collection owner"><Select value={owner} onChange={setOwner} options={OWNERS} /></Field>
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function FollowUpDialog({ ob, onClose }) {
  const { act } = useApp(); const [f, setF] = useState({ date: '2026-10-20', note: '', owner: ob.owner }); const [e, setE] = useState('');
  const save = () => { const r = act(A1.scheduleFollowUp, { obId: ob.id, ...f }); if (r.ok) onClose(); else setE(r.error); };
  return (
    <Modal title="Schedule follow-up" sub={`${ob.id} · ${ob.debtorName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Schedule follow-up</button></>}>
      <div className="form2">
        <Field label="Follow-up date"><input type="date" value={f.date} min={TODAY} onChange={(x) => setF({ ...f, date: x.target.value })} /></Field>
        <Field label="Owner"><Select value={f.owner} onChange={(v) => setF({ ...f, owner: v })} options={OWNERS} /></Field>
      </div>
      <Field label="What is the follow-up for?"><textarea value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} placeholder="For example: call attorney office about final remittance" /></Field>
      {ob.followUps.length ? <div className="muted sm">Existing: {ob.followUps.map((x) => `${fmtDate(x.date)} (${x.owner})`).join('; ')}</div> : null}
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export const OUTCOMES = ['Promised to pay', 'Payment plan agreed', 'No response', 'Wrong contact details', 'Dispute raised', 'Escalated to counsel', 'Payment in transit'];
export function OutcomeDialog({ ob, onClose }) {
  const { act } = useApp(); const [o, setO] = useState(OUTCOMES[0]); const [note, setNote] = useState(''); const [e, setE] = useState('');
  const save = () => { const r = act(A1.recordOutcome, { obId: ob.id, outcome: o, note }); if (r.ok) onClose(); else setE(r.error); };
  return (
    <Modal title="Record collection outcome" sub={`${ob.id} · ${ob.debtorName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Record outcome</button></>}>
      <Callout tone="info">Outcomes are internal notes. They never change balances, cash or settlement.</Callout>
      <Field label="Outcome"><Select value={o} onChange={setO} options={OUTCOMES} /></Field>
      <Field label="Note"><textarea value={note} onChange={(x) => setNote(x.target.value)} /></Field>
      {ob.outcomes.length ? <div className="sm muted">Previous: {ob.outcomes.map((x) => x.outcome).join(', ')}</div> : null}
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function AdjustmentDialog({ ob, onClose }) {
  const { act, db, actor } = useApp();
  const x = obCalc(db, ob);
  const [f, setF] = useState({ kind: 'Writeoff', amt: '', reason: '' }); const [e, setE] = useState('');
  const c = toCents(f.amt);
  const valid = Number.isInteger(c) && c > 0;
  const after = valid ? (f.kind === 'Debit' ? x.adjusted + c : x.adjusted - c) : null;
  const outAfter = after == null ? null : Math.max(0, after - x.cash - x.noncash);
  const save = () => { const r = act(A1.proposeAdjustment, { obId: ob.id, kind: f.kind, amountCents: c, reason: f.reason }); if (r.ok) onClose(); else setE(r.error); };
  return (
    <Modal title="Propose adjustment" sub={`${ob.id} · ${ob.debtorName} · proposed by ${actor}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Send for approval</button></>}>
      <Callout tone="warn">Nothing changes until a different approver approves. Adjusted obligation = principal + approved debits − approved credits − approved write-offs.</Callout>
      <div className="form2">
        <Field label="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[['Writeoff', 'Write-off'], ['Credit', 'Deduction (credit)'], ['Debit', 'Debit (increase)']]} /></Field>
        <Field label="Amount (USD)" hint={`Outstanding now ${fmtUSD(x.outstanding)}`}><MoneyInput value={f.amt} onChange={(v) => setF({ ...f, amt: v })} /></Field>
      </div>
      <Field label="Reason"><textarea value={f.reason} onChange={(v) => setF({ ...f, reason: v.target.value })} /></Field>
      <KV items={[['Adjusted now', <Money c={x.adjusted} />], ['Adjusted if approved', after == null ? '—' : <Money c={after} />], ['Outstanding if approved', outAfter == null ? '—' : <Money c={outAfter} />]]} />
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function RecordReceiptDialog({ preset = {}, onClose }) {
  const { act, db } = useApp();
  const [f, setF] = useState({ payerName: '', payerType: 'Client', recipient: 'MFC', amt: '', currency: 'USD', receivedDate: TODAY, depositedDate: '', method: 'Wire', reference: '', memo: '', caseId: '', ...preset });
  const [e, setE] = useState('');
  const set = (k) => (v) => setF({ ...f, [k]: v && v.target ? v.target.value : v });
  const save = () => {
    const c = toCents(f.amt);
    if (Number.isNaN(c) || c == null) return setE('Enter the amount as a dollar value, for example 5,400.00.');
    const r = act(A1.recordReceipt, { ...f, amountCents: c }); if (r.ok) onClose(r); else setE(r.error);
  };
  return (
    <Modal title="Record receipt" sub="Step 1 of 3: record → verify → allocate. Recorded receipts are Reported, not cash." onClose={() => onClose()} wide footer={<><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn pri" onClick={save}>Record receipt</button></>}>
      <div className="form2">
        <Field label="Actual payer"><input type="text" value={f.payerName} onChange={set('payerName')} placeholder="Name on the check or wire" /></Field>
        <Field label="Payer type"><Select value={f.payerType} onChange={set('payerType')} options={['Client', 'Attorney', 'Policy Solutions', 'Simply Sold', 'Title/Escrow', 'Other']} /></Field>
        <Field label="Recipient entity" hint="Who actually received the money"><Select value={f.recipient} onChange={set('recipient')} options={[['MFC', 'MFC'], ['PS', 'Policy Solutions (PS)'], ['SS', 'Simply Sold (SS)']]} /></Field>
        <Field label="Amount"><MoneyInput value={f.amt} onChange={set('amt')} /></Field>
        <Field label="Currency"><Select value={f.currency} onChange={set('currency')} options={['USD', 'CAD']} /></Field>
        <Field label="Method"><Select value={f.method} onChange={set('method')} options={['Wire', 'ACH', 'Check', 'Cash', 'Card']} /></Field>
        <Field label="Received date"><input type="date" max={TODAY} value={f.receivedDate} onChange={set('receivedDate')} /></Field>
        <Field label="Deposited date" hint="Can be added at verification"><input type="date" max={TODAY} value={f.depositedDate} onChange={set('depositedDate')} /></Field>
        <Field label="Reference"><input type="text" value={f.reference} onChange={set('reference')} placeholder="Check #, wire ID" /></Field>
        <Field label="Related case (optional)"><Select value={f.caseId} onChange={set('caseId')} options={[['', 'No case yet']].concat(db.cases.map((c) => [c.id, c.id]))} /></Field>
      </div>
      <Field label="Memo"><input type="text" value={f.memo} onChange={set('memo')} /></Field>
      {['Policy Solutions', 'Simply Sold'].includes(f.payerType) ? <Callout tone="info">Payments from a group company are internal transfers. They count as MFC cash only when MFC is the recipient, and they are excluded from group-wide external cash.</Callout> : null}
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function VerifyReceiptDialog({ r, onClose }) {
  const { act } = useApp(); const [f, setF] = useState({ evidence: '', depositedDate: r.depositedDate || r.receivedDate }); const [e, setE] = useState('');
  const save = () => { const x = act(A1.verifyReceipt, { id: r.id, ...f }); if (x.ok) onClose(x); else setE(x.error); };
  return (
    <Modal title={`Verify ${r.id}`} sub="Step 2 of 3" onClose={() => onClose()} footer={<><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn pri" onClick={save}>Verify receipt</button></>}>
      <KV items={[['Payer', r.payerName], ['Amount', <Money c={r.amountCents} cur={r.currency} />], ['Recipient', r.recipient], ['Reference', <span className="mono">{r.reference}</span>]]} />
      <Field label="Evidence" hint="Bank advice, check image or statement line (fictional reference is fine)"><input type="text" value={f.evidence} onChange={(x) => setF({ ...f, evidence: x.target.value })} placeholder={'Bank advice ' + r.reference} /></Field>
      <Field label="Deposited date"><input type="date" max={TODAY} value={f.depositedDate} onChange={(x) => setF({ ...f, depositedDate: x.target.value })} /></Field>
      <Callout tone="info">After verification the receipt counts as verified cash for its recipient entity and can be allocated.</Callout>
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function blockReason(db, r, o, x) {
  if (x.unknown) return 'Amount is Unknown';
  if (o.entity !== r.recipient) return `Entity mismatch (received by ${r.recipient}, owed to ${o.entity})`;
  if (o.currency !== r.currency) return `Currency mismatch (${r.currency} vs ${o.currency})`;
  if (o.triggerState === 'Awaiting') return 'Awaiting trigger; collateral is not payment';
  if (x.outstanding === 0) return 'Nothing outstanding';
  return '';
}

export function AllocateDialog({ receiptId, onClose }) {
  const { act, db, d } = useApp();
  const r = db.receipts.find((x) => x.id === receiptId); const rc = d.rc[receiptId];
  const [amts, setAmts] = useState({}); const [q, setQ] = useState(''); const [e, setE] = useState('');
  const rows = useMemo(() => db.obligations.map((o) => ({ o, x: d.ob[o.id], block: blockReason(db, r, o, d.ob[o.id]), c: d.cs[o.caseId] }))
    .filter((z) => !q || (z.o.id + z.o.caseId + z.o.debtorName + z.c.patients).toLowerCase().includes(q.toLowerCase()))
    .filter((z) => z.x.outstanding !== 0 || z.block !== 'Nothing outstanding')
    .sort((a, b) => (a.block ? 1 : 0) - (b.block ? 1 : 0) || (a.o.dueDate || '9').localeCompare(b.o.dueDate || '9')), [db, d, q, receiptId]);
  const lines = rows.map((z) => ({ obId: z.o.id, amountCents: toCents(amts[z.o.id]), z })).filter((l) => l.amountCents);
  const bad = lines.some((l) => Number.isNaN(l.amountCents));
  const total = sum(lines.filter((l) => Number.isInteger(l.amountCents)), (l) => l.amountCents);
  const over = total > rc.available;
  const rowErr = (z) => { const c = toCents(amts[z.o.id]); if (c == null) return ''; if (Number.isNaN(c)) return 'Enter a valid amount'; if (c > z.x.outstanding) return `Exceeds outstanding ${fmtUSD(z.x.outstanding)}`; return ''; };
  const anyRowErr = rows.some((z) => rowErr(z));
  const autofill = () => { let left = rc.available; const n = {}; rows.filter((z) => !z.block).forEach((z) => { const a = Math.min(left, z.x.outstanding); if (a > 0) { n[z.o.id] = centsToInput(a); left -= a; } }); setAmts(n); };
  const save = () => { const x = act(A1.allocate, { receiptId, lines: lines.map((l) => ({ obId: l.obId, amountCents: l.amountCents })) }); if (x.ok) onClose(x); else setE(x.error); };
  return (
    <Modal title={`Allocate ${r.id}`} sub="Step 3 of 3: one receipt can be split across several cases and obligations" wide onClose={() => onClose()}
      footer={<><span className="muted sm" style={{ marginRight: 'auto' }}>Entered {fmtUSD(total, r.currency)} of {fmtUSD(rc.available, r.currency)} available</span><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn pri" disabled={!lines.length || bad || over || anyRowErr} onClick={save}>Allocate {fmtUSD(total, r.currency)}</button></>}>
      <KV items={[['Payer', r.payerName], ['Received by', r.recipient], ['Receipt amount', <Money c={r.amountCents} cur={r.currency} />], ['Already applied', <Money c={rc.allocated} cur={r.currency} />], ['Refunded (simulated)', <Money c={rc.refunded} cur={r.currency} />], ['Available to allocate', <Money c={rc.available} cur={r.currency} strong />]]} />
      {r.state !== 'Verified' ? <Callout tone="bad">This receipt is {r.state}. Only verified receipts can be allocated.</Callout> : null}
      <div className="row"><div style={{ flex: '1 1 220px' }}><input type="search" placeholder="Search case, debtor or obligation" aria-label="Search obligations" value={q} onChange={(x) => setQ(x.target.value)} /></div><button className="btn" onClick={autofill}>Fill oldest due first</button><button className="btn" onClick={() => setAmts({})}>Clear</button></div>
      <div className="tw" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
        <table><thead><tr><th>Obligation</th><th>Debtor</th><th>Due</th><th className="num">Outstanding</th><th>Allocate</th></tr></thead>
          <tbody>{rows.map((z) => (
            <tr key={z.o.id} className={z.block ? 'muted' : ''}>
              <td><span className="mono">{z.o.id}</span><div className="sub">{z.o.caseId} · {z.c.patients}</div></td>
              <td>{z.o.debtorName}<div className="sub">{z.o.debtorType}</div></td>
              <td>{z.o.dueDate ? fmtDate(z.o.dueDate) : z.o.trigger}</td>
              <td className="num"><Money c={z.x.outstanding} /></td>
              <td style={{ minWidth: 150 }}>{z.block ? <Badge tone="bad" title={z.block}>Blocked: {z.block.split(' (')[0]}</Badge> : <MoneyInput aria-label={'Amount for ' + z.o.id} value={amts[z.o.id] || ''} onChange={(v) => setAmts({ ...amts, [z.o.id]: v })} />}{rowErr(z) ? <div className="err sm" role="alert" style={{ color: 'var(--bad)' }}>{rowErr(z)}</div> : null}{z.block ? <div className="sub">{z.block}</div> : null}</td>
            </tr>))}</tbody></table>
        {!rows.length ? <Empty title="No obligations match" hint="Clear the search to see all obligations." /> : null}
      </div>
      {over ? <Callout tone="bad">Over-allocation blocked: {fmtUSD(total, r.currency)} entered, only {fmtUSD(rc.available, r.currency)} available.</Callout> : null}
      {total > 0 && !over && rc.available - total > 0 ? <Callout tone="info">{fmtUSD(rc.available - total, r.currency)} will remain unapplied and stay visible on the Receipts ledger.</Callout> : null}
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function ReverseDialog({ kind, id, onClose }) {
  const { act, db } = useApp(); const [reason, setReason] = useState(''); const [e, setE] = useState('');
  const isR = kind === 'receipt';
  const rec = isR ? db.receipts.find((x) => x.id === id) : db.allocations.find((x) => x.id === id);
  const save = () => { const x = act(isR ? A1.reverseReceipt : A1.reverseAllocation, { id, reason }); if (x.ok) onClose(); else setE(x.error); };
  return (
    <Modal title={`Reverse ${isR ? 'receipt' : 'allocation'} ${id}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn dng" onClick={save}>Reverse {isR ? 'receipt' : 'allocation'}</button></>}>
      <Callout tone="warn">This looks irreversible but is not deleted: a linked contra record is created, the original stays in history, balances reopen, and any financial closure on the case is reopened.</Callout>
      <KV items={isR ? [['Payer', rec.payerName], ['Amount', <Money c={rec.amountCents} cur={rec.currency} />], ['State', <StatusBadge s={rec.state} />]] : [['Receipt', rec.receiptId], ['Obligation', rec.obId], ['Amount', <Money c={rec.amountCents} />]]} />
      <Field label="Reason (required)"><textarea value={reason} onChange={(x) => setReason(x.target.value)} /></Field>
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function RefundDialog({ receiptId, onClose }) {
  const { act, db, d, actor } = useApp();
  const r = db.receipts.find((x) => x.id === receiptId); const rc = d.rc[receiptId];
  const [f, setF] = useState({ amt: centsToInput(rc.available), payee: r.payerName, method: 'ACH', reason: '' }); const [e, setE] = useState('');
  const save = () => { const c = toCents(f.amt); const x = act(A1.requestRefund, { receiptId, amountCents: c, payee: f.payee, method: f.method, reason: f.reason }); if (x.ok) onClose(); else setE(x.error); };
  return (
    <Modal title={`Request refund for ${r.id}`} sub="Controlled refund with approval preview. No payment is executed in this demo." onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Send for approval</button></>}>
      <KV items={[['Unapplied available', <Money c={rc.available} cur={r.currency} strong />], ['Requested by', actor]]} />
      <div className="form2">
        <Field label="Refund amount"><MoneyInput value={f.amt} onChange={(v) => setF({ ...f, amt: v })} /></Field>
        <Field label="Payee"><input type="text" value={f.payee} onChange={(x) => setF({ ...f, payee: x.target.value })} /></Field>
        <Field label="Method (simulated)"><Select value={f.method} onChange={(v) => setF({ ...f, method: v })} options={['ACH', 'Check', 'Wire']} /></Field>
      </div>
      <Field label="Reason"><textarea value={f.reason} onChange={(x) => setF({ ...f, reason: x.target.value })} /></Field>
      <div className="callout"><b>Approval preview</b><ol style={{ margin: '6px 0 0', paddingLeft: 18 }}><li>You submit the request. Receipt balance does not change yet.</li><li>A different approver reviews it in Tasks / Approvals.</li><li>On approval the unapplied amount drops by the refund and the audit trail records it.</li><li>No bank, card or payment system is contacted.</li></ol></div>
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}
