// Derived money: every total is computed from records. Integer cents throughout.
import { TODAY, daysBetween, sum, monthKey, fmtUSD, fmtDate } from './util.js';
import { STAGE_REQ, CHECKLIST_LABELS, DEAL_EVIDENCE } from './seed.js';

export function obCalc(db, ob) {
  const adjs = db.adjustments.filter((a) => a.obId === ob.id);
  const ap = adjs.filter((a) => a.status === 'Approved');
  const pend = adjs.filter((a) => a.status === 'Pending');
  const awaiting = ob.triggerState === 'Awaiting';
  if (ob.principalCents == null) {
    return { unknown: true, adjusted: null, cash: 0, noncash: 0, outstanding: null, debits: 0, credits: 0, writeoffs: 0, pend, awaiting, daysPastDue: 0, age: null, status: 'Exception', partial: false };
  }
  const debits = sum(ap.filter((a) => a.kind === 'Debit'), (a) => a.amountCents);
  const credits = sum(ap.filter((a) => a.kind === 'Credit'), (a) => a.amountCents);
  const writeoffs = sum(ap.filter((a) => a.kind === 'Writeoff'), (a) => a.amountCents);
  const adjusted = ob.principalCents + debits - credits - writeoffs;
  const cash = sum(db.allocations.filter((a) => a.obId === ob.id && a.status === 'Active'), (a) => a.amountCents);
  const noncash = sum(db.noncash.filter((n) => n.obId === ob.id && n.status === 'Approved'), (n) => n.amountCents);
  const outstanding = Math.max(0, adjusted - cash - noncash);
  const daysPastDue = !awaiting && ob.dueDate && outstanding > 0 ? Math.max(0, daysBetween(ob.dueDate, TODAY) - db.settings.graceDays) : 0;
  const age = ob.activeFrom ? daysBetween(ob.activeFrom, TODAY) : null;
  const partial = (cash > 0 || noncash > 0) && outstanding > 0;
  let status;
  if (outstanding === 0) status = writeoffs > 0 ? 'Settled – adjusted' : 'Settled';
  else if (awaiting) status = 'Awaiting trigger';
  else if (daysPastDue > 0) status = 'Overdue';
  else if (partial) status = 'Partially paid';
  else status = 'Current';
  return { unknown: false, adjusted, cash, noncash, outstanding, debits, credits, writeoffs, pend, awaiting, daysPastDue, age, status, partial };
}

export function rcCalc(db, r) {
  const allocated = sum(db.allocations.filter((a) => a.receiptId === r.id && a.status === 'Active'), (a) => a.amountCents);
  const refunded = r.refundedCents || 0;
  const counts = r.state === 'Verified' && r.kind !== 'contra';
  const available = counts ? Math.max(0, r.amountCents - allocated - refunded) : 0;
  return { allocated, refunded, available, counts };
}

export function caseRecon(db, caseId) {
  const issues = [];
  const obIds = db.obligations.filter((o) => o.caseId === caseId).map((o) => o.id);
  const seen = {};
  db.allocations.filter((a) => a.status === 'Active' && obIds.includes(a.obId)).forEach((a) => {
    if (seen[a.receiptId]) return; seen[a.receiptId] = 1;
    const r = db.receipts.find((x) => x.id === a.receiptId);
    const qb = r && r.qboRef && db.qbo.find((x) => x.id === r.qboRef);
    if (!qb) issues.push(`${a.receiptId} has no matched QBO deposit`);
    else if (!['Matched', 'Resolved'].includes(qb.state)) issues.push(`${a.receiptId} vs ${qb.id}: ${qb.state.toLowerCase()}${qb.differenceCents ? ' (' + fmtUSD(qb.differenceCents) + ')' : ''}`);
  });
  db.qbo.filter((q) => q.mappedCaseIds.includes(caseId) && ['Unmatched', 'Review', 'Difference'].includes(q.state)).forEach((q) => {
    const msg = `${q.id}: ${q.state.toLowerCase()}`;
    if (!issues.some((i) => i.includes(q.id))) issues.push(msg);
  });
  return { ok: issues.length === 0, issues };
}

