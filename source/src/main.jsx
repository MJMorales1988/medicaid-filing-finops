import { seed, ROLES, ACTORS } from './seed.js';
import { derive } from './calc.js';
import { runAct } from './actions1.js';
import { Ctx, ConfirmModal, CsvModal, DocModal } from './ui_core.jsx';
import Overview from './screen_overview.jsx';
import Collections from './screen_collections.jsx';
import Cases from './screen_cases.jsx';
import Agreements from './screen_agreements.jsx';
import Receipts from './screen_receipts.jsx';
import Recon from './screen_recon.jsx';
import { PolicySolutions, SimplySold } from './screen_ps_ss.jsx';
import { Tasks, Reports, Settings } from './screen_tasks_reports.jsx';
import Guide from './walkthrough.jsx';

const { useState, useRef, useMemo, useCallback, useEffect } = React;
const KEY = 'mffo-demo-v1';

const loadDb = () => {
  try { const s = localStorage.getItem(KEY); if (s) { const o = JSON.parse(s); if (o && o.__v === 1) return o; } } catch (e) { /* storage unavailable */ }
  const o = seed(); o.__v = 1; return o;
};
const saveDb = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } };

const NAV = [
  ['Financial', [['overview', 'Financial Overview'], ['collections', 'Collections'], ['receipts', 'Receipts'], ['recon', 'Reconciliation']]],
  ['Cases', [['cases', 'Cases'], ['agreements', 'Agreements'], ['ps', 'Policy Solutions'], ['ss', 'Simply Sold']]],
  ['Work', [['tasks', 'Tasks and Approvals'], ['reports', 'Reports'], ['settings', 'Settings']]],
];
const TITLES = Object.fromEntries(NAV.flatMap((g) => g[1]));
const SCREENS = { overview: Overview, collections: Collections, cases: Cases, agreements: Agreements, receipts: Receipts, recon: Recon, ps: PolicySolutions, ss: SimplySold, tasks: Tasks, reports: Reports, settings: Settings };

function App() {
  const [db, setDb] = useState(loadDb);
  const dbRef = useRef(db);
  const [role, setRole] = useState('CEO');
  const [route, setRoute] = useState({ view: 'overview', params: {}, n: 0 });
  const [toasts, setToasts] = useState([]);
  const [conf, setConf] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [docId, setDocId] = useState(null);
  const [guide, setGuide] = useState(false);
  const actor = ACTORS[role];

  const toast = useCallback((msg, kind) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  const commit = (nd) => { dbRef.current = nd; setDb(nd); saveDb(nd); };

  const exec = (r, a, fn, p, opts) => {
    const can = (k) => !!dbRef.current.perms[r][k];
    const out = runAct(dbRef.current, fn, p, { actor: a, role: r, can });
    if (out.res.ok) commit(out.db);
    if (!(opts && opts.silent === true)) {
      if (out.res.ok && out.res.msg) toast(out.res.msg);
      else if (!out.res.ok && !out.res.needsOverride) toast(out.res.error, 'err');
    }
    return out.res;
  };
  const act = (fn, p, opts) => exec(role, (opts && opts.as) || actor, fn, p, opts);
  const runAs = (a, r, fn, p) => exec(r, a, fn, p);
  const go = (view, params) => { setRoute((x) => ({ view, params: params || {}, n: x.n + 1 })); window.scrollTo(0, 0); };
  const can = (k) => !!db.perms[role][k];
  const d = useMemo(() => derive(db), [db]);

  const resetDemo = () => setConf({
    title: 'Reset demo data?', danger: true, label: 'Reset demo',
    body: 'This discards every change you made and restores the original fictional seed records, including the audit trail. It cannot be undone.',
    onOk: () => { const o = seed(); o.__v = 1; commit(o); go('overview'); toast('Demo data reset to the original seed.'); },
  });

  const ctx = { db, d, role, actor, can, act, runAs, go, toast, confirm: setConf, csv: (name, text, count) => setCsvData({ name, text, count }), doc: setDocId };
  const View = SCREENS[route.view] || Overview;
  const pendingAp = db.approvals.filter((a) => a.status === 'Pending').length;
  const reconN = d.k.recon.unmatched.length + d.k.recon.appOnly.length + d.k.recon.differences.length;
  const cnt = { tasks: pendingAp, recon: reconN };

  useEffect(() => { document.title = 'Medicaid Filing - Financial Operations'; }, []);

  return (
    <Ctx.Provider value={ctx}>
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) m.focus(); }}>Skip to content</a>
      <div className="app">
        <aside className="side">
          <div className="brand"><b>Medicaid Filing</b><span>Financial Operations · MFC, PS, SS</span></div>
          <nav className="nav" aria-label="Main">
            {NAV.map(([g, items]) => (
              <React.Fragment key={g}>
                <div className="grp">{g}</div>
                {items.map(([k, l]) => (
                  <button key={k} aria-current={route.view === k ? 'page' : undefined} onClick={() => go(k)}>
                    <span>{l}</span>{cnt[k] ? <span className="cnt" aria-label={`${cnt[k]} open`}>{cnt[k]}</span> : null}
                  </button>))}
              </React.Fragment>))}
          </nav>
          <div className="foot">Demo prototype. Fictional records only. No production systems, emails or payments. Demo date: Oct 13, 2026.</div>
        </aside>
        <div className="main">
          <header className="top">
            <h1>{TITLES[route.view]}</h1>
            <div className="tools">
              <span className="demo" title="All records are fictional seed data held in this browser">Demo data</span>
              <label className="row sm" style={{ gap: 6 }}>
                <span className="muted">Role</span>
                <select aria-label="Switch role" value={role} onChange={(e) => { setRole(e.target.value); toast(`Now acting as ${ACTORS[e.target.value]} (${e.target.value}).`); }} style={{ width: 'auto' }}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <span className="muted sm">{actor}</span>
              <button className="btn sm" onClick={() => setGuide((g) => !g)} aria-pressed={guide}>Guided demo</button>
              <button className="btn sm dng" onClick={resetDemo}>Reset demo</button>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="page"><View key={route.view + ':' + route.n} params={route.params} /></main>
        </div>
      </div>
      {guide ? <Guide onClose={() => setGuide(false)} /> : null}
      {conf ? <ConfirmModal c={conf} onClose={() => setConf(null)} /> : null}
      {csvData ? <CsvModal csv={csvData} onClose={() => setCsvData(null)} /> : null}
      {docId ? <DocModal id={docId} onClose={() => setDocId(null)} /> : null}
      <div className="toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={'toast' + (t.kind === 'err' ? ' err' : '')}>{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
