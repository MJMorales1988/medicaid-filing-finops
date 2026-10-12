import * as A1 from './actions1.js';
import * as A2 from './actions2.js';
import { useApp, Badge } from './ui_core.jsx';
const { useState } = React;

const rcByRef = (db, ref) => db.receipts.find((r) => r.reference === ref && r.kind === 'receipt');
const obFor = (db, comp) => db.obligations.find((o) => o.compId === comp);

export const WALKS = [
  {
    id: 'w1', title: 'Attorney partial collection to financial closure',
    intro: 'Jordan Reed paid Harbor Law $12,000. Harbor Law kept a $600 approved legal fee and remitted $6,000, so $5,400 is outstanding and overdue.',
    steps: [
      { t: 'Review the partial collection', d: 'Case CS-1002 shows the client as fulfilled but MFC cash at $6,000 with $5,400 overdue.', show: (g) => g.go('cases', { caseId: 'CS-1002', tab: 'financials', ob: 'OB-3002' }), done: (db) => db.allocations.some((a) => a.id === 'AL-5002' && a.status === 'Active') },
      { t: 'Record the final $5,400 receipt', d: 'Harbor Law wires the remaining balance. It is recorded as Reported, so it does not count as cash yet.', show: (g) => g.go('receipts', {}), as: ['Accounting Lead', 'Accounting'], run: (g) => g.runAs('Accounting Lead', 'Accounting', A1.recordReceipt, { payerName: 'Harbor Law', payerType: 'Attorney', recipient: 'MFC', receivedDate: '2026-10-12', amountCents: 540000, method: 'Wire', reference: 'WIRE-HL-0219', caseId: 'CS-1002', memo: 'Final attorney remittance' }), done: (db) => !!rcByRef(db, 'WIRE-HL-0219') },
      { t: 'Verify the receipt', d: 'Evidence and a deposit date turn it into verified MFC cash.', show: (g) => g.go('receipts', { focus: 'x' }), as: ['Accounting Lead', 'Accounting'], run: (g, db) => g.runAs('Accounting Lead', 'Accounting', A1.verifyReceipt, { id: rcByRef(db, 'WIRE-HL-0219').id, evidence: 'Bank advice WIRE-HL-0219', depositedDate: '2026-10-12' }), need: (db) => !!rcByRef(db, 'WIRE-HL-0219'), done: (db) => { const r = rcByRef(db, 'WIRE-HL-0219'); return !!r && r.state === 'Verified'; } },
      { t: 'Allocate it to OB-3002', d: 'The full $5,400 is applied to the attorney remittance obligation. The balance drops to $0.', show: (g, db) => { const r = rcByRef(db, 'WIRE-HL-0219'); g.go('receipts', r ? { allocate: r.id } : {}); }, as: ['Accounting Lead', 'Accounting'], run: (g, db) => g.runAs('Accounting Lead', 'Accounting', A1.allocate, { receiptId: rcByRef(db, 'WIRE-HL-0219').id, lines: [{ obId: 'OB-3002', amountCents: 540000 }] }), need: (db) => { const r = rcByRef(db, 'WIRE-HL-0219'); return !!r && r.state === 'Verified'; }, done: (db) => db.allocations.some((a) => a.obId === 'OB-3002' && a.status === 'Active' && a.amountCents === 540000) },
      { t: 'Reconcile against simulated QBO', d: 'QBO deposit QBO-DEP-8841 is suggested for this receipt. Matching resolves the exception.', show: (g) => g.go('recon', { tab: 'suggested' }), as: ['Reconciliation Lead', 'Accounting'], run: (g, db) => g.runAs('Reconciliation Lead', 'Accounting', A2.matchQbo, { qboId: 'QBO-DEP-8841', receiptId: rcByRef(db, 'WIRE-HL-0219').id }), need: (db) => db.allocations.some((a) => a.obId === 'OB-3002' && a.amountCents === 540000 && a.status === 'Active'), done: (db) => db.qbo.find((q) => q.id === 'QBO-DEP-8841').state === 'Matched' },
      { t: 'Propose financial closure', d: 'Zero balance and resolved reconciliation allow Accounting to propose closure.', show: (g) => g.go('cases', { caseId: 'CS-1002', tab: 'financials' }), as: ['Accounting Lead', 'Accounting'], run: (g) => g.runAs('Accounting Lead', 'Accounting', A1.proposeClosure, { caseId: 'CS-1002' }), need: (db) => db.qbo.find((q) => q.id === 'QBO-DEP-8841').state === 'Matched', done: (db) => db.approvals.some((a) => a.kind === 'Closure' && a.refId === 'CS-1002') },
      { t: 'CEO approves the closure', d: 'A different person approves. The case becomes financially closed. Reversing the receipt later would reopen it.', show: (g) => g.go('tasks', { tab: 'approvals' }), as: ['Dana Whitfield', 'CEO'], run: (g, db) => g.runAs('Dana Whitfield', 'CEO', A1.decideApproval, { id: db.approvals.find((a) => a.kind === 'Closure' && a.refId === 'CS-1002' && a.status === 'Pending').id, decision: 'Approve' }), need: (db) => db.approvals.some((a) => a.kind === 'Closure' && a.refId === 'CS-1002'), done: (db) => db.cases.find((c) => c.id === 'CS-1002').finClosed },
    ],
  },
  {
    id: 'w2', title: 'Policy transfer to PS obligation to remittance',
    intro: 'Wren Ashby agreed to exchange a policy worth $6,500. Ownership confirmation fulfills the client side but creates no MFC cash.',
    steps: [
      { t: 'Confirm policy ownership', d: 'Evidence is recorded on POL-7002. The client component is fulfilled and a separate PS-to-MFC obligation of $6,500 is created. MFC cash stays $0.', show: (g) => g.go('ps', { id: 'POL-7002' }), as: ['Policy Coordinator', 'Policy Coordinator'], run: (g) => g.runAs('Policy Coordinator', 'Policy Coordinator', A2.confirmOwnership, { id: 'POL-7002', evidence: 'Recorded ownership assignment CM-DEMO-0442' }), done: (db) => db.policies.find((p) => p.id === 'POL-7002').evidence.ownership.status === 'Verified' },
      { t: 'See the PS obligation in Collections', d: 'It appears under PS/SS Due, owed by Policy Solutions to MFC, with no cash applied.', show: (g) => g.go('collections', { tab: 'psss' }), done: (db) => !!obFor(db, 'CP-2013-1') },
      { t: 'Record the PS remittance', d: 'Policy Solutions pays MFC $6,500. This is an internal transfer, so it counts as MFC cash but not as new group-wide cash.', show: (g) => g.go('receipts', {}), as: ['Accounting Lead', 'Accounting'], run: (g) => g.runAs('Accounting Lead', 'Accounting', A1.recordReceipt, { payerName: 'Policy Solutions (PS)', payerType: 'Policy Solutions', recipient: 'MFC', receivedDate: '2026-10-13', amountCents: 650000, method: 'ACH', reference: 'ACH-PS-1013', caseId: 'CS-1013' }), need: (db) => !!obFor(db, 'CP-2013-1'), done: (db) => !!rcByRef(db, 'ACH-PS-1013') },
      { t: 'Verify the remittance', d: 'Bank evidence verifies it.', show: (g) => g.go('receipts', {}), as: ['Accounting Lead', 'Accounting'], run: (g, db) => g.runAs('Accounting Lead', 'Accounting', A1.verifyReceipt, { id: rcByRef(db, 'ACH-PS-1013').id, evidence: 'Bank advice ACH-PS-1013', depositedDate: '2026-10-13' }), need: (db) => !!rcByRef(db, 'ACH-PS-1013'), done: (db) => { const r = rcByRef(db, 'ACH-PS-1013'); return !!r && r.state === 'Verified'; } },
      { t: 'Allocate to the PS obligation', d: 'The obligation drops to $0 and MFC cash rises by $6,500.', show: (g, db) => { const r = rcByRef(db, 'ACH-PS-1013'); g.go('receipts', r ? { allocate: r.id } : {}); }, as: ['Accounting Lead', 'Accounting'], run: (g, db) => g.runAs('Accounting Lead', 'Accounting', A1.allocate, { receiptId: rcByRef(db, 'ACH-PS-1013').id, lines: [{ obId: obFor(db, 'CP-2013-1').id, amountCents: 650000 }] }), need: (db) => { const r = rcByRef(db, 'ACH-PS-1013'); return !!r && r.state === 'Verified'; }, done: (db) => { const o = obFor(db, 'CP-2013-1'); return !!o && db.allocations.some((a) => a.obId === o.id && a.status === 'Active'); } },
      { t: 'Check the Overview totals', d: 'Verified MFC cash includes the remittance. The company-wide panel lists it as an internal transfer, not new external cash.', show: (g) => g.go('overview', {}), done: (db) => { const o = obFor(db, 'CP-2013-1'); return !!o && db.allocations.some((a) => a.obId === o.id && a.status === 'Active'); } },
    ],
  },
];

