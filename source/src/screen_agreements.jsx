import { fmtDate, fmtUSD, toCents, centsToInput, TODAY, fmtStamp } from './util.js';
import { OWNERS } from './seed.js';
import * as A2 from './actions2.js';
import { useApp, Panel, Tabs, Badge, StatusBadge, Money, Modal, Field, MoneyInput, Select, Callout, Empty, Btn, CaseLink, KV, usePaged, Pager } from './ui_core.jsx';
const { useState, useMemo } = React;

const KIND = {
  'Cash fee': { createsAt: 'verify', category: 'Direct fee', debtorType: 'Client', direct: true, clientSide: true, trigger: 'Due date' },
  'Attorney-collected fee': { createsAt: 'verify', category: 'Attorney remittance', debtorType: 'Attorney', direct: false, clientSide: true, trigger: 'Due date' },
  'Policy exchange': { createsAt: 'ownership', category: 'Policy exchange', debtorType: 'Policy Solutions', direct: false, clientSide: true, trigger: 'Ownership confirmed' },
  'Property proceeds': { createsAt: 'verify', category: 'Property proceeds', debtorType: 'Title/Escrow', direct: false, clientSide: true, trigger: 'Closing verified' },
  'Title transfer': { createsAt: 'verify', category: 'Title transfer', debtorType: 'Title/Escrow', direct: false, clientSide: true, trigger: 'Closing verified' },
  'Legal fee': { createsAt: 'none', category: '', debtorType: 'Attorney', direct: false, clientSide: false, trigger: 'Due date' },
  'Cash purchase': { createsAt: 'none', category: '', debtorType: 'Policy Solutions', direct: false, clientSide: false, trigger: 'Due date' },
};
const TYPES = [['engagement', 'Engagement'], ['renewal', 'Renewal'], ['CareNow', 'CareNow'], ['annuity', 'Annuity'], ['policy purchase', 'Policy purchase']];
const blankComp = (kind = 'Cash fee') => ({ kind, label: '', amt: '', debtorName: '', dueDate: '', ...KIND[kind] });

function toForm(a, caseId) {
  if (!a) return { agId: null, caseId, type: 'engagement', signedDate: '', parties: 'MFC, ', gross: '', legal: '', terms: '', unknownReason: '', comps: [blankComp()] };
  const v = a.versions[a.currentVersion - 1];
  return { agId: a.id, caseId: a.caseId, type: a.type, signedDate: v.signedDate || '', parties: v.parties.join(', '), gross: centsToInput(v.grossFeeCents), legal: centsToInput(v.legalFeeCents), terms: v.terms, unknownReason: v.unknownReason, comps: v.components.map((c) => ({ ...c, amt: centsToInput(c.amountCents) })) };
}
function fromForm(f) {
  const g = toCents(f.gross); const l = toCents(f.legal);
  const comps = f.comps.map((c) => { const { amt, ...rest } = c; return { ...rest, amountCents: toCents(amt), label: c.label || c.kind, dueDate: c.trigger === 'Due date' ? c.dueDate || null : null, collateral: c.kind === 'Property proceeds' ? (c.collateral || { type: 'Deed of Trust', desc: 'Deed of trust (details at closing)' }) : null }; });
  return { agId: f.agId, caseId: f.caseId, type: f.type, signedDate: f.signedDate || null, parties: f.parties.split(',').map((x) => x.trim()).filter(Boolean), grossFeeCents: Number.isNaN(g) ? null : g, legalFeeCents: Number.isNaN(l) || l == null ? 0 : l, components: comps, terms: f.terms, unknownReason: f.unknownReason };
}
function missingList(v, reviewer, drafter, rule) {
  const m = [];
  if (!v.signedDate) m.push('Signed date'); if (v.parties.length < 2) m.push('At least two parties'); if (v.grossFeeCents == null) m.push('Gross fee amount');
  v.components.forEach((c) => { if (c.amountCents == null) m.push(`Amount for "${c.label || c.kind}"`); if (c.createsAt !== 'none' && c.trigger === 'Due date' && !c.dueDate) m.push(`Due date for "${c.label || c.kind}"`); });
  if (!v.docId) m.push('Signed EA document'); if (!reviewer) m.push('Reviewer'); else if (rule && reviewer === drafter) m.push('A reviewer other than the drafter');
  return m;
}

