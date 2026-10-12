// Shared UI primitives and app context. React is a global (loaded from cdnjs).
import { fmtUSD, fmtDate, fmtStamp } from './util.js';
const { createContext, useContext, useState, useMemo, useEffect, useRef } = React;

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const TONE = {
  ok: ['Settled', 'Financially closed', 'Verified', 'Matched', 'Resolved', 'Approved', 'Fulfilled', 'Done', 'Complete', 'Active', 'Cash settled'],
  info: ['Settled – adjusted', 'Financially closed – adjusted', 'Fulfilled – adjusted', 'Awaiting trigger', 'Adjusted closure', 'Contra', 'Reversal', 'In progress'],
  bad: ['Overdue', 'Rejected', 'Exception', 'Exception: agreement unverified', 'Missing', 'Reversed', 'Difference', 'Missing signed EA', 'Unknown'],
  warn: ['Partially paid', 'Partial', 'Paid – reconciliation open', 'Reported', 'Pending', 'Review', 'Unmatched', 'Pending review', 'Draft', 'Disputed', 'Open', 'Escalated'],
  muted: ['Current', 'No MFC receivable', 'N/A', 'Closed'],
};
const GLYPH = { ok: '✓', info: '◆', bad: '▲', warn: '!', muted: '○', acc: '●' };
export function toneOf(s) { for (const k of Object.keys(TONE)) if (TONE[k].includes(s)) return k; return 'muted'; }
export function Badge({ tone = 'muted', children, title }) {
  return <span className={'badge b-' + tone} title={title}><i aria-hidden="true">{GLYPH[tone]}</i>{children}</span>;
}
export const StatusBadge = ({ s, title }) => <Badge tone={toneOf(s)} title={title}>{s}</Badge>;

export function Money({ c, cur = 'USD', strong }) {
  if (c == null) return <span className="unk">Unknown</span>;
  return <span className="num" style={strong ? { fontWeight: 600 } : null}>{fmtUSD(c, cur)}</span>;
}

export function Btn({ perm, kind = '', sm, disabled, title, onClick, children, ...rest }) {
  const { can, role } = useApp();
  const denied = perm && !can(perm);
  const off = disabled || denied;
  return (
    <button type="button" className={'btn ' + kind + (sm ? ' sm' : '')} disabled={off} aria-disabled={off} title={denied ? `Not available to the ${role} role` : title} onClick={(e) => { e.stopPropagation(); if (!off && onClick) onClick(e); }} {...rest}>{children}</button>
  );
}

