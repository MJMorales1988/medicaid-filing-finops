// Case Financials workspace: header + Agreement / Obligations / Receipts-Allocations / Assets / Reconciliation.
import { fmtDate, fmtUSD, fmtStamp } from './util.js';
import { closureCheck } from './calc.js';
import * as A1 from './actions1.js';
import { POLICY_STAGES, DEAL_STAGES, CASE_STAGES } from './seed.js';
import { useApp, Panel, Badge, StatusBadge, Money, KV, Callout, Empty, Btn, Modal } from './ui_core.jsx';
import { AssignOwnerDialog, FollowUpDialog, OutcomeDialog, AdjustmentDialog, ReverseDialog, RecordReceiptDialog } from './dialogs.jsx';
const { useState } = React;

function ClosureDialog({ caseId, onClose }) {
  const { db, act } = useApp();
  const chk = closureCheck(db, caseId);
  const c = db.cases.find((x) => x.id === caseId);
  const go = () => { const r = act(A1.proposeClosure, { caseId }); if (r.ok) onClose(); };
  return (
    <Modal title={`Financial closure: ${caseId}`} sub="Closure needs zero balances and resolved reconciliation, then a second person's approval." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button><Btn kind="pri" perm="closeFinance" disabled={!chk.ok} onClick={go}>Propose closure</Btn></>}>
      {c.finClosed ? <Callout tone="ok">Already financially closed ({c.finClosedKind}). A reversal of any allocation reopens it automatically.</Callout> : chk.ok ? <Callout tone="ok">All conditions are met. Closure will go to the approval inbox.</Callout> : <Callout tone="warn"><b>Closure is blocked:</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{chk.blockers.map((b) => <li key={b}>{b}</li>)}</ul></Callout>}
    </Modal>
  );
}

export function FinancialHeader({ c, cs }) {
  const { db, d, go } = useApp();
  const [dlg, setDlg] = useState(null);
  const pendingClose = db.approvals.some((a) => a.kind === 'Closure' && a.status === 'Pending' && a.refId === c.id);
  return (
    <>
      <div className="chead">
        <div><div className="k muted sm">Agreed fee</div><div className="v">{cs.agreed == null ? <span className="unk">Unknown</span> : fmtUSD(cs.agreed)}</div></div>
        <div><div className="k muted sm">Client fulfillment</div><div className="v"><StatusBadge s={cs.client} /></div><div className="sub muted sm">Not the same as MFC cash</div></div>
        <div><div className="k muted sm">Verified MFC cash</div><div className="v">{fmtUSD(cs.mfcCash)}</div></div>
        <div><div className="k muted sm">MFC outstanding</div><div className="v">{fmtUSD(cs.outstanding)}</div><div className="sub muted sm">{fmtUSD(cs.collectible)} collectible · {fmtUSD(cs.conditional)} conditional</div></div>
        <div><div className="k muted sm">Financial owner</div><div className="v" style={{ fontSize: 14 }}>{c.financialOwner}</div></div>
        <div><div className="k muted sm">Next action</div><div className="v" style={{ fontSize: 14 }}>{cs.next}</div></div>
        <div><div className="k muted sm">Financial status</div><div className="v"><StatusBadge s={cs.fin} /></div><div className="sub muted sm">Operational: {c.opStatus}</div></div>
        <div className="row" style={{ alignSelf: 'end' }}>
          <Btn sm perm="recordReceipt" onClick={() => setDlg('rec')}>Record receipt</Btn>
          <Btn sm perm="closeFinance" onClick={() => setDlg('close')}>{pendingClose ? 'Closure pending' : c.finClosed ? 'Closure status' : 'Financial closure'}</Btn>
        </div>
      </div>
      {dlg === 'close' ? <ClosureDialog caseId={c.id} onClose={() => setDlg(null)} /> : null}
      {dlg === 'rec' ? <RecordReceiptDialog preset={{ caseId: c.id, payerName: (db.obligations.find((o) => o.caseId === c.id) || {}).debtorName || '' }} onClose={() => setDlg(null)} /> : null}
    </>
  );
}

