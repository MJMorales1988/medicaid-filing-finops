import { fmtDate, fmtUSD, fmtStamp, TODAY, toCSV, centsCsv, toCents, sum } from './util.js';
import { OWNERS, ROLES, PERM_LABELS } from './seed.js';
import * as A1 from './actions1.js';
import * as A2 from './actions2.js';
import { collectionRows } from './calc.js';
import { useApp, Panel, Tabs, Badge, StatusBadge, Money, Modal, Field, Select, Callout, Empty, Btn, CaseLink, KV, usePaged, Pager } from './ui_core.jsx';
const { useState, useMemo } = React;

function NoteDialog({ title, label, required, onSubmit, onClose, tone }) {
  const [t, setT] = useState(''); const [e, setE] = useState('');
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={'btn ' + (tone || 'pri')} onClick={() => { const r = onSubmit(t); if (r.ok) onClose(); else setE(r.error); }}>Submit</button></>}>
      <Field label={label + (required ? ' (required)' : '')}><textarea value={t} onChange={(x) => setT(x.target.value)} /></Field>
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

export function Tasks({ params }) {
  const { db, act, actor, go, role } = useApp();
  const [tab, setTab] = useState(params.tab || 'tasks');
  const [f, setF] = useState({ owner: '', status: 'Open' });
  const [dlg, setDlg] = useState(null); const [nt, setNt] = useState({ title: '', due: '2026-10-20', owner: actor, caseId: '' });
  const tasks = db.tasks.filter((t) => (!f.owner || t.owner === f.owner) && (!f.status || t.status === f.status)).sort((a, b) => a.due.localeCompare(b.due));
  const pend = db.approvals.filter((a) => a.status === 'Pending'); const hist = db.approvals.filter((a) => a.status !== 'Pending');
  const link = (t) => t.caseId ? <CaseLink id={t.caseId} /> : '—';
  const card = (a) => (
    <div key={a.id} className="panel" style={{ boxShadow: 'none' }}>
      <header><h3>{a.kind} <span className="mono muted">{a.id}</span></h3><div className="row"><StatusBadge s={a.status} />{a.amountCents ? <b className="num">{fmtUSD(a.amountCents)}</b> : null}</div></header>
      <div className="body" style={{ display: 'grid', gap: 8 }}>
        <div>{a.summary}</div>
        <div className="muted sm">Proposed by {a.proposedBy} · {fmtStamp(a.proposedAt)}{a.caseId ? ' · ' : ''}{a.caseId ? <CaseLink id={a.caseId} /> : null}</div>
        {a.note ? <div className="sm">Note: {a.note}</div> : null}
        {a.status === 'Pending' ? <><Callout tone="warn"><b>Pending approval.</b> No financial effect yet: balances and cash are unchanged until a different approver approves.</Callout>
          {a.proposedBy === actor ? <Callout tone="info">You proposed this, so you cannot approve it. Switch to another role (for example CEO).</Callout> : null}
          <div className="row"><Btn kind="pri" perm="approve" disabled={a.proposedBy === actor} title={a.proposedBy === actor ? 'You proposed this item' : undefined} onClick={() => act(A1.decideApproval, { id: a.id, decision: 'Approve' })}>Approve</Btn><Btn kind="dng" perm="approve" onClick={() => setDlg(a.id)}>Reject</Btn></div></> : <Callout tone={a.status === 'Approved' ? 'ok' : 'info'}><b>{a.status} by {a.decidedBy}</b> · {fmtStamp(a.decidedAt)}. {a.effect}</Callout>}
      </div>
    </div>);
  return (
    <>
      <Panel flush>
        <Tabs label="Work queues" value={tab} onChange={setTab} tabs={[['tasks', 'Task queue', db.tasks.filter((t) => t.status === 'Open').length], ['approvals', 'Approval inbox', pend.length], ['history', 'Approval history', hist.length]]} />
        {tab === 'tasks' ? <>
          <div className="filters">
            <label className="field"><span className="lab">Owner</span><Select value={f.owner} onChange={(v) => setF({ ...f, owner: v })} options={[['', 'Everyone']].concat(OWNERS)} /></label>
            <label className="field"><span className="lab">Status</span><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['', 'Any'], 'Open', 'Done']} /></label>
            <div className="row" style={{ alignItems: 'flex-end' }}><button className="btn sm" onClick={() => setF({ owner: actor, status: 'Open' })}>Show mine ({actor})</button></div>
          </div>
          <div className="tw"><table><thead><tr><th>Task</th><th>Record</th><th>Owner</th><th>Due</th><th>Status</th><th>Outcome</th><th>Actions</th></tr></thead><tbody>
            {tasks.map((t) => { const late = t.status === 'Open' && t.due < TODAY; return <tr key={t.id}>
              <td>{t.title}<div className="sub mono">{t.id} · {t.kind}</div></td><td>{link(t)}{t.obId ? <div className="sub mono">{t.obId}</div> : null}</td><td>{t.owner}{t.escalated ? <div><Badge tone="warn">Escalated</Badge></div> : null}</td>
              <td>{fmtDate(t.due)}{late ? <div><Badge tone="bad">Overdue</Badge></div> : null}</td><td><StatusBadge s={t.status} /></td><td className="sm">{t.outcome || '—'}</td>
              <td>{t.status === 'Open' ? <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><Btn sm perm="manageTasks" onClick={() => setDlg('done:' + t.id)}>Complete</Btn><Btn sm perm="manageTasks" disabled={t.escalated} onClick={() => act(A1.escalateTask, { id: t.id })}>Escalate</Btn></div> : null}</td></tr>; })}
          </tbody></table>{!tasks.length ? <Empty title="No tasks match" hint="Change the owner or status filter." /> : null}</div>
          <div className="body" style={{ borderTop: '1px solid var(--line2)' }}><div className="row">
            <input type="text" aria-label="New task title" placeholder="New task" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} style={{ flex: '1 1 260px' }} />
            <Select aria-label="Task owner" value={nt.owner} onChange={(v) => setNt({ ...nt, owner: v })} options={OWNERS} style={{ width: 'auto' }} />
            <input type="date" aria-label="Due date" value={nt.due} onChange={(e) => setNt({ ...nt, due: e.target.value })} style={{ width: 'auto' }} />
            <Btn perm="manageTasks" onClick={() => { const r = act(A1.addTask, nt); if (r.ok) setNt({ ...nt, title: '' }); }}>Add task</Btn></div></div>
        </> : null}
        {tab === 'approvals' ? <div className="body" style={{ display: 'grid', gap: 12 }}>
          <Callout tone="info">Deductions, write-offs, refunds and financial closures need a second person. Acting as <b>{actor}</b> ({role}).</Callout>
          {pend.length ? pend.map(card) : <Empty title="Inbox is clear" hint="Nothing is waiting for approval." />}</div> : null}
        {tab === 'history' ? <div className="body" style={{ display: 'grid', gap: 12 }}>{hist.length ? hist.map(card) : <Empty title="No decisions yet" />}</div> : null}
      </Panel>
      {dlg && dlg.startsWith('done:') ? <NoteDialog title="Complete task" label="Outcome" required onClose={() => setDlg(null)} onSubmit={(t) => act(A1.completeTask, { id: dlg.slice(5), outcome: t })} /> : null}
      {dlg && dlg.startsWith('AP-') ? <NoteDialog title="Reject approval" label="Reason for rejection" required tone="dng" onClose={() => setDlg(null)} onSubmit={(t) => act(A1.decideApproval, { id: dlg, decision: 'Reject', note: t })} /> : null}
    </>
  );
}

