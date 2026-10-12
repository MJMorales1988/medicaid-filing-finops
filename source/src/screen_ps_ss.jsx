import { fmtDate, fmtUSD, TODAY, toCents } from './util.js';
import { POLICY_STAGES, DEAL_STAGES, DEAL_EVIDENCE, CHECKLIST_LABELS } from './seed.js';
import { policyMismatch, dealMissing } from './calc.js';
import * as A2 from './actions2.js';
import { useApp, Panel, Tabs, Badge, StatusBadge, Money, Modal, Field, MoneyInput, Select, Callout, Empty, Btn, CaseLink, KV } from './ui_core.jsx';
const { useState } = React;

function LinkedObligation({ obId }) {
  const { db, d, go } = useApp();
  const o = obId && db.obligations.find((x) => x.id === obId);
  if (!o) return <span className="muted">No obligation yet</span>;
  const x = d.ob[o.id];
  return <span><button className="btn sm" onClick={() => go('cases', { caseId: o.caseId, tab: 'financials', ob: o.id })}>{o.id}</button> <StatusBadge s={x.status} /> outstanding <Money c={x.outstanding} /> · MFC cash <Money c={x.cash} /></span>;
}

function PolicyDrawer({ id, onClose }) {
  const { db, d, act, doc, go } = useApp();
  const p = db.policies.find((x) => x.id === id);
  const [ev, setEv] = useState(''); const [bev, setBev] = useState(''); const [ov, setOv] = useState(''); const [needOv, setNeedOv] = useState(null);
  const [prem, setPrem] = useState({ amt: '', note: '' }); const [claim, setClaim] = useState('');
  const [target, setTarget] = useState(p.stage);
  const mm = policyMismatch(p); const idx = POLICY_STAGES.findIndex((s) => s[0] === p.stage);
  const move = () => { const r = act(A2.setPolicyStage, { id: p.id, stage: target, override: ov }, { silent: false }); if (!r.ok && r.needsOverride) setNeedOv(r.missing); else { setNeedOv(null); setOv(''); } };
  const ag = db.agreements.find((a) => a.id === p.agId);
  return (
    <Modal side title={`${p.id} · ${p.carrier}`} sub={<span>Policy {p.policyNo} · case <CaseLink id={p.caseId} /> · agreement {p.agId || 'none yet'}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={() => go('cases', { caseId: p.caseId, tab: 'financials' })}>Open case financials</button><button className="btn" onClick={onClose}>Close</button></>}>
      {mm.warn ? <Callout tone="warn"><b>Stage and checklist mismatch.</b> At {POLICY_STAGES[idx][1]}, still missing: {mm.missing.join(', ')}. Add the evidence below or record an override with a reason.</Callout> : null}
      {mm.overridden ? <Callout tone="info">Mismatch overridden: {p.overrides[p.overrides.length - 1].reason} ({p.overrides[p.overrides.length - 1].by}).</Callout> : null}
      <Panel title="Policy values (kept separate)"><KV items={[['Face value', <Money c={p.faceCents} />], ['Cash value', <Money c={p.cashValueCents} />], ['Agreed exchange value', <Money c={p.exchangeValueCents} />], ['Cash purchase (PS pays client)', <Money c={p.cashPurchaseCents} />]]} />
        <p className="muted sm" style={{ margin: '10px 0 0' }}>Only the agreed exchange value can create a PS-to-MFC obligation. Cash purchase is money PS pays the client. Neither face nor cash value is an MFC receivable.</p></Panel>
      <Panel title="Financial links"><div style={{ display: 'grid', gap: 6 }}><div>Obligation: <LinkedObligation obId={p.obId} /></div><div className="muted sm">Ownership confirmation fulfills the client component and (by configured rule) creates a separate PS-to-MFC obligation. It never creates MFC cash. {ag ? '' : 'No agreement is linked yet.'}</div></div></Panel>
      <Panel title="Stage">
        <div className="row"><Select aria-label="Move to stage" value={target} onChange={(v) => { setTarget(v); setNeedOv(null); }} options={POLICY_STAGES} style={{ width: 'auto' }} /><Btn perm="policyWork" onClick={move} disabled={target === p.stage}>Move stage</Btn></div>
        {needOv ? <div style={{ marginTop: 10 }}><Callout tone="warn">Missing: {needOv.join(', ')}. Add evidence, or enter a reason to override.</Callout><div className="row" style={{ marginTop: 8 }}><input type="text" aria-label="Override reason" placeholder="Override reason" value={ov} onChange={(e) => setOv(e.target.value)} style={{ flex: '1 1 240px' }} /><Btn perm="policyWork" onClick={move}>Move with override</Btn></div></div> : null}
        <p className="muted sm" style={{ margin: '8px 0 0' }}>Moving to Ownership confirmed requires the evidence step below.</p>
      </Panel>
      <Panel title="Evidence">
        <div className="tw"><table><tbody>
          {[['ownership', 'Ownership evidence'], ['beneficiary', 'Beneficiary evidence']].map(([k, l]) => <tr key={k}><td>{l}</td><td><StatusBadge s={p.evidence[k].status} /></td><td>{p.evidence[k].note || <span className="muted">None</span>}</td><td>{p.evidence[k].docId ? <button className="btn sm" onClick={() => doc(p.evidence[k].docId)}>Preview</button> : null}</td></tr>)}
        </tbody></table></div>
        {p.evidence.ownership.status !== 'Verified' ? <div className="row" style={{ marginTop: 10 }}><input type="text" aria-label="Ownership evidence reference" placeholder="Ownership evidence reference (e.g. recorded assignment)" value={ev} onChange={(e) => setEv(e.target.value)} style={{ flex: '1 1 260px' }} /><Btn kind="pri" perm="policyWork" onClick={() => { const r = act(A2.confirmOwnership, { id: p.id, evidence: ev }); if (r.ok) setEv(''); }}>Confirm ownership</Btn></div> : null}
        {p.evidence.beneficiary.status !== 'Verified' ? <div className="row" style={{ marginTop: 10 }}><input type="text" aria-label="Beneficiary evidence reference" placeholder="Beneficiary evidence reference" value={bev} onChange={(e) => setBev(e.target.value)} style={{ flex: '1 1 260px' }} /><Btn perm="policyWork" onClick={() => { const r = act(A2.setPolicyEvidence, { id: p.id, note: bev }); if (r.ok) setBev(''); }}>Record beneficiary evidence</Btn></div> : null}
      </Panel>
      <Panel title="Stage checklist">
        <div style={{ display: 'grid', gap: 6 }}>{Object.entries(CHECKLIST_LABELS).map(([k, l]) => <label key={k} className="row"><input type="checkbox" checked={!!p.checklist[k]} disabled={k === 'ownershipEvidence' || k === 'beneficiaryUpdated'} onChange={() => act(A2.toggleChecklist, { id: p.id, key: k })} /> {l}{mm.keys.includes(k) ? <Badge tone="warn">Needed for this stage</Badge> : null}</label>)}</div>
      </Panel>
      <Panel title="Team and history">
        <KV items={[['Coordinator', p.team.coordinator], ['Agent', p.team.agent], ['Processor', p.team.processor]]} />
        <div style={{ marginTop: 12 }}><b className="sm">Premium history</b> {p.premiumHistory.length ? p.premiumHistory.map((h, i) => <div key={i} className="sm">{fmtDate(h.date)} · {fmtUSD(h.amountCents)} · {h.note}</div>) : <span className="muted sm">None</span>}</div>
        <div className="row" style={{ marginTop: 6 }}><MoneyInput aria-label="Premium amount" value={prem.amt} onChange={(v) => setPrem({ ...prem, amt: v })} style={{ width: 110 }} /><input type="text" aria-label="Premium note" placeholder="Note" value={prem.note} onChange={(e) => setPrem({ ...prem, note: e.target.value })} style={{ flex: '1 1 160px' }} /><Btn sm perm="policyWork" onClick={() => { const r = act(A2.logPolicyEvent, { id: p.id, kind: 'premium', amountCents: toCents(prem.amt), note: prem.note }); if (r.ok) setPrem({ amt: '', note: '' }); }}>Log premium</Btn></div>
        <div style={{ marginTop: 12 }}><b className="sm">Claim history</b> {p.claimHistory.length ? p.claimHistory.map((h, i) => <div key={i} className="sm">{fmtDate(h.date)} · {h.note}</div>) : <span className="muted sm">None</span>}</div>
        <div className="row" style={{ marginTop: 6 }}><input type="text" aria-label="Claim note" placeholder="Claim note" value={claim} onChange={(e) => setClaim(e.target.value)} style={{ flex: '1 1 220px' }} /><Btn sm perm="policyWork" onClick={() => { const r = act(A2.logPolicyEvent, { id: p.id, kind: 'claim', note: claim }); if (r.ok) setClaim(''); }}>Add claim note</Btn></div>
        <p className="muted sm" style={{ margin: '8px 0 0' }}>Premium and claim entries are policy history only. They are not MFC receipts.</p>
      </Panel>
    </Modal>
  );
}