function AgreementPanel({ c }) {
  const { db, go, doc } = useApp();
  const ags = db.agreements.filter((a) => a.caseId === c.id);
  if (!ags.length) return <Empty title="No agreement on file" hint="Create a draft in Agreements so this case is accounted for." />;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {ags.map((a) => {
        const v = a.versions.find((x) => x.v === (a.verifiedVersion || a.currentVersion));
        return (
          <div key={a.id} className="panel" style={{ boxShadow: 'none' }}>
            <header><h3><span className="mono">{a.id}</span> · {a.type} · v{v.v}</h3><div className="row"><StatusBadge s={a.status} />{a.pending ? <Badge tone="warn">Amendment v{a.pending} pending review</Badge> : null}<button className="btn sm" onClick={() => go('agreements', { id: a.id })}>Open agreement</button></div></header>
            <div className="body" style={{ display: 'grid', gap: 12 }}>
              {a.status !== 'Verified' ? <Callout tone="bad"><b>Signed but not verified.</b> Fee shows Unknown and is excluded from confirmed totals. {v.unknownReason}</Callout> : null}
              <KV items={[['Signed date', fmtDate(v.signedDate)], ['Parties', v.parties.join(', ') || <span className="unk">Unknown</span>], ['Gross fee', <Money c={v.grossFeeCents} />], ['Legal fees', <Money c={v.legalFeeCents} />], ['Verified by', v.verifiedBy || '—'], ['Signed EA', v.docId ? <a href="#" onClick={(e) => { e.preventDefault(); doc(v.docId); }}>Preview {v.docId}</a> : <span className="unk">Missing</span>]]} />
              <div className="tw"><table><thead><tr><th>Component</th><th>Owed by</th><th className="num">Amount</th><th>Due / trigger</th><th>Creates obligation</th></tr></thead><tbody>
                {v.components.map((x) => <tr key={x.id}><td>{x.label}<div className="sub">{x.kind}</div></td><td>{x.debtorName || '—'}<div className="sub">{x.debtorType}</div></td><td className="num"><Money c={x.amountCents} /></td><td>{x.trigger === 'Due date' ? fmtDate(x.dueDate) : x.trigger}</td><td>{x.createsAt === 'verify' ? 'At verification' : x.createsAt === 'ownership' ? 'On ownership confirmation' : 'No (pass-through or deduction)'}{db.obligations.find((o) => o.compId === x.id) ? <div className="sub">{db.obligations.find((o) => o.compId === x.id).id}</div> : null}</td></tr>)}
              </tbody></table></div>
            </div>
          </div>);
      })}
    </div>
  );
}

