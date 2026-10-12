import { fmtDate, fmtUSD, TODAY, fmtStamp } from './util.js';
import { CASE_STAGES, OWNERS } from './seed.js';
import * as A1 from './actions1.js';
import { useApp, Panel, Tabs, StatusBadge, Badge, Money, KV, Select, Empty, CaseLink, useSorted, SortTh, usePaged, Pager, Btn, AuditList, Field } from './ui_core.jsx';
import Financials from './case_fin.jsx';
const { useState, useMemo } = React;

function Register() {
  const { db, d, go } = useApp();
  const [f, setF] = useState({ q: '', op: '', fin: '' });
  const rows = useMemo(() => db.cases.map((c) => { const s = d.cs[c.id]; return { id: c.id, c, patients: s.patients, label: c.label, op: c.opStatus, fin: s.fin, agreed: s.agreed, cash: s.mfcCash, out: s.outstanding, owner: c.financialOwner, next: s.next, worker: c.caseworker }; })
    .filter((r) => (!f.q || (r.id + r.patients + r.label).toLowerCase().includes(f.q.toLowerCase())) && (!f.op || r.op === f.op) && (!f.fin || r.fin.startsWith(f.fin))), [db, d, f]);
  const s = useSorted(rows, 'id', 1); const pg = usePaged(s.sorted, 15);
  return (
    <Panel flush>
      <div className="filters">
        <label className="field"><span className="lab">Search</span><input type="search" placeholder="Case ID or patient" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <label className="field"><span className="lab">Operational status</span><Select value={f.op} onChange={(v) => setF({ ...f, op: v })} options={[['', 'Any']].concat(CASE_STAGES)} /></label>
        <label className="field"><span className="lab">Financial status</span><Select value={f.fin} onChange={(v) => setF({ ...f, fin: v })} options={[['', 'Any'], 'Current', 'Partially paid', 'Overdue', 'Awaiting trigger', 'Paid', 'Settled', 'Financially closed', 'Exception', 'No MFC']} /></label>
      </div>
      <div className="tw"><table>
        <thead><tr><SortTh s={s} k="id">Case</SortTh><SortTh s={s} k="patients">Patient(s)</SortTh><SortTh s={s} k="op">Operational</SortTh><SortTh s={s} k="fin">Financial</SortTh><SortTh s={s} k="agreed" num>Agreed fee</SortTh><SortTh s={s} k="cash" num>Verified MFC cash</SortTh><SortTh s={s} k="out" num>MFC outstanding</SortTh><th>Financial owner</th><th>Next action</th></tr></thead>
        <tbody>{pg.items.map((r) => (
          <tr key={r.id} className="click" onClick={() => go('cases', { caseId: r.id, tab: 'summary' })}>
            <td><CaseLink id={r.id} /><div className="sub">{r.label}</div></td><td>{r.patients}{r.c.sharedFee ? <div className="sub">Couple, one shared fee</div> : null}</td>
            <td><Badge tone={r.op === 'Closed' ? 'muted' : 'acc'}>{r.op}</Badge></td><td><StatusBadge s={r.fin} /></td>
            <td className="num"><Money c={r.agreed} /></td><td className="num"><Money c={r.cash} /></td><td className="num"><Money c={r.out} strong /></td><td>{r.owner}</td><td style={{ maxWidth: 220 }}>{r.next}</td>
          </tr>))}</tbody>
      </table>{!pg.items.length ? <Empty title="No cases match" hint="Clear a filter to see more." /> : null}</div>
      <Pager p={pg} />
    </Panel>
  );
}

function Summary({ c }) {
  const { db, d, act, go, doc } = useApp();
  const cs = d.cs[c.id];
  const ags = db.agreements.filter((a) => a.caseId === c.id);
  const pols = db.policies.filter((p) => p.caseId === c.id); const deals = db.deals.filter((x) => x.caseId === c.id);
  const sibs = db.cases.filter((x) => x.id !== c.id && x.patientIds.some((p) => c.patientIds.includes(p)));
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Panel title="Case summary">
        <KV items={[['Patient(s)', cs.patients], ['Case type', c.label], ['Caseworker', c.caseworker], ['Financial owner', c.financialOwner], ['Agreements', ags.length ? ags.map((a) => `${a.id} (${a.type})`).join(', ') : <span className="unk">None</span>], ['Related cases', sibs.length ? sibs.map((x) => <span key={x.id}><CaseLink id={x.id} />{' '}</span>) : '—']]} />
        {c.sharedFee ? <p className="muted sm" style={{ margin: '12px 0 0' }}>This couple shares one fee. One agreement and one obligation cover both patients.</p> : null}
      </Panel>
      <div className="grid g-2">
        <Panel title="Operational status (independent of finances)">
          <div className="row"><StatusBadge s={c.opStatus} /><Select aria-label="Operational stage" value={c.opStatus} onChange={(v) => act(A1.setCaseStage, { caseId: c.id, opStatus: v })} options={CASE_STAGES} disabled={false} style={{ width: 'auto' }} /></div>
          <p className="muted sm" style={{ margin: '10px 0 0' }}>Changing the Medicaid stage never changes what is owed or paid. A closed Medicaid case with an unpaid fee stays in Collections.</p>
          <div className="row" style={{ marginTop: 10 }}><Btn sm perm="caseStage" onClick={() => act(A1.setCaseStage, { caseId: c.id, opStatus: 'Closed' })} disabled={c.opStatus === 'Closed'}>Mark Medicaid case closed</Btn></div>
        </Panel>
        <Panel title="Financial status (independent of operations)">
          <div className="row"><StatusBadge s={cs.fin} />{c.finClosed ? <span className="muted sm">Closed {fmtDate(c.finClosedAt)}</span> : null}</div>
          <p className="muted sm" style={{ margin: '10px 0 0' }}>Approval, Star Plus or a property closing do not make a case financially settled. Settlement needs verified cash (or an approved adjustment) and resolved reconciliation.</p>
          <div className="row" style={{ marginTop: 10 }}><Select aria-label="Financial owner" value={c.financialOwner} onChange={(v) => act(A1.setFinancialOwner, { caseId: c.id, owner: v })} options={OWNERS} style={{ width: 'auto' }} /><span className="muted sm">Financial owner</span></div>
        </Panel>
      </div>
      {pols.length || deals.length ? <Panel title="Linked workflows">
        <div className="row">{pols.map((p) => <button key={p.id} className="btn" onClick={() => go('ps', { id: p.id })}>Policy {p.id}</button>)}{deals.map((x) => <button key={x.id} className="btn" onClick={() => go('ss', { id: x.id })}>Deal {x.id}</button>)}</div>
      </Panel> : null}
    </div>
  );
}