export function reconBuckets(db) {
  const tol = db.settings.matchToleranceCents;
  const unlinked = db.receipts.filter((r) => r.kind === 'receipt' && r.state === 'Verified' && !r.qboRef);
  const suggested = [], unmatched = [];
  db.qbo.filter((q) => q.state === 'Unmatched' && ['Deposit', 'Payment'].includes(q.type) && !q.voided).forEach((q) => {
    const cands = unlinked.filter((r) => r.recipient === q.company && !db.rejectedPairs.includes(q.id + '|' + r.id) &&
      (Math.abs(r.amountCents - q.amountCents) <= tol || (r.payerName.split(' ')[0] && q.memo.toLowerCase().includes(r.payerName.split(' ')[0].toLowerCase()) && Math.abs(r.amountCents - q.amountCents) <= q.amountCents * 0.1)))
      .map((r) => ({ r, exact: Math.abs(r.amountCents - q.amountCents) <= tol }));
    if (cands.length) suggested.push({ q, cands }); else unmatched.push(q);
  });
  db.qbo.filter((q) => q.state === 'Review').forEach((q) => unmatched.push(q));
  const differences = db.qbo.filter((q) => q.state === 'Difference');
  const resolved = db.qbo.filter((q) => ['Matched', 'Resolved'].includes(q.state));
  const appOnly = unlinked;
  const exceptions = suggested.length + unmatched.length + differences.length + appOnly.length;
  return { suggested, unmatched, differences, resolved, appOnly, exceptions };
}

export function closureCheck(db, caseId) {
  const blockers = [];
  const c = db.cases.find((x) => x.id === caseId);
  if (!c) return { ok: false, blockers: ['Case not found'] };
  if (c.finClosed) blockers.push('Already financially closed');
  const obs = db.obligations.filter((o) => o.caseId === caseId);
  if (!obs.length) blockers.push('No obligations exist to close');
  obs.forEach((o) => {
    const x = obCalc(db, o);
    if (x.unknown) blockers.push(`${o.id}: amount unknown`);
    else if (x.outstanding > 0) blockers.push(`${o.id} still has ${fmtUSD(x.outstanding)} outstanding`);
    if (x.pend.length) blockers.push(`${o.id}: adjustment approval pending`);
  });
  db.agreements.filter((a) => a.caseId === caseId && a.status !== 'Verified').forEach((a) => blockers.push(`${a.id} is not verified`));
  caseRecon(db, caseId).issues.forEach((i) => blockers.push('Reconciliation: ' + i));
  if (db.approvals.some((a) => a.kind === 'Closure' && a.status === 'Pending' && a.refId === caseId)) blockers.push('A closure approval is already pending');
  return { ok: blockers.length === 0, blockers };
}

export function policyMismatch(p) {
  const req = STAGE_REQ[p.stage] || [];
  const missing = req.filter((k) => !p.checklist[k]);
  const overridden = (p.overrides || []).some((o) => o.stage === p.stage);
  return { missing: missing.map((k) => CHECKLIST_LABELS[k]), keys: missing, warn: missing.length > 0 && !overridden, overridden: missing.length > 0 && overridden };
}
export const dealMissing = (deal) => DEAL_EVIDENCE.filter(([k]) => deal.evidence[k].status !== 'Verified').map(([, l]) => l);

function obNext(db, ob, x, c) {
  if (ob.manualNext) return ob.manualNext;
  if (x.unknown) return 'Verify the agreement';
  if (x.pend.length) return 'Approval pending: ' + x.pend[0].kind.toLowerCase();
  if (x.outstanding === 0) return c.finClosed ? 'None (financially closed)' : 'Review for financial closure';
  const rep = db.receipts.find((r) => r.state === 'Reported' && r.kind === 'receipt' && r.payerName === ob.debtorName);
  if (rep) return `Verify reported receipt ${rep.id}`;
  if (x.awaiting) return ob.reviewDate ? 'Review on ' + fmtDate(ob.reviewDate) : 'Wait for ' + ob.trigger.toLowerCase();
  if (ob.disputed) return 'Resolve client dispute';
  if (ob.category === 'Property proceeds') return 'Chase title company for proceeds';
  if (ob.category === 'Policy exchange') return 'Request PS remittance to MFC';
  if (x.daysPastDue > 0 && ob.debtorType === 'Attorney') return 'Escalate attorney remittance';
  if (x.daysPastDue > 0) return 'Contact debtor; schedule follow-up';
  return 'Await payment due ' + fmtDate(ob.dueDate);
}