function ObligationsPanel({ c, focus }) {
  const { db, d, act } = useApp();
  const [dlg, setDlg] = useState(null);
  const obs = db.obligations.filter((o) => o.caseId === c.id);
  const fe = db.fulfillment.filter((f) => f.caseId === c.id);
  const ob = (id) => db.obligations.find((o) => o.id === id);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!obs.length ? <Empty title="No obligations yet" hint="Obligations are created once, when an agreement is verified or a configured trigger occurs." /> : null}
      {obs.map((o) => {
        const x = d.ob[o.id]; const adjs = db.adjustments.filter((a) => a.obId === o.id);
        return (
          <div key={o.id} className="panel" style={{ boxShadow: 'none', borderColor: focus === o.id ? 'var(--accent)' : undefined }}>
            <header><h3><span className="mono">{o.id}</span> · {o.debtorName} owes {o.creditor}</h3><div className="row"><StatusBadge s={x.status} />{o.disputed ? <Badge tone="warn">Disputed</Badge> : null}{x.daysPastDue > 0 ? <Badge tone="bad">{x.daysPastDue}d past due</Badge> : null}</div></header>
            <div className="body" style={{ display: 'grid', gap: 10 }}>
              <div className="tw"><table><tbody>
                <tr><td>Principal</td><td className="num"><Money c={o.principalCents} /></td><td className="muted sm">{o.category} · {o.debtorType}</td></tr>
                <tr><td>+ Approved debits</td><td className="num"><Money c={x.debits} /></td><td /></tr>
                <tr><td>− Approved credits (deductions)</td><td className="num"><Money c={x.credits} /></td><td /></tr>
                <tr><td>− Approved write-offs</td><td className="num"><Money c={x.writeoffs} /></td><td className="muted sm">{x.writeoffs > 0 ? 'Adjusted closure, not cash collected' : ''}</td></tr>
                <tr><td><b>Adjusted obligation</b></td><td className="num"><Money c={x.adjusted} strong /></td><td /></tr>
                <tr><td>− Applied verified cash</td><td className="num"><Money c={x.cash} /></td><td /></tr>
                <tr><td>− Approved noncash settlements</td><td className="num"><Money c={x.noncash} /></td><td /></tr>
                <tr><td><b>Outstanding</b></td><td className="num"><Money c={x.outstanding} strong /></td><td className="muted sm">{o.triggerState === 'Awaiting' ? `Conditional: ${o.trigger}${o.reviewDate ? '; review ' + fmtDate(o.reviewDate) : ''}` : 'Due ' + fmtDate(o.dueDate) + ' · ' + o.trigger}</td></tr>
              </tbody></table></div>
              {o.collateral ? <Callout tone="info"><b>Collateral pledge:</b> {o.collateral.desc}. This is security for the obligation. It is not payment and does not reduce the balance.</Callout> : null}
              {adjs.length ? <div><div className="muted sm" style={{ marginBottom: 4 }}>Adjustments</div>{adjs.map((a) => <div key={a.id} className="row sm" style={{ padding: '3px 0' }}><span className="mono">{a.id}</span> {a.kind === 'Writeoff' ? 'Write-off' : a.kind} {fmtUSD(a.amountCents)} <StatusBadge s={a.status} />{a.status === 'Pending' ? <span className="muted">Pending approval: no effect on the balance yet</span> : <span className="muted">{a.reason}</span>}</div>)}</div> : null}
              {o.followUps.length || o.outcomes.length ? <div className="sm muted">{o.followUps.map((f) => `Follow-up ${fmtDate(f.date)} (${f.owner}): ${f.note}`).join(' · ')}{o.outcomes.length ? ' · Last outcome: ' + o.outcomes[o.outcomes.length - 1].outcome : ''}</div> : null}
              <div className="row">
                <Btn sm perm="assignOwner" onClick={() => setDlg(['owner', o.id])}>Owner: {o.owner}</Btn>
                <Btn sm perm="followUp" onClick={() => setDlg(['follow', o.id])}>Schedule follow-up</Btn>
                <Btn sm perm="followUp" onClick={() => setDlg(['outcome', o.id])}>Record outcome</Btn>
                <Btn sm perm="proposeAdjustment" disabled={x.outstanding === 0 || x.pend.length > 0} title={x.pend.length ? 'An adjustment is already pending' : undefined} onClick={() => setDlg(['adj', o.id])}>Propose adjustment</Btn>
                <Btn sm perm="followUp" onClick={() => act(A1.setDispute, { obId: o.id, disputed: !o.disputed })}>{o.disputed ? 'Resolve dispute' : 'Mark disputed'}</Btn>
              </div>
            </div>
          </div>);
      })}
      <Panel title="Client fulfillment events (never MFC cash on their own)" flush>
        {fe.length ? <div className="tw"><table><thead><tr><th>Event</th><th className="num">Component value</th><th>Date</th><th>Evidence</th></tr></thead><tbody>
          {fe.map((f) => <tr key={f.id}><td>{f.kind}<div className="sub mono">{f.id}</div></td><td className="num"><Money c={f.amountCents} /></td><td>{fmtDate(f.date)}</td><td>{f.evidence}</td></tr>)}
        </tbody></table></div> : <Empty title="No fulfillment events yet" hint="Examples: client paid attorney, policy ownership transferred, property closing verified." />}
      </Panel>
      {dlg && dlg[0] === 'owner' ? <AssignOwnerDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'follow' ? <FollowUpDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'outcome' ? <OutcomeDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'adj' ? <AdjustmentDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
    </div>
  );
}