const BUCKET = (x) => (x.daysPastDue === 0 ? 'Not yet due' : x.daysPastDue <= 30 ? '1–30 days' : x.daysPastDue <= 60 ? '31–60 days' : x.daysPastDue <= 90 ? '61–90 days' : 'Over 90 days');

export function Reports() {
  const { db, d, csv } = useApp();
  const [tab, setTab] = useState('aging'); const [f, setF] = useState({ debtor: '', owner: '' });
  const rows = useMemo(() => collectionRows(db, d).filter((r) => !r.ex && (!f.debtor || r.debtorType === f.debtor) && (!f.owner || r.owner === f.owner)), [db, d, f]);
  const defs = useMemo(() => {
    const m = (c) => ({ get: (r) => centsCsv(r[c]) });
    return {
      aging: { name: 'Aging of collectible balances', rows: rows.filter((r) => r.triggerState === 'Active' && r.outstanding > 0).map((r) => ({ ...r, bucket: BUCKET(r) })).sort((a, b) => b.daysPastDue - a.daysPastDue),
        cols: [['Obligation', 'id'], ['Case', 'caseId'], ['Debtor', 'debtorName'], ['Bucket', 'bucket'], ['Days past due', 'daysPastDue'], ['Due', 'dueDate'], ['Outstanding', 'outstanding', 1], ['Owner', 'owner']] },
      payer: { name: 'Payer and entity balances', rows: Object.values(rows.reduce((acc, r) => { const k = r.debtorType + '|' + r.debtorName; const a = acc[k] || (acc[k] = { debtorType: r.debtorType, debtorName: r.debtorName, obligations: 0, collectible: 0, conditional: 0, cash: 0 }); a.obligations += 1; a.cash += r.cash; if (r.triggerState === 'Active') a.collectible += r.outstanding; else a.conditional += r.outstanding; return acc; }, {})).sort((a, b) => b.collectible - a.collectible),
        cols: [['Debtor type', 'debtorType'], ['Debtor', 'debtorName'], ['Obligations', 'obligations'], ['Collectible now', 'collectible', 1], ['Conditional', 'conditional', 1], ['Verified cash applied', 'cash', 1]] },
      cond: { name: 'Conditional obligations awaiting triggers', rows: rows.filter((r) => r.triggerState === 'Awaiting' && r.outstanding > 0),
        cols: [['Obligation', 'id'], ['Case', 'caseId'], ['Debtor', 'debtorName'], ['Trigger awaited', 'trigger'], ['Outstanding', 'outstanding', 1], ['Collateral pledged', 'collateral'], ['Owner', 'owner'], ['Next action', 'next']] },
      missing: { name: 'Cases without a verified agreement', rows: db.cases.filter((c) => d.cs[c.id].exception || !db.agreements.some((a) => a.caseId === c.id && a.verifiedVersion)).map((c) => ({ caseId: c.id, patients: d.cs[c.id].patients, agreement: (db.agreements.find((a) => a.caseId === c.id) || {}).id || 'None', status: (db.agreements.find((a) => a.caseId === c.id) || {}).status || 'No agreement', fee: 'Unknown', owner: c.financialOwner })),
        cols: [['Case', 'caseId'], ['Patient(s)', 'patients'], ['Agreement', 'agreement'], ['Status', 'status'], ['Fee', 'fee'], ['Financial owner', 'owner']] },
      unalloc: { name: 'Unallocated cash', rows: db.receipts.filter((r) => d.rc[r.id].available > 0).map((r) => ({ id: r.id, payerName: r.payerName, recipient: r.recipient, currency: r.currency, receivedDate: r.receivedDate, available: d.rc[r.id].available, note: r.recipient !== 'MFC' ? 'Held by ' + r.recipient + ' (not MFC cash)' : r.currency !== 'USD' ? 'Non-USD' : 'Ready to allocate' })),
        cols: [['Receipt', 'id'], ['Payer', 'payerName'], ['Recipient', 'recipient'], ['Currency', 'currency'], ['Received', 'receivedDate'], ['Unapplied', 'available', 1], ['Note', 'note']] },
      adj: { name: 'Adjusted closures (settled by write-off, not cash)', rows: rows.filter((r) => d.ob[r.id].writeoffs > 0 || d.ob[r.id].pend.some((p) => p.kind === 'Writeoff')).map((r) => ({ ...r, writeoff: d.ob[r.id].writeoffs, pendingWo: sum(d.ob[r.id].pend.filter((p) => p.kind === 'Writeoff'), (p) => p.amountCents) })),
        cols: [['Obligation', 'id'], ['Case', 'caseId'], ['Debtor', 'debtorName'], ['Adjusted obligation', 'adjusted', 1], ['Cash collected', 'cash', 1], ['Approved write-off', 'writeoff', 1], ['Pending write-off', 'pendingWo', 1], ['Status', 'status']] },
    };
  }, [rows, db, d]);
  const def = defs[tab]; const pg = usePaged(def.rows, 10);
  const money = (c, v) => (c[2] ? <Money c={v} /> : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v == null || v === '' ? '—' : String(v));
  const exportCsv = () => csv(def.name, toCSV(def.rows, def.cols.map((c) => ({ label: c[0], get: (r) => (c[2] ? centsCsv(r[c[1]]) : r[c[1]] == null ? '' : r[c[1]]) }))), def.rows.length);
  return (
    <Panel flush title={def.name} actions={<button className="btn sm" onClick={exportCsv}>Export CSV</button>}>
      <Tabs label="Reports" value={tab} onChange={(v) => { setTab(v); pg.setPage(0); }} tabs={[['aging', 'Aging'], ['payer', 'Payer / entity balances'], ['cond', 'Conditional'], ['missing', 'Missing verified agreements'], ['unalloc', 'Unallocated cash'], ['adj', 'Adjusted closures']]} />
      <div className="filters">
        <label className="field"><span className="lab">Debtor type</span><Select value={f.debtor} onChange={(v) => setF({ ...f, debtor: v })} options={[['', 'Any'], 'Client', 'Attorney', 'Policy Solutions', 'Simply Sold', 'Title/Escrow']} /></label>
        <label className="field"><span className="lab">Owner</span><Select value={f.owner} onChange={(v) => setF({ ...f, owner: v })} options={[['', 'Any']].concat(OWNERS)} /></label>
        <div className="muted sm" style={{ alignSelf: 'end' }}>Filters apply to the report and to its CSV export.</div>
      </div>
      <div className="tw"><table><thead><tr>{def.cols.map((c) => <th key={c[0]} className={c[2] ? 'num' : ''}>{c[0]}</th>)}</tr></thead>
        <tbody>{pg.items.map((r, i) => <tr key={i}>{def.cols.map((c) => <td key={c[0]} className={c[2] ? 'num' : ''}>{c[1] === 'status' ? <StatusBadge s={r.status} /> : money(c, r[c[1]])}</td>)}</tr>)}</tbody></table>
        {!pg.items.length ? <Empty title="Nothing to report" hint="No records match this report and filter combination." /> : null}</div>
      <Pager p={pg} />
    </Panel>
  );
}