function clientFulfillment(db, c, d) {
  const ags = db.agreements.filter((a) => a.caseId === c.id && a.verifiedVersion);
  if (!ags.length) return db.agreements.some((a) => a.caseId === c.id) ? 'Unknown' : 'N/A';
  const comps = ags.flatMap((a) => a.versions.find((v) => v.v === a.verifiedVersion).components.filter((x) => x.clientSide && x.amountCents));
  if (!comps.length) return 'N/A';
  const st = comps.map((cp) => {
    if (db.fulfillment.some((f) => f.compId === cp.id)) return 'F';
    const o = db.obligations.find((x) => x.compId === cp.id);
    if (o && cp.direct) { const x = d.ob[o.id]; if (x.outstanding === 0) return x.writeoffs > 0 ? 'A' : 'F'; if (x.cash > 0) return 'P'; }
    return 'N';
  });
  if (st.every((s) => s === 'F')) return 'Fulfilled';
  if (st.every((s) => s === 'F' || s === 'A')) return 'Fulfilled – adjusted';
  return st.some((s) => s !== 'N') ? 'Partial' : 'Pending';
}

export function derive(db) {
  const d = { ob: {}, rc: {}, cs: {} };
  db.obligations.forEach((o) => { d.ob[o.id] = obCalc(db, o); });
  db.receipts.forEach((r) => { d.rc[r.id] = rcCalc(db, r); });
  db.cases.forEach((c) => {
    const obs = db.obligations.filter((o) => o.caseId === c.id);
    const recon = caseRecon(db, c.id);
    const calcs = obs.map((o) => d.ob[o.id]);
    const verAg = db.agreements.filter((a) => a.caseId === c.id && a.verifiedVersion);
    const hasDraft = db.agreements.some((a) => a.caseId === c.id && a.status !== 'Verified' && a.versions[a.currentVersion - 1].status === 'Draft');
    const exception = hasDraft && !verAg.length;
    const anyAdj = calcs.some((x) => x.writeoffs > 0);
    let fin;
    if (c.finClosed) fin = c.finClosedKind === 'Adjusted closure' ? 'Financially closed – adjusted' : 'Financially closed';
    else if (exception) fin = 'Exception: agreement unverified';
    else if (!obs.length) fin = 'No MFC receivable';
    else if (calcs.every((x) => x.outstanding === 0)) fin = recon.ok ? (anyAdj ? 'Settled – adjusted' : 'Settled') : 'Paid – reconciliation open';
    else if (calcs.some((x) => x.status === 'Overdue')) fin = 'Overdue';
    else if (calcs.some((x) => x.partial)) fin = 'Partially paid';
    else if (calcs.some((x) => x.status === 'Current')) fin = 'Current';
    else fin = 'Awaiting trigger';
    let agreed = null;
    if (verAg.length) agreed = sum(verAg, (a) => a.versions.find((v) => v.v === a.verifiedVersion).grossFeeCents || 0);
    const first = obs.find((o) => d.ob[o.id].outstanding > 0) || obs[0];
    d.cs[c.id] = {
      obIds: obs.map((o) => o.id), recon, exception, fin, agreed,
      mfcCash: sum(calcs, (x) => x.cash), collectible: sum(obs.filter((o) => o.triggerState === 'Active'), (o) => d.ob[o.id].outstanding || 0),
      conditional: sum(obs.filter((o) => o.triggerState === 'Awaiting'), (o) => d.ob[o.id].outstanding || 0),
      outstanding: sum(calcs, (x) => x.outstanding || 0), client: null,
      next: exception ? 'Complete and verify the agreement' : first ? obNext(db, first, d.ob[first.id], c) : 'No financial action',
      patients: c.patientIds.map((id) => (db.patients.find((p) => p.id === id) || {}).name).join(' & '),
    };
  });
  db.cases.forEach((c) => { d.cs[c.id].client = clientFulfillment(db, c, d); });
  db.obligations.forEach((o) => { d.ob[o.id].next = obNext(db, o, d.ob[o.id], db.cases.find((c) => c.id === o.caseId)); });

  // ----- KPIs (MFC creditor only; no double counting of attorney/PS pass-through) -----
  const known = db.obligations.filter((o) => o.creditor === 'MFC' && !d.ob[o.id].unknown);
  const collectible = sum(known.filter((o) => o.triggerState === 'Active'), (o) => d.ob[o.id].outstanding);
  const conditional = sum(known.filter((o) => o.triggerState === 'Awaiting'), (o) => d.ob[o.id].outstanding);
  const overdue = sum(known, (o) => (d.ob[o.id].daysPastDue > 0 ? d.ob[o.id].outstanding : 0));
  const live = db.receipts.filter((r) => r.kind === 'receipt' && r.state === 'Verified');
  const mk = monthKey(TODAY);
  const cashMonth = sum(live.filter((r) => r.recipient === 'MFC' && r.currency === 'USD' && monthKey(r.receivedDate) === mk), (r) => r.amountCents);
  const groupExternal = sum(live.filter((r) => !r.internal && r.currency === 'USD' && monthKey(r.receivedDate) === mk), (r) => r.amountCents);
  const internalMonth = sum(live.filter((r) => r.internal && r.currency === 'USD' && monthKey(r.receivedDate) === mk), (r) => r.amountCents);
  const unapplied = sum(live.filter((r) => r.recipient === 'MFC' && r.currency === 'USD'), (r) => d.rc[r.id].available);
  const unappliedOther = sum(live.filter((r) => (r.recipient !== 'MFC') && r.currency === 'USD'), (r) => d.rc[r.id].available);
  const unappliedFx = sum(live.filter((r) => r.currency !== 'USD'), (r) => d.rc[r.id].available);
  const rb = reconBuckets(db);
  const buckets = [['Not yet due', 0, 0], ['1–30 days', 1, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90], ['Over 90 days', 91, 9999]].map(([label, lo, hi]) => {
    const items = known.filter((o) => { const x = d.ob[o.id]; if (o.triggerState !== 'Active' || x.outstanding === 0) return false; return lo === 0 ? x.daysPastDue === 0 : x.daysPastDue >= lo && x.daysPastDue <= hi; });
    return { label, cents: sum(items, (o) => d.ob[o.id].outstanding), count: items.length };
  });
  const byDebtor = {};
  known.forEach((o) => { const x = d.ob[o.id]; if (x.outstanding > 0) { const k = o.debtorType; byDebtor[k] = byDebtor[k] || { collectible: 0, conditional: 0 }; byDebtor[k][o.triggerState === 'Active' ? 'collectible' : 'conditional'] += x.outstanding; } });
  const exceptionsCases = db.cases.filter((c) => d.cs[c.id].exception).map((c) => c.id);
  d.k = { collectible, conditional, overdue, cashMonth, groupExternal, internalMonth, unapplied, unappliedOther, unappliedFx, reconExceptions: rb.exceptions, buckets, byDebtor, exceptionsCases, recon: rb };
  d.queue = buildQueue(db, d);
  return d;
}