function DraftForm({ a, caseId, onClose }) {
  const { db, act } = useApp();
  const [f, setF] = useState(() => toForm(a, caseId || (db.cases[0] && db.cases[0].id)));
  const [e, setE] = useState('');
  const set = (k) => (v) => setF({ ...f, [k]: v && v.target ? v.target.value : v });
  const setC = (i, k, v) => setF({ ...f, comps: f.comps.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const setKind = (i, kind) => setF({ ...f, comps: f.comps.map((c, j) => (j === i ? { ...c, kind, ...KIND[kind] } : c)) });
  const save = () => { const r = act(A2.saveAgreementDraft, fromForm(f)); if (r.ok) onClose(r.id); else setE(r.error); };
  const unknown = !f.gross.trim() || f.comps.some((c) => !String(c.amt).trim());
  return (
    <Modal title={a ? `Edit draft ${a.id}` : 'New agreement draft'} sub="Unknown amounts are allowed in a draft with a reason. They show as Unknown, never as zero." wide onClose={() => onClose()}
      footer={<><button className="btn" onClick={() => onClose()}>Cancel</button><Btn kind="pri" perm="draftAgreement" onClick={save}>Save draft</Btn></>}>
      <div className="form2">
        <Field label="Case"><Select value={f.caseId} onChange={set('caseId')} disabled={!!a} options={db.cases.map((c) => [c.id, `${c.id} · ${c.label}`])} /></Field>
        <Field label="Type"><Select value={f.type} onChange={set('type')} options={TYPES} /></Field>
        <Field label="Signed date"><input type="date" max={TODAY} value={f.signedDate} onChange={set('signedDate')} /></Field>
        <Field label="Parties (comma separated)"><input type="text" value={f.parties} onChange={set('parties')} /></Field>
        <Field label="Gross fee" hint="Leave blank if unknown"><MoneyInput value={f.gross} onChange={set('gross')} /></Field>
        <Field label="Legal fees"><MoneyInput value={f.legal} onChange={set('legal')} /></Field>
      </div>
      <div><b>Components</b>
        {f.comps.map((c, i) => (
          <div key={i} className="panel" style={{ boxShadow: 'none', marginTop: 8, padding: 10 }}>
            <div className="form2">
              <Field label="Kind"><Select value={c.kind} onChange={(v) => setKind(i, v)} options={Object.keys(KIND)} /></Field>
              <Field label="Description"><input type="text" value={c.label} onChange={(x) => setC(i, 'label', x.target.value)} placeholder={c.kind} /></Field>
              <Field label="Amount" hint="Blank = unknown"><MoneyInput value={c.amt} onChange={(v) => setC(i, 'amt', v)} /></Field>
              <Field label="Owed by"><input type="text" value={c.debtorName} onChange={(x) => setC(i, 'debtorName', x.target.value)} /></Field>
              <Field label="Trigger"><Select value={c.trigger} onChange={(v) => setC(i, 'trigger', v)} options={['Due date', 'Ownership confirmed', 'Closing verified', 'Sale event']} /></Field>
              {c.trigger === 'Due date' && c.createsAt !== 'none' ? <Field label="Due date"><input type="date" value={c.dueDate || ''} onChange={(x) => setC(i, 'dueDate', x.target.value)} /></Field> : null}
            </div>
            <div className="row" style={{ marginTop: 6 }}><span className="muted sm">{c.createsAt === 'verify' ? 'Creates an obligation when verified' : c.createsAt === 'ownership' ? 'Creates a PS-to-MFC obligation when ownership is confirmed' : 'Does not create an MFC obligation'}</span>{f.comps.length > 1 ? <button className="btn sm dng" onClick={() => setF({ ...f, comps: f.comps.filter((_, j) => j !== i) })}>Remove</button> : null}</div>
          </div>))}
        <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setF({ ...f, comps: [...f.comps, blankComp('Cash fee')] })}>Add component</button></div>
      </div>
      <Field label="Terms and notes"><textarea value={f.terms} onChange={set('terms')} /></Field>
      {unknown ? <Field label="Reason an amount is unknown (required)"><input type="text" value={f.unknownReason} onChange={set('unknownReason')} /></Field> : null}
      {e ? <Callout tone="bad">{e}</Callout> : null}
    </Modal>
  );
}

function Detail({ id, onClose, onEdit }) {
  const { db, act, actor, doc, go } = useApp();
  const a = db.agreements.find((x) => x.id === id);
  const [tab, setTab] = useState('terms'); const [reviewer, setReviewer] = useState('Accounting Lead'); const [e, setE] = useState('');
  const [am, setAm] = useState({}); const [reason, setReason] = useState('');
  if (!a) return null;
  const v = a.versions[a.currentVersion - 1]; const isDraft = v.status === 'Draft';
  const miss = isDraft ? missingList(v, reviewer, v.draftedBy, db.settings.requireReviewerDifferent) : [];
  const verify = () => { const r = act(A2.verifyAgreement, { agId: a.id, reviewer }); if (!r.ok) setE(r.error); else setE(''); };
  const amend = () => { const changes = Object.entries(am).map(([compId, t]) => ({ compId, amountCents: toCents(t) })).filter((c) => c.amountCents != null && !Number.isNaN(c.amountCents)); const r = act(A2.submitAmendment, { agId: a.id, changes, reason }); if (r.ok) { setAm({}); setReason(''); setE(''); setTab('versions'); } else setE(r.error); };
  const verV = a.versions.find((x) => x.v === a.verifiedVersion);
  return (
    <Modal side title={`${a.id} · ${a.type}`} sub={<span>{a.caseId} · <StatusBadge s={a.status} /> · current v{a.currentVersion}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={() => go('cases', { caseId: a.caseId, tab: 'financials' })}>Open case financials</button>{isDraft ? <Btn perm="draftAgreement" onClick={onEdit}>Edit draft</Btn> : null}<button className="btn" onClick={onClose}>Close</button></>}>
      <Tabs label="Agreement sections" value={tab} onChange={setTab} tabs={[['terms', 'Terms'], ['verify', isDraft ? 'Verify' : 'Amend'], ['versions', 'Version history', a.versions.length]]} />
      {tab === 'terms' ? <>
        {isDraft ? <Callout tone="warn">Draft. It has no financial effect yet. {v.unknownReason ? 'Reason noted: ' + v.unknownReason : ''}</Callout> : null}
        <KV items={[['Signed', fmtDate(v.signedDate)], ['Parties', v.parties.join(', ') || <span className="unk">Unknown</span>], ['Gross fee', <Money c={v.grossFeeCents} />], ['Legal fees', <Money c={v.legalFeeCents} />], ['Signed EA', v.docId ? <a href="#" onClick={(x) => { x.preventDefault(); doc(v.docId); }}>Preview {v.docId}</a> : <span className="unk">Missing</span>], ['Drafted by', v.draftedBy]]} />
        <div className="tw"><table><thead><tr><th>Component</th><th className="num">Amount</th><th>Due / trigger</th><th>Obligation</th></tr></thead><tbody>
          {v.components.map((c) => <tr key={c.id}><td>{c.label}<div className="sub">{c.kind} · {c.debtorName || 'owed by: unknown'}</div></td><td className="num"><Money c={c.amountCents} /></td><td>{c.trigger === 'Due date' ? fmtDate(c.dueDate) : c.trigger}</td><td className="mono">{(db.obligations.find((o) => o.compId === c.id) || {}).id || '—'}</td></tr>)}
        </tbody></table></div>
        {v.terms ? <div className="muted">{v.terms}</div> : null}
      </> : null}
      {tab === 'verify' && isDraft ? <>
        <Callout tone="info">Verification needs a complete record and a reviewer. It creates each obligation exactly once.</Callout>
        <div className="row">{!v.docId ? <Btn perm="draftAgreement" onClick={() => act(A2.attachSignedEA, { agId: a.id })}>Attach signed EA (fictional preview)</Btn> : <Badge tone="ok">Signed EA attached</Badge>}</div>
        <Field label="Reviewer" hint={`Drafted by ${v.draftedBy}. You are acting as ${actor}.`}><Select value={reviewer} onChange={setReviewer} options={OWNERS} /></Field>
        <div><b>Verification checklist</b>{miss.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{miss.map((m) => <li key={m} style={{ color: 'var(--bad)' }}>Missing: {m}</li>)}</ul> : <div style={{ marginTop: 6 }}><Badge tone="ok">All required fields complete</Badge></div>}</div>
        {e ? <Callout tone="bad">{e}</Callout> : null}
        <div className="row"><Btn kind="pri" perm="verifyAgreement" onClick={verify}>Verify agreement and create obligations</Btn></div>
      </> : null}
      {tab === 'verify' && !isDraft ? <>
        {a.pending ? (() => { const pv = a.versions.find((x) => x.v === a.pending); return <>
          <Callout tone="warn"><b>Amendment v{pv.v} awaits review.</b> Submitted by {pv.draftedBy}. Reason: {pv.note}</Callout>
          <div className="tw"><table><thead><tr><th>Component</th><th className="num">Before</th><th className="num">After</th><th className="num">Delta</th><th>Obligation</th></tr></thead><tbody>{pv.deltas.map((d) => <tr key={d.compId}><td>{d.label}</td><td className="num"><Money c={d.before} /></td><td className="num"><Money c={d.after} /></td><td className="num"><Money c={d.delta} /></td><td className="mono">{d.obId || 'none yet'}</td></tr>)}</tbody></table></div>
          {e ? <Callout tone="bad">{e}</Callout> : null}
          <div className="row"><Btn kind="pri" perm="verifyAgreement" onClick={() => { const r = act(A2.reviewAmendment, { agId: a.id, decision: 'Approve' }); if (!r.ok) setE(r.error); }}>Approve and post deltas</Btn><Btn kind="dng" perm="verifyAgreement" onClick={() => act(A2.reviewAmendment, { agId: a.id, decision: 'Reject' })}>Reject amendment</Btn></div>
          <div className="muted sm">The submitter cannot review their own amendment. Switch role to approve.</div></>; })() : <>
          <Callout tone="info">Verified versions are locked. An amendment creates a new version, keeps v{a.verifiedVersion} on record, and posts reviewed deltas as approved adjustments. It never rewrites the original principal.</Callout>
          {verV.components.filter((c) => c.amountCents != null).map((c) => <Field key={c.id} label={`${c.label} (now ${fmtUSD(c.amountCents)})`}><MoneyInput value={am[c.id] != null ? am[c.id] : ''} onChange={(t) => setAm({ ...am, [c.id]: t })} placeholder="New amount (blank = no change)" /></Field>)}
          <Field label="Reason for amendment"><input type="text" value={reason} onChange={(x) => setReason(x.target.value)} /></Field>
          {e ? <Callout tone="bad">{e}</Callout> : null}
          <div className="row"><Btn kind="pri" perm="amendAgreement" onClick={amend}>Submit amendment for review</Btn></div></>}
      </> : null}
      {tab === 'versions' ? <ul className="timeline">{[...a.versions].reverse().map((x) => <li key={x.v}><div className="t">v{x.v} · {x.status}{x.verifiedAt ? ' · verified ' + fmtStamp(x.verifiedAt) + ' by ' + x.verifiedBy : ''}</div><b>Gross fee {fmtUSD(x.grossFeeCents)}</b> · drafted by {x.draftedBy}{x.note ? <div className="muted">{x.note}</div> : null}{x.deltas && x.deltas.length ? <div className="muted sm">Deltas: {x.deltas.map((d) => `${d.label} ${fmtUSD(d.before)} to ${fmtUSD(d.after)}`).join('; ')}</div> : null}</li>)}</ul> : null}
    </Modal>
  );
}

export default function Agreements({ params }) {
  const { db, d, can } = useApp();
  const [f, setF] = useState({ type: '', status: '' });
  const [sel, setSel] = useState(params.id || null); const [edit, setEdit] = useState(null);
  const rows = db.agreements.filter((a) => (!f.type || a.type === f.type) && (!f.status || a.status === f.status));
  const pg = usePaged(rows, 15);
  return (
    <>
      <Panel flush title="Agreements" actions={<Btn kind="pri" perm="draftAgreement" onClick={() => setEdit({ a: null })}>New draft</Btn>}>
        <div className="filters">
          <label className="field"><span className="lab">Type</span><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[['', 'Any']].concat(TYPES)} /></label>
          <label className="field"><span className="lab">Status</span><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['', 'Any'], 'Verified', 'Draft']} /></label>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Agreement</th><th>Case</th><th>Type</th><th>Status</th><th>Version</th><th>Signed</th><th className="num">Gross fee</th><th>Signed EA</th><th>Obligations</th><th /></tr></thead>
          <tbody>{pg.items.map((a) => { const v = a.versions[a.currentVersion - 1]; const obs = db.obligations.filter((o) => o.agId === a.id);
            return <tr key={a.id} className="click" onClick={() => setSel(a.id)}>
              <td className="mono">{a.id}</td><td><CaseLink id={a.caseId} /><div className="sub">{d.cs[a.caseId].patients}</div></td><td>{a.type}</td>
              <td><StatusBadge s={a.status} />{a.pending ? <div><Badge tone="warn">Amendment pending</Badge></div> : null}</td><td>v{a.currentVersion}</td><td>{fmtDate(v.signedDate)}</td>
              <td className="num"><Money c={v.grossFeeCents} /></td><td>{v.docId ? <Badge tone="ok">On file</Badge> : <Badge tone="bad">Missing</Badge>}</td><td className="mono">{obs.map((o) => o.id).join(', ') || <span className="muted">None yet</span>}</td>
              <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); setSel(a.id); }}>Open</button></td></tr>; })}</tbody>
        </table>{!pg.items.length ? <Empty title="No agreements match" /> : null}</div>
        <Pager p={pg} />
      </Panel>
      {sel ? <Detail id={sel} onClose={() => setSel(null)} onEdit={() => setEdit({ a: db.agreements.find((x) => x.id === sel) })} /> : null}
      {edit ? <DraftForm a={edit.a} onClose={(id) => { setEdit(null); if (id) setSel(id); }} /> : null}
    </>
  );
}