function ReceiptsPanel({ c }) {
  const { db, d, go } = useApp();
  const [dlg, setDlg] = useState(null);
  const obIds = db.obligations.filter((o) => o.caseId === c.id).map((o) => o.id);
  const al = db.allocations.filter((a) => obIds.includes(a.obId));
  const hint = db.receipts.filter((r) => r.kind === 'receipt' && !al.some((a) => a.receiptId === r.id) && (r.caseHint === c.id || (r.state === 'Reported' && db.obligations.some((o) => o.caseId === c.id && o.debtorName === r.payerName))));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Panel title="Allocations to this case" flush>
        {al.length ? <div className="tw"><table><thead><tr><th>Allocation</th><th>Receipt</th><th>Payer</th><th>Obligation</th><th className="num">Amount</th><th>Receipt state</th><th>Status</th><th /></tr></thead><tbody>
          {al.map((a) => { const r = db.receipts.find((x) => x.id === a.receiptId); return (
            <tr key={a.id} className={a.status !== 'Active' ? 'muted' : ''}><td className="mono">{a.id}{a.reversalOf ? <div className="sub">contra of {a.reversalOf}</div> : null}</td><td className="mono">{a.receiptId}</td><td>{r.payerName}<div className="sub">received by {r.recipient}</div></td><td className="mono">{a.obId}</td><td className="num"><Money c={a.amountCents} /></td><td><StatusBadge s={r.state} /></td><td><StatusBadge s={a.status === 'Active' ? 'Active' : a.status} /></td>
              <td>{a.status === 'Active' ? <Btn sm perm="reverse" onClick={() => setDlg(a.id)}>Reverse</Btn> : null}</td></tr>); })}
        </tbody></table></div> : <Empty title="No cash allocated yet" hint="Record, verify and allocate a receipt to reduce the outstanding balance." />}
      </Panel>
      {hint.length ? <Panel title="Related receipts not yet applied" flush><div className="tw"><table><tbody>{hint.map((r) => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.payerName}<div className="sub">{r.method} · {r.reference}</div></td><td className="num"><Money c={r.amountCents} cur={r.currency} /></td><td><StatusBadge s={r.state} /></td><td><button className="btn sm" onClick={() => go('receipts', { focus: r.id })}>Open in ledger</button></td></tr>)}</tbody></table></div><div className="body muted sm">Reported receipts are not verified cash and do not reduce the balance.</div></Panel> : null}
      {dlg ? <ReverseDialog kind="allocation" id={dlg} onClose={() => setDlg(null)} /> : null}
    </div>
  );
}