function buildQueue(db, d) {
  const q = [];
  db.approvals.filter((a) => a.status === 'Pending').forEach((a) => q.push({ prio: 100, kind: 'Approval', label: `Decide ${a.kind.toLowerCase()}: ${a.summary}`, owner: a.kind === 'Refund' || a.kind === 'Closure' ? 'CEO / Accounting' : 'CEO', cents: a.amountCents, link: { view: 'tasks', params: { tab: 'approvals' } } }));
  db.receipts.filter((r) => d.rc[r.id].available > 0 && r.recipient === 'MFC' && r.currency === 'USD').forEach((r) => q.push({ prio: 90, kind: 'Allocate', label: `Allocate ${r.id} (${r.payerName}): ${fmtUSD(d.rc[r.id].available)} available`, owner: 'Accounting Lead', cents: d.rc[r.id].available, link: { view: 'receipts', params: { allocate: r.id } } }));
  db.obligations.forEach((o) => { const x = d.ob[o.id]; if (x.daysPastDue > 0) q.push({ prio: 80 + Math.min(9, Math.floor(x.outstanding / 100000)), kind: 'Overdue', label: `Collect ${o.debtorName}: ${fmtUSD(x.outstanding)} is ${x.daysPastDue} days past due`, owner: o.owner, cents: x.outstanding, link: { view: 'cases', params: { caseId: o.caseId, tab: 'financials' } } }); });
  db.receipts.filter((r) => r.state === 'Reported' && r.kind === 'receipt').forEach((r) => q.push({ prio: 78, kind: 'Verify', label: `Verify reported receipt ${r.id} (${r.payerName}, ${fmtUSD(r.amountCents, r.currency)})`, owner: 'Accounting Lead', cents: r.amountCents, link: { view: 'receipts', params: { focus: r.id } } }));
  db.deals.filter((s) => s.closingVerified && s.obId && d.ob[s.obId].outstanding > 0).forEach((s) => q.push({ prio: 76, kind: 'Proceeds', label: `${s.id} closed; ${fmtUSD(d.ob[s.obId].outstanding)} proceeds not yet received`, owner: 'Property Coordinator', cents: d.ob[s.obId].outstanding, link: { view: 'ss', params: { id: s.id } } }));
  if (d.k.reconExceptions) q.push({ prio: 74, kind: 'Reconcile', label: `${d.k.reconExceptions} reconciliation exception${d.k.reconExceptions > 1 ? 's' : ''} against simulated QBO`, owner: 'Reconciliation Lead', cents: null, link: { view: 'recon', params: {} } });
  d.k.exceptionsCases.forEach((id) => q.push({ prio: 72, kind: 'Agreement', label: `${id}: signed agreement is not verified; amount shows Unknown`, owner: 'Intake Coordinator', cents: null, link: { view: 'cases', params: { caseId: id, tab: 'financials' } } }));
  db.policies.filter((p) => policyMismatch(p).warn).forEach((p) => q.push({ prio: 66, kind: 'Policy', label: `${p.id}: stage and checklist mismatch needs evidence or override`, owner: 'Policy Coordinator', cents: null, link: { view: 'ps', params: { id: p.id } } }));
  db.cases.forEach((c) => { if (!c.finClosed && d.cs[c.id].obIds.length && closureCheck(db, c.id).ok) q.push({ prio: 64, kind: 'Closure', label: `${c.id} (${d.cs[c.id].patients}) is ready for financial closure`, owner: 'Accounting Lead', cents: null, link: { view: 'cases', params: { caseId: c.id, tab: 'financials' } } }); });
  return q.sort((a, b) => b.prio - a.prio || (b.cents || 0) - (a.cents || 0));
}