export function PolicySolutions({ params }) {
  const { db, d } = useApp();
  const [sel, setSel] = useState(params.id || null);
  return (
    <>
      <Callout tone="info">Policy Solutions pipeline. Dragging is not needed: open a policy to move its stage, confirm ownership and review evidence. Warnings mark policies whose stage is ahead of their checklist.</Callout>
      <Panel flush title="Ownership pipeline">
        <div className="board">{POLICY_STAGES.map(([k, l]) => { const items = db.policies.filter((p) => p.stage === k); return (
          <div key={k} className="col"><h4>{l}<span>{items.length}</span></h4>
            {items.map((p) => { const mm = policyMismatch(p); return <button key={p.id} className="pcard" onClick={() => setSel(p.id)}><span><b className="mono">{p.id}</b> · {d.cs[p.caseId].patients}</span><span className="muted sm">{p.carrier}</span><span>Exchange <Money c={p.exchangeValueCents} /></span>{mm.warn ? <Badge tone="warn">Checklist mismatch</Badge> : null}{p.obId ? <Badge tone="info">PS owes MFC</Badge> : null}</button>; })}
            {!items.length ? <div className="muted sm" style={{ padding: 6 }}>No policies</div> : null}</div>); })}</div>
      </Panel>
      {sel ? <PolicyDrawer key={sel} id={sel} onClose={() => setSel(null)} /> : null}
    </>
  );
}