export default function Guide({ onClose }) {
  const g = useApp(); const { db } = g;
  const [wid, setWid] = useState('w1');
  const w = WALKS.find((x) => x.id === wid);
  const states = w.steps.map((s) => s.done(db));
  const cur = states.findIndex((x) => !x);
  return (
    <aside className="panel guide" aria-label="Guided demo">
      <header><h2>Guided demo</h2><button className="btn sm" onClick={onClose}>Hide</button></header>
      <div className="body" style={{ overflowY: 'auto' }}>
        <div className="row" style={{ marginBottom: 8 }}>{WALKS.map((x, i) => <button key={x.id} className="btn sm" style={x.id === wid ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : null} onClick={() => setWid(x.id)}>Walkthrough {i + 1}</button>)}</div>
        <b>{w.title}</b>
        <p className="muted sm" style={{ margin: '4px 0 8px' }}>{w.intro}</p>
        {w.steps.map((s, i) => {
          const done = states[i]; const isCur = i === cur; const ready = !s.need || s.need(db);
          return (
            <div key={i} className={'step' + (done ? ' done' : isCur ? ' cur' : '')}>
              <span className="dot" aria-hidden="true">{done ? '✓' : i + 1}</span>
              <div><b>{s.t}</b> {done ? <Badge tone="ok">Done</Badge> : null}
                <div className="muted">{s.d}</div>
                <div className="row" style={{ marginTop: 4 }}>
                  <button className="btn sm" onClick={() => s.show(g, db)}>Show me</button>
                  {s.run && !done ? <button className="btn sm pri" disabled={!ready} title={ready ? `Runs as ${s.as[0]}` : 'Finish the earlier step first'} onClick={() => s.run(g, db)}>Do this step as {s.as[0]}</button> : null}
                </div></div>
            </div>);
        })}
        {cur === -1 ? <div className="callout ok" style={{ marginTop: 10 }}>Walkthrough complete. Use Reset demo to run it again.</div> : null}
      </div>
    </aside>
  );
}