function AssetsPanel({ c }) {
  const { db, go } = useApp();
  const pols = db.policies.filter((p) => p.caseId === c.id); const deals = db.deals.filter((x) => x.caseId === c.id);
  if (!pols.length && !deals.length) return <Empty title="No linked assets" hint="Policies (Policy Solutions) and properties (Simply Sold) linked to this case appear here." />;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {pols.map((p) => <Panel key={p.id} title={`${p.id} · policy ${p.policyNo}`} actions={<button className="btn sm" onClick={() => go('ps', { id: p.id })}>Open in Policy Solutions</button>}>
        <KV items={[['Stage', POLICY_STAGES.find((s) => s[0] === p.stage)[1]], ['Face value', <Money c={p.faceCents} />], ['Cash value', <Money c={p.cashValueCents} />], ['Agreed exchange value', <Money c={p.exchangeValueCents} />], ['Cash purchase (paid to client)', <Money c={p.cashPurchaseCents} />], ['Ownership evidence', <StatusBadge s={p.evidence.ownership.status} />]]} />
        <p className="muted sm" style={{ margin: '10px 0 0' }}>Face and cash value describe the policy. They are not MFC receivables. Only the agreed exchange value can create a PS-to-MFC obligation, and ownership confirmation never creates MFC cash.</p></Panel>)}
      {deals.map((s) => <Panel key={s.id} title={`${s.id} · ${s.property.address}`} actions={<button className="btn sm" onClick={() => go('ss', { id: s.id })}>Open in Simply Sold</button>}>
        <KV items={[['Stage', DEAL_STAGES.find((x) => x[0] === s.stage)[1]], ['Property value', <Money c={s.property.valueCents} />], ['MFC entitlement', <Money c={s.entitlementCents} />], ['Closing', s.closingVerified ? 'Verified ' + fmtDate(s.closingDate) : 'Not yet verified'], ['Proceeds recipient', s.proceedsRecipient]]} />
        <p className="muted sm" style={{ margin: '10px 0 0' }}>Property value is shown for context only. MFC is entitled to the agreed amount, and nothing is settled until proceeds are received and reconciled.</p></Panel>)}
    </div>
  );
}

function ReconPanel({ c, cs }) {
  const { db, go } = useApp();
  const obIds = db.obligations.filter((o) => o.caseId === c.id).map((o) => o.id);
  const rows = db.qbo.filter((q) => q.mappedCaseIds.includes(c.id) || (q.obId && obIds.includes(q.obId)) || db.allocations.some((a) => obIds.includes(a.obId) && a.status === 'Active' && db.receipts.find((r) => r.id === a.receiptId).qboRef === q.id));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {cs.recon.ok ? <Callout tone="ok"><b>Reconciliation resolved.</b> Every allocated receipt is matched to a simulated QBO deposit and nothing is open for this case.</Callout> : <Callout tone="warn"><b>Reconciliation open.</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{cs.recon.issues.map((i) => <li key={i}>{i}</li>)}</ul></Callout>}
      <Panel title="Simulated QBO records for this case" actions={<button className="btn sm" onClick={() => go('recon', {})}>Open reconciliation</button>} flush>
        {rows.length ? <div className="tw"><table><thead><tr><th>QBO ID</th><th>Type</th><th className="num">Amount</th><th>App link</th><th>State</th></tr></thead><tbody>
          {rows.map((q) => <tr key={q.id}><td className="mono">{q.id}</td><td>{q.type}{q.type === 'Invoice' ? <div className="sub">Invoice is not a receipt</div> : null}</td><td className="num"><Money c={q.amountCents} /></td><td>{q.matchedReceiptId || q.obId || q.adjId || '—'}</td><td><StatusBadge s={q.state} />{q.reason ? <div className="sub">{q.reason}</div> : null}</td></tr>)}
        </tbody></table></div> : <Empty title="No QBO records mapped" />}
      </Panel>
    </div>
  );
}

export default function Financials({ c, focus }) {
  const { d } = useApp();
  const cs = d.cs[c.id];
  const [sub, setSub] = useState(focus ? 'obl' : 'ag');
  const subs = [['ag', 'Agreement'], ['obl', 'Obligations'], ['rc', 'Receipts / Allocations'], ['as', 'Assets'], ['rec', 'Reconciliation']];
  return (
    <section className="panel">
      <FinancialHeader c={c} cs={cs} />
      <div className="sub-tabs" role="group" aria-label="Financial subpanels">{subs.map(([k, l]) => <button key={k} aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>)}</div>
      <div className="body">
        {sub === 'ag' ? <AgreementPanel c={c} /> : sub === 'obl' ? <ObligationsPanel c={c} focus={focus} /> : sub === 'rc' ? <ReceiptsPanel c={c} /> : sub === 'as' ? <AssetsPanel c={c} /> : <ReconPanel c={c} cs={cs} />}
      </div>
    </section>
  );
}
