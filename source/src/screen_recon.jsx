import { fmtUSD, fmtStamp, fmtDate } from './util.js';
import * as A2 from './actions2.js';
import { useApp, Panel, Tabs, Badge, StatusBadge, Money, Modal, Field, Select, Callout, Empty, Btn, usePaged, Pager } from './ui_core.jsx';
const { useState } = React;

function ResolveDialog({ q, onClose }) {
  const { act, db } = useApp();
  const opts = q.state === 'Difference' ? [['accept', 'Accept the difference (post fee or rounding)']] : [['map', 'Map to a case'], ...(q.voided ? [['void', 'Confirm the void (no app impact)']] : []), ['dismiss', 'Dismiss (duplicate or not MFC business)']];
  const [f, setF] = useState({ resolution: opts[0][0], note: '', caseId: (q.mappedCaseIds || [])[0] || db.cases[0].id }); const [e, setE] = useState('');
  const save = () => { const r = act(A2.resolveItem, { qboId: q.id, ...f }); if (r.ok) onClose(); else setE(r.error); };
  return (
    <Modal title={`Resolve ${q.id}`} sub={q.reason} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Resolve</button></>}>
      <Field label="Resolution"><Select value={f.resolution} onChange={(v) => setF({ ...f, resolution: v })} options={opts} /></Field>
      {f.resolution === 'map' ? <Field label="Case" hint={q.mappedCaseIds.length > 1 ? 'Candidates: ' + q.mappedCaseIds.join(', ') : undefined}><Select value={f.caseId} onChange={(v) => setF({ ...f, caseId: v })} options={(q.mappedCaseIds.length > 1 ? q.mappedCaseIds : db.cases.map((c) => c.id))} /></Field> : null}
      <Field label="Resolution note (required)"><textarea value={f.note} onChange={(x) => setF({ ...f, note: x.target.value })} /></Field>
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

function MatchDialog({ q, onClose }) {
  const { act, db } = useApp();
  const cands = db.receipts.filter((r) => r.kind === 'receipt' && r.state === 'Verified' && !r.qboRef && r.recipient === q.company);
  const [rid, setRid] = useState(cands[0] ? cands[0].id : ''); const [e, setE] = useState('');
  const save = () => { const r = act(A2.matchQbo, { qboId: q.id, receiptId: rid }); if (r.ok) onClose(); else setE(r.error); };
  return (
    <Modal title={`Match ${q.id} to an app receipt`} sub={`${q.company} · ${fmtUSD(q.amountCents)} · ${q.memo}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!rid} onClick={save}>Match</button></>}>
      {cands.length ? <Field label="Verified, unlinked receipts"><Select value={rid} onChange={setRid} options={cands.map((r) => [r.id, `${r.id} · ${r.payerName} · ${fmtUSD(r.amountCents, r.currency)}`])} /></Field> : <Callout tone="warn">No verified, unlinked receipts for {q.company}. Record and verify the receipt first. An invoice is never matched as a receipt.</Callout>}
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export default function Recon({ params }) {
  const { db, d, act } = useApp();
  const [tab, setTab] = useState(params.tab || 'unmatched');
  const [dlg, setDlg] = useState(null);
  const b = d.k.recon;
  const appAmt = (q) => { const r = db.receipts.find((x) => x.id === q.matchedReceiptId); return r ? r.amountCents : null; };
  const qrow = (q, extra) => (
    <tr key={q.id}>
      <td>{q.company}</td>
      <td><span className="mono">{q.id}</span><div className="sub">{q.type}{q.type === 'Invoice' ? ' · invoice is not a receipt' : ''}{q.voided ? ' · voided in source' : ''}</div><div className="sub">{q.memo}</div></td>
      <td>{q.mappedCaseIds.length ? q.mappedCaseIds.join(', ') : <span className="muted">Unmapped</span>}{q.mappedCaseIds.length > 1 ? <div><Badge tone="warn">Ambiguous mapping</Badge></div> : null}</td>
      <td className="num"><Money c={q.amountCents} /></td>
      <td className="num">{q.matchedReceiptId ? <Money c={appAmt(q)} /> : '—'}</td>
      <td className="num">{q.differenceCents ? <Money c={q.differenceCents} /> : '—'}</td>
      <td style={{ maxWidth: 220 }}>{q.reason || (q.resolvedNote ? 'Resolved: ' + q.resolvedNote : '—')}{q.state === 'Resolved' || q.state === 'Matched' ? null : <div><StatusBadge s={q.state} /></div>}</td>
      <td>{q.owner}<div className="sub">Sync {q.lastSync}</div></td>
      <td>{extra}</td>
    </tr>);
  const head = <thead><tr><th>Co.</th><th>Transaction</th><th>Case mapping</th><th className="num">QBO amount</th><th className="num">App amount</th><th className="num">Difference</th><th>Reason / note</th><th>Owner</th><th>Actions</th></tr></thead>;
  const pgR = usePaged(b.resolved, 8);
  const lastRun = db.importRuns[0];
  return (
    <>
      <Callout tone="info"><b>Simulated QBO.</b> The records on this screen are fictional demo data standing in for QuickBooks Online. Nothing here connects to a live QBO company file.</Callout>
      <Panel title="Import simulation" actions={<Btn kind="pri" perm="importQBO" onClick={() => act(A2.importQBO, {})}>Run simulated import</Btn>}>
        <p style={{ margin: '0 0 8px' }}>{db.importBatch.label}: {db.importBatch.txns.length} records. It includes an ambiguous case mapping, a source record voided in QBO, and two replays of records already imported. Run it once to see the exceptions, then again to confirm a replay changes nothing.</p>
        {db.importRuns.length ? <div className="tw"><table><thead><tr><th>Run</th><th>When</th><th className="num">New</th><th className="num">Duplicates ignored</th><th>App balances</th></tr></thead><tbody>
          {db.importRuns.map((r) => <tr key={r.id}><td className="mono">{r.id}</td><td>{fmtStamp(r.at)}</td><td className="num">{r.added}</td><td className="num">{r.dup}</td><td>{r.unchanged ? <Badge tone="ok">Unchanged</Badge> : <Badge tone="warn">Changed</Badge>}</td></tr>)}
        </tbody></table></div> : <span className="muted sm">No simulated import has run yet.</span>}
      </Panel>
      <Panel flush>
        <Tabs label="Reconciliation views" value={tab} onChange={setTab} tabs={[['unmatched', 'Unmatched', b.unmatched.length + b.appOnly.length], ['suggested', 'Suggested matches', b.suggested.length], ['differences', 'Differences', b.differences.length], ['resolved', 'Resolved', b.resolved.length]]} />
        <div className="tw">
          {tab === 'unmatched' ? (b.unmatched.length || b.appOnly.length ? <table>{head}<tbody>
            {b.unmatched.map((q) => qrow(q, <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><Btn sm perm="reconcile" onClick={() => setDlg(['match', q.id])}>Match</Btn><Btn sm perm="reconcile" onClick={() => setDlg(['resolve', q.id])}>Resolve</Btn></div>))}
            {b.appOnly.map((r) => <tr key={r.id}><td>{r.recipient}</td><td><span className="mono">{r.id}</span><div className="sub">App receipt, verified, no QBO deposit linked</div><div className="sub">{r.payerName}</div></td><td>{r.caseHint || <span className="muted">—</span>}</td><td className="num">—</td><td className="num"><Money c={r.amountCents} cur={r.currency} /></td><td className="num">—</td><td>Not found in simulated QBO</td><td>Reconciliation Lead</td><td><Btn sm perm="reconcile" onClick={() => act(A2.postReceiptToQbo, { receiptId: r.id })}>Simulate QBO posting</Btn></td></tr>)}
          </tbody></table> : <Empty title="Nothing unmatched" hint="Every verified receipt and QBO deposit is linked." />) : null}
          {tab === 'suggested' ? (b.suggested.length ? <table>{head}<tbody>
            {b.suggested.map((s) => qrow(s.q, <div style={{ display: 'grid', gap: 6 }}>{s.cands.map((c) => <div key={c.r.id} className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><span className="sm"><span className="mono">{c.r.id}</span> {c.r.payerName} {fmtUSD(c.r.amountCents)} <Badge tone={c.exact ? 'ok' : 'warn'}>{c.exact ? 'Exact amount' : 'Near amount'}</Badge></span><Btn sm kind="pri" perm="reconcile" onClick={() => act(A2.matchQbo, { qboId: s.q.id, receiptId: c.r.id })}>Match</Btn><Btn sm perm="reconcile" onClick={() => act(A2.rejectMatch, { qboId: s.q.id, receiptId: c.r.id })}>Reject</Btn></div>)}</div>))}
          </tbody></table> : <Empty title="No suggested matches" hint="Suggestions appear when a QBO deposit has the same company and amount as a verified, unlinked app receipt. Record and verify a receipt to see one." />) : null}
          {tab === 'differences' ? (b.differences.length ? <table>{head}<tbody>
            {b.differences.map((q) => qrow(q, <Btn sm perm="reconcile" onClick={() => setDlg(['resolve', q.id])}>Resolve difference</Btn>))}
          </tbody></table> : <Empty title="No differences" hint="Matched amounts agree." />) : null}
          {tab === 'resolved' ? <><table>{head}<tbody>{pgR.items.map((q) => qrow(q, <StatusBadge s={q.state} />))}</tbody></table></> : null}
        </div>
        {tab === 'resolved' ? <Pager p={pgR} /> : null}
      </Panel>
      {dlg && dlg[0] === 'resolve' ? <ResolveDialog q={db.qbo.find((x) => x.id === dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'match' ? <MatchDialog q={db.qbo.find((x) => x.id === dlg[1])} onClose={() => setDlg(null)} /> : null}
    </>
  );
}
