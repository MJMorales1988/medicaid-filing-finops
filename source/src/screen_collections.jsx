import { fmtDate, fmtUSD, toCSV, centsCsv } from './util.js';
import { OWNERS, CASE_STAGES } from './seed.js';
import { collectionRows } from './calc.js';
import { useApp, Panel, Tabs, Badge, StatusBadge, Money, Select, Empty, CaseLink, useSorted, SortTh, usePaged, Pager, Btn } from './ui_core.jsx';
import { AssignOwnerDialog, FollowUpDialog, OutcomeDialog, AdjustmentDialog } from './dialogs.jsx';
const { useState, useMemo } = React;

const TABS = [
  ['all', 'All MFC Outstanding', (r) => !r.ex && r.outstanding > 0],
  ['attorney', 'Attorney Remittances', (r) => !r.ex && r.debtorType === 'Attorney'],
  ['psss', 'PS/SS Due', (r) => !r.ex && ['Policy Solutions', 'Simply Sold'].includes(r.debtorType)],
  ['awaiting', 'Awaiting Trigger/Collateral', (r) => !r.ex && r.triggerState === 'Awaiting' && r.outstanding > 0],
  ['overdue', 'Overdue', (r) => !r.ex && r.daysPastDue > 0],
  ['disputes', 'Disputes', (r) => r.disputed],
  ['evidence', 'Missing Evidence', (r) => r.evidenceMissing],
  ['settled', 'Settled', (r) => !r.ex && r.outstanding === 0],
];
const EMPTY = { q: '', debtor: '', entity: '', owner: '', fin: '', op: '', from: '', to: '', cat: '', trig: '' };