function DealDrawer({ id, onClose }) {
  const { db, d, act, doc, go } = useApp();
  const s = db.deals.find((x) => x.id === id);
  const [cd, setCd] = useState(s.closingDate || '2026-10-12'); const [tc, setTc] = useState(s.titleCompany); const [pr, setPr] = useState(s.proceedsRecipient); const [st, setSt] = useState(s.stage);
  const miss = dealMissing(s); const o = s.obId && db.obligations.find((x) => x.id === s.obId); const x = o && d.ob[o.id];
  return (
    <Modal side title={`${s.id} · ${s.property.address}`} sub={<span>Case <CaseLink id={s.caseId} /> · obligation {s.obId || 'none yet'}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={() => go('cases', { caseId: s.caseId, tab: 'financials' })}>Open case financials</button><button className="btn" onClick={onClose}>Close</button></>}>
      <Panel title="Property value and MFC entitlement (separate)"><KV items={[['Property value', <Money c={s.property.valueCents} />], ['MFC entitlement', <Money c={s.entitlementCents} />], ['Closing', s.closingVerified ? 'Verified ' + fmtDate(s.closingDate) : 'Not verified']]} />
        <p className="muted sm" style={{ margin: '10px 0 0' }}>MFC is entitled to the agreed amount only. Property value is context and never counts as an MFC balance.</p></Panel>
      <Panel title="What kind of arrangement"><div className="row">
        <Badge tone={s.components.collateralLien ? 'info' : 'muted'}>{s.components.collateralLien ? 'Collateral lien (security, not payment)' : 'No collateral lien'}</Badge>
        <Badge tone={s.components.saleProceeds ? 'info' : 'muted'}>{s.components.saleProceeds ? 'Sale proceeds' : 'No sale proceeds'}</Badge>
        <Badge tone={s.components.titleTransfer ? 'info' : 'muted'}>{s.components.titleTransfer ? 'Title transfer' : 'No title transfer'}</Badge>
        <Badge tone={s.components.careNow ? 'info' : 'muted'}>{s.components.careNow ? 'CareNow' : 'Not CareNow'}</Badge></div></Panel>
      <Panel title="Financial position">{o ? <div style={{ display: 'grid', gap: 6 }}><div><StatusBadge s={x.status} /> outstanding <Money c={x.outstanding} /> · MFC cash <Money c={x.cash} /></div>
        <div className="muted sm">{o.triggerState === 'Awaiting' ? `Waiting for: ${o.trigger}. Not overdue.` : `Due ${fmtDate(o.dueDate)}. ${s.closingVerified && x.outstanding > 0 ? 'Closing is verified but proceeds have not been received by MFC.' : ''}`}</div></div> : <span className="muted">No obligation linked.</span>}</Panel>
      <Panel title="Evidence"><div className="tw"><table><tbody>{DEAL_EVIDENCE.map(([k, l]) => <tr key={k}><td>{l}</td><td><StatusBadge s={s.evidence[k].status} /></td><td>{s.evidence[k].docId ? <button className="btn sm" onClick={() => doc(s.evidence[k].docId)}>Preview</button> : <Btn sm perm="dealWork" onClick={() => act(A2.verifyDealEvidence, { id: s.id, key: k })}>Mark verified</Btn>}</td></tr>)}</tbody></table></div></Panel>
      <Panel title="Closing and proceeds">
        {s.closingVerified ? <Callout tone="ok">Closing verified {fmtDate(s.closingDate)}. The amount due is active. Financial settlement waits for a receipt and reconciliation.</Callout> : miss.length ? <Callout tone="warn">Closing cannot be verified yet. Missing evidence: {miss.join(', ')}.</Callout> : <Callout tone="info">All evidence is on file. Verify the closing to activate the configured amount due.</Callout>}
        <div className="form2" style={{ marginTop: 10 }}>
          <Field label="Closing date"><input type="date" max={TODAY} value={cd} onChange={(e) => setCd(e.target.value)} disabled={s.closingVerified} /></Field>
          <Field label="Title / escrow company"><input type="text" value={tc} onChange={(e) => setTc(e.target.value)} disabled={s.closingVerified} /></Field>
          <Field label="Actual proceeds recipient"><Select value={pr} onChange={setPr} options={[pr].concat(['Pending', 'MFC', 'Title company escrow', 'Client']).filter((v, i, a) => a.indexOf(v) === i)} /></Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}>{!s.closingVerified ? <Btn kind="pri" perm="dealWork" onClick={() => act(A2.verifyClosing, { id: s.id, closingDate: cd, titleCompany: tc, proceedsRecipient: pr })}>Verify closing</Btn> : null}<Btn perm="dealWork" onClick={() => act(A2.updateDeal, { id: s.id, patch: { proceedsRecipient: pr } })}>Save proceeds recipient</Btn></div>
        {s.feeAllocations.length ? <div className="tw" style={{ marginTop: 10 }}><table><thead><tr><th>Closing fee allocation</th><th className="num">Amount</th></tr></thead><tbody>{s.feeAllocations.map((a) => <tr key={a.label}><td>{a.label}</td><td className="num"><Money c={a.amountCents} /></td></tr>)}</tbody></table></div> : null}
        <div className="muted sm" style={{ marginTop: 6 }}>Actual proceeds recipient: <b>{s.proceedsRecipient}</b></div>
      </Panel>
      <Panel title="Stage"><div className="row"><Select aria-label="Deal stage" value={st} onChange={setSt} options={DEAL_STAGES} style={{ width: 'auto' }} /><Btn perm="dealWork" disabled={st === s.stage} onClick={() => act(A2.setDealStage, { id: s.id, stage: st })}>Move stage</Btn></div></Panel>
    </Modal>
  );
}