function Documents({ c }) {
  const { db, doc } = useApp();
  const docs = db.documents.filter((x) => x.caseId === c.id);
  const missing = db.agreements.filter((a) => a.caseId === c.id && !a.versions[a.currentVersion - 1].docId);
  return (
    <Panel title="Documents and evidence" flush>
      {missing.length ? <div className="body"><div className="callout bad">Missing signed EA for {missing.map((m) => m.id).join(', ')}. Collections shows this under Missing Evidence.</div></div> : null}
      {docs.length ? <div className="tw"><table><thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>
        {docs.map((x) => <tr key={x.id}><td>{x.name}<div className="sub mono">{x.id}</div></td><td>{x.kind}</td><td><StatusBadge s={x.status} /></td><td>{fmtDate(x.date)}</td><td><button className="btn sm" onClick={() => doc(x.id)}>Preview</button></td></tr>)}
      </tbody></table></div> : <Empty title="No documents on file" hint="Attach a signed EA from the Agreements screen." />}
    </Panel>
  );
}

function CaseTasks({ c }) {
  const { db, act, go } = useApp();
  const [title, setTitle] = useState(''); const [due, setDue] = useState('2026-10-20');
  const tasks = db.tasks.filter((t) => t.caseId === c.id);
  return (
    <Panel title="Tasks for this case" actions={<button className="btn sm" onClick={() => go('tasks', {})}>Open full queue</button>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="text" aria-label="New task title" placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: '1 1 240px' }} />
        <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 'auto' }} />
        <Btn perm="manageTasks" onClick={() => { const r = act(A1.addTask, { title, due, caseId: c.id }); if (r.ok) setTitle(''); }}>Add task</Btn>
      </div>
      {tasks.length ? tasks.map((t) => <div key={t.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line2)' }}><span className="mono sm">{t.id}</span><span style={{ flex: '1 1 240px' }}>{t.title}<div className="sub muted sm">{t.owner} · due {fmtDate(t.due)}{t.outcome ? ' · ' + t.outcome : ''}</div></span><StatusBadge s={t.status === 'Done' ? 'Done' : t.due < TODAY ? 'Overdue' : 'Open'} /></div>) : <Empty title="No tasks for this case" />}
    </Panel>
  );
}

function CaseDetail({ id, tab, focus }) {
  const { db, d, go } = useApp();
  const c = db.cases.find((x) => x.id === id);
  const [t, setT] = useState(tab || 'summary');
  if (!c) return <Empty title="Case not found" hint="It may have been removed by a demo reset."><div style={{ marginTop: 10 }}><button className="btn" onClick={() => go('cases', {})}>Back to cases</button></div></Empty>;
  const cs = d.cs[c.id]; const nTasks = db.tasks.filter((x) => x.caseId === c.id && x.status !== 'Done').length;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><button className="btn sm" onClick={() => go('cases', {})}>← All cases</button>{' '}<b style={{ fontSize: 18, marginLeft: 8 }}>{c.id} · {cs.patients}</b></div>
        <div className="row"><Badge tone="acc">Operational: {c.opStatus}</Badge><StatusBadge s={cs.fin} /></div>
      </div>
      <Panel flush>
        <Tabs label="Case sections" value={t} onChange={setT} tabs={[['summary', 'Summary'], ['financials', 'Financials'], ['documents', 'Documents', db.documents.filter((x) => x.caseId === c.id).length], ['tasks', 'Tasks', nTasks], ['activity', 'Activity']]} />
      </Panel>
      {t === 'summary' ? <Summary c={c} /> : t === 'financials' ? <Financials c={c} focus={focus} /> : t === 'documents' ? <Documents c={c} /> : t === 'tasks' ? <CaseTasks c={c} /> : <Panel title="Activity (audit history)"><AuditList items={db.audit.filter((a) => a.caseId === c.id)} empty="No activity recorded for this case." /></Panel>}
    </>
  );
}

export default function Cases({ params }) {
  return params.caseId ? <CaseDetail key={params.caseId + (params.tab || '')} id={params.caseId} tab={params.tab} focus={params.ob} /> : <Register />;
}