export default function Collections({ params }) {
  const { db, d, go, csv } = useApp();
  const [tab, setTab] = useState(params.tab || 'all');
  const [f, setF] = useState({ ...EMPTY, ...(params.filters || {}) });
  const [dlg, setDlg] = useState(null);
  const all = useMemo(() => collectionRows(db, d), [db, d]);
  const set = (k) => (v) => setF({ ...f, [k]: v && v.target ? v.target.value : v });
  const filtered = useMemo(() => {
    const def = TABS.find((t) => t[0] === tab)[2];
    return all.filter(def).filter((r) =>
      (!f.q || (r.id + r.caseId + r.patients + r.debtorName).toLowerCase().includes(f.q.toLowerCase())) && (!f.debtor || r.debtorType === f.debtor) && (!f.entity || r.entity === f.entity) &&
      (!f.owner || r.owner === f.owner) && (!f.fin || r.status === f.fin) && (!f.op || r.opStatus === f.op) && (!f.cat || r.category === f.cat) && (!f.trig || r.triggerState === f.trig) &&
      (!f.from || (r.dueDate && r.dueDate >= f.from)) && (!f.to || (r.dueDate && r.dueDate <= f.to)));
  }, [all, tab, f]);
  const s = useSorted(filtered, 'daysPastDue', -1);
  const pg = usePaged(s.sorted, 8);
  const counts = Object.fromEntries(TABS.map((t) => [t[0], all.filter(t[2]).length]));
  const cats = [...new Set(all.map((r) => r.category))];
  const exportCsv = () => csv('MFC collections', toCSV(s.sorted, [
    { label: 'Obligation', get: (r) => r.id }, { label: 'Case', get: (r) => r.caseId }, { label: 'Patient(s)', get: (r) => r.patients }, { label: 'Debtor', get: (r) => r.debtorName }, { label: 'Debtor type', get: (r) => r.debtorType },
    { label: 'Creditor', get: (r) => r.creditor }, { label: 'Category', get: (r) => r.category }, { label: 'Adjusted obligation', get: (r) => centsCsv(r.adjusted) }, { label: 'Applied cash', get: (r) => centsCsv(r.cash) },
    { label: 'Applied noncash', get: (r) => centsCsv(r.noncash) }, { label: 'Outstanding', get: (r) => centsCsv(r.outstanding) }, { label: 'Due', get: (r) => r.dueDate || '' }, { label: 'Trigger', get: (r) => r.trigger },
    { label: 'Days past due', get: (r) => r.daysPastDue }, { label: 'Owner', get: (r) => r.owner }, { label: 'Financial status', get: (r) => r.status }, { label: 'Operational status', get: (r) => r.opStatus }, { label: 'Next action', get: (r) => r.next },
  ]), s.sorted.length);
  const ob = (id) => db.obligations.find((o) => o.id === id);
  const active = Object.keys(EMPTY).some((k) => f[k]);
  return (
    <>
      <Panel flush>
        <Tabs label="Saved views" tabs={TABS.map((t) => [t[0], t[1], counts[t[0]]])} value={tab} onChange={(v) => { setTab(v); pg.setPage(0); }} />
        <div className="filters">
          <label className="field"><span className="lab">Search</span><input type="search" placeholder="Case, patient, debtor, ID" value={f.q} onChange={set('q')} /></label>
          <label className="field"><span className="lab">Debtor type</span><Select value={f.debtor} onChange={set('debtor')} options={[['', 'Any']].concat(['Client', 'Attorney', 'Policy Solutions', 'Simply Sold', 'Title/Escrow'])} /></label>
          <label className="field"><span className="lab">Entity owed</span><Select value={f.entity} onChange={set('entity')} options={[['', 'Any'], 'MFC', 'PS', 'SS']} /></label>
          <label className="field"><span className="lab">Owner</span><Select value={f.owner} onChange={set('owner')} options={[['', 'Any']].concat(OWNERS)} /></label>
          <label className="field"><span className="lab">Financial status</span><Select value={f.fin} onChange={set('fin')} options={[['', 'Any'], 'Current', 'Partially paid', 'Overdue', 'Awaiting trigger', 'Settled', 'Settled – adjusted', 'Exception']} /></label>
          <label className="field"><span className="lab">Operational status</span><Select value={f.op} onChange={set('op')} options={[['', 'Any']].concat(CASE_STAGES)} /></label>
          <label className="field"><span className="lab">Category</span><Select value={f.cat} onChange={set('cat')} options={[['', 'Any']].concat(cats)} /></label>
          <label className="field"><span className="lab">Trigger state</span><Select value={f.trig} onChange={set('trig')} options={[['', 'Any'], ['Active', 'Active (collectible)'], ['Awaiting', 'Awaiting trigger']]} /></label>
          <label className="field"><span className="lab">Due from</span><input type="date" value={f.from} onChange={set('from')} /></label>
          <label className="field"><span className="lab">Due to</span><input type="date" value={f.to} onChange={set('to')} /></label>
          <div className="row" style={{ alignItems: 'flex-end' }}>{active ? <button className="btn sm" onClick={() => setF(EMPTY)}>Clear filters</button> : null}<button className="btn sm" onClick={exportCsv}>Export CSV</button></div>
        </div>
        <div className="tw">
          <table>
            <thead><tr>
              <SortTh s={s} k="caseId">Case</SortTh><SortTh s={s} k="debtorName">Debtor</SortTh><th>Creditor</th>
              <SortTh s={s} k="adjusted" num>Adjusted obligation</SortTh><th className="num">Applied cash / noncash</th><SortTh s={s} k="outstanding" num>Outstanding</SortTh>
              <SortTh s={s} k="dueDate">Due / trigger</SortTh><SortTh s={s} k="age" num>Age</SortTh><SortTh s={s} k="owner">Owner</SortTh><th>Next action</th><SortTh s={s} k="status">Status</SortTh><th>Actions</th>
            </tr></thead>
            <tbody>
              {pg.items.map((r) => (
                <tr key={r.key} className="click" onClick={() => go('cases', { caseId: r.caseId, tab: 'financials', ob: r.id })}>
                  <td><CaseLink id={r.caseId} /><div className="sub">{r.patients}</div><div className="sub">Case: {r.opStatus}</div></td>
                  <td>{r.debtorName}<div className="sub">{r.debtorType} · {r.category}</div>{r.collateral ? <div className="sub">Collateral pledged (security, not payment)</div> : null}</td>
                  <td>{r.creditor}</td>
                  <td className="num"><Money c={r.adjusted} /></td>
                  <td className="num"><Money c={r.cash} /><div className="sub">noncash {fmtUSD(r.noncash)}</div></td>
                  <td className="num"><Money c={r.outstanding} strong /></td>
                  <td>{r.dueDate ? fmtDate(r.dueDate) : '—'}<div className="sub">{r.trigger}</div>{r.daysPastDue > 0 ? <Badge tone="bad">{r.daysPastDue}d past due</Badge> : null}</td>
                  <td className="num">{r.age == null ? <span className="unk">Unknown</span> : r.age + 'd'}</td>
                  <td>{r.owner}</td>
                  <td style={{ maxWidth: 190 }}>{r.next}{r.disputed ? <div><Badge tone="warn">Disputed</Badge></div> : null}{r.evidenceMissing ? <div><Badge tone="bad">{r.ex ? 'Agreement unverified' : 'Missing evidence'}</Badge></div> : null}</td>
                  <td><StatusBadge s={r.status} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.ex ? <span className="muted sm">Open case to verify</span> : <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <Btn sm perm="assignOwner" onClick={() => setDlg(['owner', r.id])}>Owner</Btn>
                      <Btn sm perm="followUp" onClick={() => setDlg(['follow', r.id])}>Follow-up</Btn>
                      <Btn sm perm="followUp" onClick={() => setDlg(['outcome', r.id])}>Outcome</Btn>
                      {r.outstanding > 0 && !r.pendingAdj ? <Btn sm perm="proposeAdjustment" onClick={() => setDlg(['adj', r.id])}>Adjust</Btn> : null}
                    </div>}
                  </td>
                </tr>))}
            </tbody>
          </table>
          {!pg.items.length ? <Empty title="No records in this view" hint={active ? 'Your filters exclude everything. Clear filters to see the full view.' : 'Nothing matches this saved view right now.'}>{active ? <div style={{ marginTop: 10 }}><button className="btn" onClick={() => setF(EMPTY)}>Clear filters</button></div> : null}</Empty> : null}
        </div>
        <Pager p={pg} />
      </Panel>
      {dlg && dlg[0] === 'owner' ? <AssignOwnerDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'follow' ? <FollowUpDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'outcome' ? <OutcomeDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
      {dlg && dlg[0] === 'adj' ? <AdjustmentDialog ob={ob(dlg[1])} onClose={() => setDlg(null)} /> : null}
    </>
  );
}