export function Settings() {
  const { db, act, role } = useApp();
  const [tab, setTab] = useState('rules'); const s = db.settings;
  const upd = (patch) => act(A2.updateSettings, { patch });
  const tog = (k, label, hint) => <label key={k} className="row" style={{ alignItems: 'flex-start' }}><input type="checkbox" checked={s[k]} onChange={(e) => upd({ [k]: e.target.checked })} /><span><b>{label}</b><div className="muted sm">{hint}</div></span></label>;
  const m = db.migration; const issues = m.rows.filter((r) => r.issue !== 'OK');
  return (
    <Panel flush title="Settings">
      <Tabs label="Settings" value={tab} onChange={setTab} tabs={[['rules', 'Terms and rules'], ['perms', 'Team permissions'], ['migration', 'Migration batch preview']]} />
      <div className="body" style={{ display: 'grid', gap: 14 }}>
        {tab === 'rules' ? <>
          <Callout tone="info">These are configurable demo assumptions. Changing one affects new activity only; existing records keep their history.</Callout>
          <div className="form2">
            <Field label="Days from trigger to due date" hint="Used when ownership or closing activates an amount due"><input type="number" min="0" value={s.dueDays} onChange={(e) => upd({ dueDays: Math.max(0, +e.target.value || 0) })} /></Field>
            <Field label="Overdue grace days" hint="Days after the due date before a balance counts as overdue"><input type="number" min="0" value={s.graceDays} onChange={(e) => upd({ graceDays: Math.max(0, +e.target.value || 0) })} /></Field>
            <Field label="Match tolerance (USD)" hint="QBO amounts within this tolerance match without a difference"><input type="number" min="0" step="0.01" value={s.matchToleranceCents / 100} onChange={(e) => upd({ matchToleranceCents: Math.max(0, Math.round((+e.target.value || 0) * 100)) })} /></Field>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {tog('psExchangeCreatesObligation', 'Accepted policy exchange creates a PS-to-MFC obligation', 'On ownership confirmation, Policy Solutions owes MFC the agreed exchange value. Ownership itself never creates MFC cash.')}
            {tog('ownershipFulfillsClient', 'Ownership confirmation fulfills the client component', 'Marks the client side as fulfilled without recording any receipt.')}
            {tog('closingActivatesDue', 'Verified property closing activates the amount due', 'Settlement still waits for a receipt and reconciliation.')}
            {tog('requireReviewerDifferent', 'Agreement reviewer must differ from the drafter', 'Separation of duties on verification.')}
          </div>
        </> : null}
        {tab === 'perms' ? <>
          {role !== 'CEO' ? <Callout tone="warn">You are viewing as {role}. Only the CEO role can change permissions.</Callout> : <Callout tone="info">Toggle what each role can do. Buttons across the app update immediately. CEO permissions are fixed.</Callout>}
          <div className="tw"><table><thead><tr><th>Action</th>{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead><tbody>
            {Object.entries(PERM_LABELS).map(([k, l]) => <tr key={k}><td>{l}</td>{ROLES.map((r) => <td key={r} style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${r}: ${l}`} checked={db.perms[r][k]} disabled={role !== 'CEO' || r === 'CEO'} onChange={() => act(A2.togglePerm, { role: r, action: k })} /></td>)}</tr>)}
          </tbody></table></div>
          <div className="muted sm">Separate from permissions: nobody can approve an adjustment, refund or closure they proposed themselves.</div>
        </> : null}
        {tab === 'migration' ? <>
          <Callout tone="info">Preview of a fictional legacy-tracker batch ({m.batch}). The preview never creates records. Issues must be fixed in the source before a real migration.</Callout>
          <KV items={[['Rows in batch', m.rows.length], ['Ready', m.rows.length - issues.length], ['Need attention', issues.length], ['Previewed', m.previewed ? <Badge tone="ok">Yes</Badge> : <Badge tone="warn">Not yet</Badge>]]} />
          <div className="tw"><table><thead><tr><th>Legacy ID</th><th>Name</th><th>Check</th></tr></thead><tbody>{m.rows.map((r) => <tr key={r.legacyId}><td className="mono">{r.legacyId}</td><td>{r.name}</td><td>{r.issue === 'OK' ? <Badge tone="ok">Ready</Badge> : <Badge tone="warn">{r.issue}</Badge>}</td></tr>)}</tbody></table></div>
          <div className="row"><Btn kind="pri" perm="approve" onClick={() => act(A2.previewMigration, {})}>Run preview (no records created)</Btn></div>
        </> : null}
      </div>
    </Panel>
  );
}