export function collectionRows(db, d) {
  const rows = [];
  db.obligations.forEach((o) => {
    const x = d.ob[o.id]; const c = db.cases.find((k) => k.id === o.caseId);
    rows.push({ key: o.id, id: o.id, ex: false, caseId: o.caseId, patients: d.cs[o.caseId].patients, debtorType: o.debtorType, debtorName: o.debtorName, creditor: 'MFC', entity: o.entity, category: o.category, adjusted: x.adjusted, cash: x.cash, noncash: x.noncash, outstanding: x.outstanding, dueDate: o.dueDate, trigger: o.trigger, triggerState: o.triggerState, age: x.age, daysPastDue: x.daysPastDue, owner: o.owner, next: x.next, status: x.status, opStatus: c.opStatus, disputed: o.disputed, evidenceMissing: o.evidence !== 'Complete', collateral: !!o.collateral, closed: c.opStatus === 'Closed', pendingAdj: x.pend.length > 0 });
  });
  db.cases.forEach((c) => {
    if (d.cs[c.id].exception) rows.push({ key: 'EX-' + c.id, id: 'EX-' + c.id, ex: true, caseId: c.id, patients: d.cs[c.id].patients, debtorType: 'Client', debtorName: d.cs[c.id].patients, creditor: 'MFC', entity: 'MFC', category: 'Unverified agreement', adjusted: null, cash: 0, noncash: 0, outstanding: null, dueDate: null, trigger: 'Agreement not verified', triggerState: 'Unknown', age: null, daysPastDue: 0, owner: c.financialOwner, next: 'Complete and verify the agreement', status: 'Exception', opStatus: c.opStatus, disputed: false, evidenceMissing: true, collateral: false, closed: false, pendingAdj: false });
  });
  return rows;
}