export function SimplySold({ params }) {
  const { db, d } = useApp();
  const [sel, setSel] = useState(params.id || null);
  return (
    <>
      <Callout tone="info">Simply Sold deal pipeline. A verified closing makes the configured amount due. It does not mean MFC has been paid.</Callout>
      <Panel flush title="Deal pipeline">
        <div className="board">{DEAL_STAGES.map(([k, l]) => { const items = db.deals.filter((s) => s.stage === k); return (
          <div key={k} className="col"><h4>{l}<span>{items.length}</span></h4>
            {items.map((s) => { const x = s.obId && d.ob[s.obId]; return <button key={s.id} className="pcard" onClick={() => setSel(s.id)}><span><b className="mono">{s.id}</b> · {d.cs[s.caseId].patients}</span><span className="muted sm">{s.property.address}</span><span>Value <Money c={s.property.valueCents} /></span><span>MFC entitlement <Money c={s.entitlementCents} /></span>{s.closingVerified && x && x.outstanding > 0 ? <Badge tone="warn">Closed, proceeds not received</Badge> : null}{x && x.awaiting ? <Badge tone="info">Awaiting sale trigger</Badge> : null}</button>; })}
            {!items.length ? <div className="muted sm" style={{ padding: 6 }}>No deals</div> : null}</div>); })}</div>
      </Panel>
      {sel ? <DealDrawer key={sel} id={sel} onClose={() => setSel(null)} /> : null}
    </>
  );
}