export function Modal({ title, sub, onClose, footer, wide, side, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const f = el && el.querySelector('input:not([disabled]), select:not([disabled]), textarea, .bd button');
    if (f) f.focus(); else if (el) el.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) try { prev.focus(); } catch (e) { /* ignore */ } };
  }, []);
  return (
    <div className={'scrim' + (side ? ' right' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'dlg' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header><div><h2>{title}</h2>{sub ? <div className="muted sm">{sub}</div> : null}</div><button className="btn sm" onClick={onClose} aria-label="Close dialog">Close</button></header>
        <div className="bd">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return <label className="field"><span className="lab">{label}</span>{children}{hint ? <span className="hint">{hint}</span> : null}{error ? <span className="err" role="alert">{error}</span> : null}</label>;
}
export function MoneyInput({ value, onChange, ...p }) {
  return <input type="text" inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value)} {...p} />;
}
export function Select({ value, onChange, options, ...p }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} {...p}>{options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}</select>;
}
export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}>{l}{n != null ? <span className="n">{n}</span> : null}</button>)}
    </div>
  );
}
export const Empty = ({ title, hint, children }) => <div className="empty"><b>{title}</b>{hint}{children}</div>;
export const Callout = ({ tone = 'info', children }) => <div className={'callout ' + tone} role={tone === 'bad' ? 'alert' : undefined}>{children}</div>;
export const Panel = ({ title, actions, children, flush }) => <section className="panel">{title || actions ? <header><h2>{title}</h2><div className="row">{actions}</div></header> : null}{flush ? children : <div className="body">{children}</div>}</section>;
export const KV = ({ items }) => <div className="kv">{items.map(([k, v]) => <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>;
export function CaseLink({ id, label }) {
  const { go } = useApp();
  return <a href="#" className="mono" onClick={(e) => { e.preventDefault(); e.stopPropagation(); go('cases', { caseId: id, tab: 'financials' }); }}>{label || id}</a>;
}

export function useSorted(rows, key0, dir0 = 1) {
  const [key, setKey] = useState(key0); const [dir, setDir] = useState(dir0);
  const sorted = useMemo(() => {
    if (!key) return rows;
    return [...rows].sort((a, b) => {
      let x = a[key], y = b[key];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
  }, [rows, key, dir]);
  const toggle = (k) => { if (k === key) setDir(-dir); else { setKey(k); setDir(1); } };
  return { sorted, key, dir, toggle };
}
export function SortTh({ s, k, children, num }) {
  const on = s.key === k;
  return <th className={num ? 'num' : ''} aria-sort={on ? (s.dir === 1 ? 'ascending' : 'descending') : 'none'}><button onClick={() => s.toggle(k)} title={'Sort by ' + (typeof children === 'string' ? children : k)}>{children}<span aria-hidden="true">{on ? (s.dir === 1 ? '▲' : '▼') : ''}</span></button></th>;
}
export function usePaged(rows, initSize = 8) {
  const [page, setPage] = useState(0); const [size, setSize] = useState(initSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages - 1);
  return { items: rows.slice(cur * size, cur * size + size), page: cur, pages, size, setPage, setSize, total: rows.length };
}
export function Pager({ p }) {
  return (
    <div className="pager">
      <span>{p.total ? `Showing ${p.page * p.size + 1}–${Math.min(p.total, (p.page + 1) * p.size)} of ${p.total}` : '0 records'}</span>
      <span className="row">
        <label className="row sm">Rows <select style={{ width: 'auto' }} value={p.size} onChange={(e) => { p.setSize(+e.target.value); p.setPage(0); }}>{[5, 8, 15, 30].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button className="btn sm" disabled={p.page === 0} onClick={() => p.setPage(p.page - 1)}>Previous</button>
        <span>Page {p.page + 1} of {p.pages}</span>
        <button className="btn sm" disabled={p.page >= p.pages - 1} onClick={() => p.setPage(p.page + 1)}>Next</button>
      </span>
    </div>
  );
}

export function DocModal({ id, onClose }) {
  const { db } = useApp();
  const d = db.documents.find((x) => x.id === id);
  return (
    <Modal title={d ? d.name : 'Document'} sub={d ? `${d.id} · ${d.kind} · fictional preview` : ''} onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      {!d ? <Empty title="Document not found" hint="It may have been removed in this demo." /> : <>
        <KV items={[['Status', <StatusBadge s={d.status} />], ['Case', d.caseId || '—'], ['Date', fmtDate(d.date)], ['Pages', d.pages], ['Fingerprint', <span className="mono">{d.hash}</span>]]} />
        <div className="callout info">{d.note}</div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 18, background: 'var(--surface2)', display: 'grid', gap: 8 }} aria-label="Placeholder page preview">
          <b>{d.kind.toUpperCase()}</b>
          {[88, 72, 80, 64, 76, 40].map((w, i) => <div key={i} style={{ height: 8, width: w + '%', background: 'var(--line)', borderRadius: 4 }} />)}
          <div className="muted sm" style={{ marginTop: 6 }}>Signature block: [demo signature on file] · Date: {fmtDate(d.date)}</div>
        </div>
      </>}
    </Modal>
  );
}

export function CsvModal({ csv, onClose }) {
  const [msg, setMsg] = useState('');
  const ref = useRef(null);
  const copy = () => {
    const done = () => setMsg('Copied to clipboard.');
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(ref.current); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); setMsg('Clipboard blocked here. Text is selected; press Ctrl/Cmd+C.'); };
    try { navigator.clipboard.writeText(csv.text).then(done, fallback); } catch (e) { fallback(); }
  };
  return (
    <Modal title={'CSV export: ' + csv.name} sub={`${csv.count} row${csv.count === 1 ? '' : 's'} from the current filtered demo records`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn pri" onClick={copy}>Copy CSV</button></>}>
      <div className="callout info">Downloads are blocked inside this viewer, so the export opens here. Copy it and paste into a spreadsheet.</div>
      <pre className="csv" ref={ref} tabIndex={0}>{csv.text}</pre>
      <div className="muted sm" role="status">{msg}</div>
    </Modal>
  );
}

export function ConfirmModal({ c, onClose }) {
  return (
    <Modal title={c.title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={'btn ' + (c.danger ? 'dng' : 'pri')} onClick={() => { onClose(); c.onOk(); }}>{c.label || 'Confirm'}</button></>}>
      <div>{c.body}</div>
    </Modal>
  );
}

export function AuditList({ items, empty = 'No activity yet.' }) {
  if (!items.length) return <Empty title={empty} />;
  return (
    <ul className="timeline">
      {items.map((a) => <li key={a.id}><div className="t">{fmtStamp(a.at)} · {a.actor}{a.role ? ' (' + a.role + ')' : ''} · <span className="mono">{a.entityId}</span></div><b>{a.action}</b>{a.detail ? <div className="muted">{a.detail}</div> : null}</li>)}
    </ul>
  );
}
export { fmtUSD, fmtDate };
