// Mutations (pure on a cloned db): receipts, allocations, adjustments, approvals, closure, collections.
import { TODAY, stamp, nextId, sum, fmtUSD, clone, addDays } from './util.js';
import { obCalc, rcCalc, closureCheck, caseRecon } from './calc.js';

export const err = (error, extra = {}) => ({ ok: false, error, ...extra });
export function audit(db, ctx, o) {
  db.seq.AU += 1;
  db.audit.unshift({ id: 'AU-' + db.seq.AU, at: stamp(), actor: ctx.actor, role: ctx.role || '', caseId: null, ...o });
}
// Runs one action against a clone; returns the new db only when the action succeeds.
export function runAct(db, fn, p, ctx) {
  if (fn.perm && ctx.can && !ctx.can(fn.perm)) return { db, res: err(`Your role (${ctx.role}) is not permitted to do this. Switch role or ask the CEO to change permissions in Settings.`) };
  const nd = clone(db);
  let res;
  try { res = fn(nd, p || {}, ctx) || { ok: true }; } catch (e) { res = err('Unexpected error: ' + e.message); }
  return res.ok ? { db: nd, res } : { db, res };
}
const caseOfOb = (db, obId) => (db.obligations.find((o) => o.id === obId) || {}).caseId || null;

// ---------- Receipts ----------
export function recordReceipt(db, p, ctx) {
  const amt = p.amountCents;
  if (!p.payerName || !p.payerName.trim()) return err('Enter the actual payer name.');
  if (!Number.isInteger(amt) || amt <= 0) return err('Enter an amount greater than zero.');
  if (!p.receivedDate) return err('Enter the received date.');
  if (p.receivedDate > TODAY) return err('Received date cannot be in the future.');
  if (!p.reference || !p.reference.trim()) return err('Enter a payment reference (check number, wire ID or similar).');
  const dup = db.receipts.find((r) => r.kind === 'receipt' && r.state !== 'Reversed' && r.reference.toLowerCase() === p.reference.trim().toLowerCase() && r.amountCents === amt && r.payerName === p.payerName.trim());
  if (dup) return err(`Possible duplicate of ${dup.id} (same payer, amount and reference). Nothing was recorded.`);
  const id = nextId(db, 'RC', 'RC');
  db.receipts.push({ id, kind: 'receipt', payerName: p.payerName.trim(), payerType: p.payerType || 'Client', recipient: p.recipient || 'MFC', currency: p.currency || 'USD', receivedDate: p.receivedDate, depositedDate: p.depositedDate || null, amountCents: amt, method: p.method || 'Wire', reference: p.reference.trim(), state: 'Reported', evidence: null, qboRef: null, refundedCents: 0, internal: ['Policy Solutions', 'Simply Sold', 'MFC'].includes(p.payerType), memo: p.memo || '', caseHint: p.caseId || null, recordedBy: ctx.actor });
  audit(db, ctx, { entityType: 'receipt', entityId: id, caseId: p.caseId || null, action: 'Receipt recorded', detail: `${fmtUSD(amt, p.currency || 'USD')} from ${p.payerName.trim()} to ${p.recipient || 'MFC'}; Reported (not verified cash)` });
  return { ok: true, id, msg: `${id} recorded as Reported. It is not counted as cash until verified.` };
}
recordReceipt.perm = 'recordReceipt';

export function verifyReceipt(db, p, ctx) {
  const r = db.receipts.find((x) => x.id === p.id);
  if (!r || r.state !== 'Reported') return err('Only Reported receipts can be verified.');
  if (!p.evidence || !p.evidence.trim()) return err('Attach evidence (bank advice, check image or similar) before verifying.');
  if (!p.depositedDate) return err('Enter the deposited date.');
  if (p.depositedDate < r.receivedDate) return err('Deposited date cannot be before the received date.');
  if (p.depositedDate > TODAY) return err('Deposited date cannot be in the future.');
  r.state = 'Verified'; r.evidence = p.evidence.trim(); r.depositedDate = p.depositedDate; r.verifiedBy = ctx.actor; r.verifiedAt = stamp();
  audit(db, ctx, { entityType: 'receipt', entityId: r.id, action: 'Receipt verified', detail: `${fmtUSD(r.amountCents, r.currency)} verified with evidence "${r.evidence}"` });
  return { ok: true, msg: `${r.id} verified. ${r.recipient === 'MFC' ? 'It now counts as verified MFC cash and is ready to allocate.' : 'It is held by ' + r.recipient + ' and is not MFC cash.'}` };
}
verifyReceipt.perm = 'verifyReceipt';

export function allocate(db, p, ctx) {
  const r = db.receipts.find((x) => x.id === p.receiptId);
  if (!r || r.state !== 'Verified' || r.kind === 'contra') return err('Only verified receipts can be allocated.');
  const lines = (p.lines || []).filter((l) => l.amountCents > 0);
  if (!lines.length) return err('Enter an amount on at least one line.');
  const seen = {};
  for (const l of lines) { if (!Number.isInteger(l.amountCents)) return err('Amounts must be valid dollar values.'); if (seen[l.obId]) return err('Each obligation can appear once per allocation.'); seen[l.obId] = 1; }
  const rc = rcCalc(db, r); const total = sum(lines, (l) => l.amountCents);
  if (total > rc.available) return err(`Over-allocation blocked: ${fmtUSD(total, r.currency)} entered, but only ${fmtUSD(rc.available, r.currency)} is available on ${r.id}.`);
  for (const l of lines) {
    const o = db.obligations.find((x) => x.id === l.obId);
    if (!o) return err('Obligation not found: ' + l.obId);
    if (o.entity !== r.recipient) return err(`${o.id}: entity mismatch. ${r.id} was received by ${r.recipient}, but this obligation is owed to ${o.entity}.`);
    if (o.currency !== r.currency) return err(`${o.id}: currency mismatch (${r.currency} receipt vs ${o.currency} obligation).`);
    if (o.triggerState === 'Awaiting') return err(`${o.id} is still awaiting its trigger (${o.trigger}). Collateral is security, not payment.`);
    const x = obCalc(db, o);
    if (x.unknown) return err(`${o.id}: amount is Unknown until the agreement is verified.`);
    if (l.amountCents > x.outstanding) return err(`Over-allocation blocked: ${o.id} has only ${fmtUSD(x.outstanding)} outstanding.`);
  }
  const ids = [];
  lines.forEach((l) => {
    const id = nextId(db, 'AL', 'AL'); ids.push(id);
    db.allocations.push({ id, receiptId: r.id, obId: l.obId, amountCents: l.amountCents, status: 'Active', kind: 'alloc', at: stamp(), by: ctx.actor });
    audit(db, ctx, { entityType: 'allocation', entityId: id, caseId: caseOfOb(db, l.obId), action: 'Receipt allocated', detail: `${r.id} to ${l.obId}: ${fmtUSD(l.amountCents)}` });
  });
  const left = rc.available - total;
  return { ok: true, ids, msg: `Allocated ${fmtUSD(total)} from ${r.id} across ${lines.length} obligation${lines.length > 1 ? 's' : ''}. ${left > 0 ? fmtUSD(left) + ' remains unapplied.' : 'Fully applied.'}` };
}
allocate.perm = 'allocate';

function reopenCases(db, ctx, obIds, why) {
  const cids = [...new Set(obIds.map((id) => caseOfOb(db, id)))].filter(Boolean);
  const reopened = [];
  cids.forEach((cid) => { const c = db.cases.find((x) => x.id === cid); if (c && c.finClosed) { c.finClosed = false; c.finClosedAt = null; c.finClosedKind = null; reopened.push(cid); audit(db, ctx, { entityType: 'case', entityId: cid, caseId: cid, action: 'Financial closure reopened', detail: why }); } });
  return reopened;
}

export function reverseReceipt(db, p, ctx) {
  const r = db.receipts.find((x) => x.id === p.id);
  if (!r || r.kind === 'contra' || !['Verified', 'Reported'].includes(r.state)) return err('This receipt cannot be reversed.');
  if (!p.reason || !p.reason.trim()) return err('Enter a reason for the reversal.');
  const wasVerified = r.state === 'Verified';
  const cid = nextId(db, 'RC', 'RC');
  db.receipts.push({ ...clone(r), id: cid, kind: 'contra', reversalOf: r.id, amountCents: -r.amountCents, state: 'Reversal', qboRef: null, evidence: 'Reversal of ' + r.id, memo: p.reason.trim(), refundedCents: 0 });
  r.state = 'Reversed'; r.reversedBy = cid;
  const touched = [];
  db.allocations.filter((a) => a.receiptId === r.id && a.status === 'Active').forEach((a) => {
    a.status = 'Reversed'; touched.push(a.obId);
    const nid = nextId(db, 'AL', 'AL');
    db.allocations.push({ id: nid, receiptId: cid, obId: a.obId, amountCents: -a.amountCents, status: 'Contra', kind: 'contra', reversalOf: a.id, at: stamp(), by: ctx.actor });
    audit(db, ctx, { entityType: 'allocation', entityId: a.id, caseId: caseOfOb(db, a.obId), action: 'Allocation reversed', detail: `${a.id} (${fmtUSD(a.amountCents)} to ${a.obId}) reversed; balance reopened` });
  });
  db.approvals.filter((a) => a.kind === 'Refund' && a.status === 'Pending' && a.payload && a.payload.receiptId === r.id).forEach((a) => { a.status = 'Rejected'; a.note = 'Auto-rejected: receipt reversed'; });
  const q = db.qbo.find((x) => x.matchedReceiptId === r.id);
  if (q) { q.state = 'Review'; q.reason = `App receipt ${r.id} was reversed; review the QBO deposit`; q.matchedReceiptId = null; }
  const reopened = reopenCases(db, ctx, touched, `Receipt ${r.id} reversed: ${p.reason.trim()}`);
  audit(db, ctx, { entityType: 'receipt', entityId: r.id, caseId: touched.length ? caseOfOb(db, touched[0]) : null, action: 'Receipt reversed', detail: `${r.id} reversed by contra ${cid}. Reason: ${p.reason.trim()}` });
  return { ok: true, msg: `${r.id} reversed with linked contra ${cid}.${touched.length ? ' Balances on ' + touched.join(', ') + ' are reopened.' : ''}${reopened.length ? ' Financial closure reopened on ' + reopened.join(', ') + '.' : ''}${wasVerified ? '' : ''}` };
}
reverseReceipt.perm = 'reverse';

export function reverseAllocation(db, p, ctx) {
  const a = db.allocations.find((x) => x.id === p.id);
  if (!a || a.status !== 'Active') return err('This allocation cannot be reversed.');
  if (!p.reason || !p.reason.trim()) return err('Enter a reason for the reversal.');
  a.status = 'Reversed';
  const nid = nextId(db, 'AL', 'AL');
  db.allocations.push({ id: nid, receiptId: a.receiptId, obId: a.obId, amountCents: -a.amountCents, status: 'Contra', kind: 'contra', reversalOf: a.id, at: stamp(), by: ctx.actor });
  const reopened = reopenCases(db, ctx, [a.obId], `Allocation ${a.id} reversed: ${p.reason.trim()}`);
  audit(db, ctx, { entityType: 'allocation', entityId: a.id, caseId: caseOfOb(db, a.obId), action: 'Allocation reversed', detail: `${fmtUSD(a.amountCents)} on ${a.obId} reopened. Contra ${nid}. Reason: ${p.reason.trim()}` });
  return { ok: true, msg: `${a.id} reversed (contra ${nid}). ${fmtUSD(a.amountCents)} is unapplied again on ${a.receiptId}.${reopened.length ? ' Financial closure reopened on ' + reopened.join(', ') + '.' : ''}` };
}
reverseAllocation.perm = 'reverse';

export function requestRefund(db, p, ctx) {
  const r = db.receipts.find((x) => x.id === p.receiptId);
  if (!r || r.state !== 'Verified') return err('Only verified receipts can be refunded.');
  const pending = sum(db.approvals.filter((a) => a.kind === 'Refund' && a.status === 'Pending' && a.payload.receiptId === r.id), (a) => a.amountCents);
  const avail = rcCalc(db, r).available - pending;
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return err('Enter a refund amount greater than zero.');
  if (p.amountCents > avail) return err(`Refund exceeds the unapplied amount of ${fmtUSD(avail, r.currency)} (after pending refunds). Reverse an allocation first if needed.`);
  if (!p.payee || !p.payee.trim()) return err('Enter the payee.');
  if (!p.reason || !p.reason.trim()) return err('Enter a reason.');
  const id = nextId(db, 'AP', 'AP');
  db.approvals.push({ id, kind: 'Refund', refId: r.id, caseId: null, amountCents: p.amountCents, summary: `Refund ${fmtUSD(p.amountCents, r.currency)} of ${r.id} to ${p.payee.trim()} (simulated)`, proposedBy: ctx.actor, proposedAt: stamp(), status: 'Pending', decidedBy: null, decidedAt: null, note: p.reason.trim(), effect: '', payload: { receiptId: r.id, amountCents: p.amountCents, payee: p.payee.trim(), method: p.method || 'ACH' } });
  audit(db, ctx, { entityType: 'approval', entityId: id, action: 'Refund requested', detail: `${fmtUSD(p.amountCents, r.currency)} from ${r.id}; awaiting approval. No payment is sent in this demo.` });
  return { ok: true, id, msg: `Refund request ${id} sent for approval. No payment is executed in this demo.` };
}
requestRefund.perm = 'refund';

// ---------- Adjustments and approvals ----------
export function proposeAdjustment(db, p, ctx) {
  const o = db.obligations.find((x) => x.id === p.obId);
  if (!o) return err('Obligation not found.');
  if (!['Credit', 'Debit', 'Writeoff'].includes(p.kind)) return err('Choose an adjustment type.');
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return err('Enter an amount greater than zero.');
  if (!p.reason || !p.reason.trim()) return err('Enter a reason.');
  const x = obCalc(db, o);
  if (x.unknown) return err('Amount is Unknown; verify the agreement first.');
  const pending = sum(x.pend.filter((a) => a.kind !== 'Debit'), (a) => a.amountCents);
  if (p.kind !== 'Debit' && p.amountCents > x.outstanding - pending) return err(`${p.kind === 'Writeoff' ? 'Write-off' : 'Deduction'} cannot exceed the outstanding balance of ${fmtUSD(x.outstanding - pending)} (after pending items). Balances cannot go negative.`);
  const id = nextId(db, 'AJ', 'AJ'); const ap = nextId(db, 'AP', 'AP');
  const label = { Credit: 'Deduction', Debit: 'Debit', Writeoff: 'Write-off' }[p.kind];
  db.adjustments.push({ id, obId: o.id, kind: p.kind, amountCents: p.amountCents, reason: p.reason.trim(), status: 'Pending', proposedBy: ctx.actor, proposedAt: stamp(), decidedBy: null, decidedAt: null });
  db.approvals.push({ id: ap, kind: label, refId: id, caseId: o.caseId, amountCents: p.amountCents, summary: `${label} of ${fmtUSD(p.amountCents)} on ${o.id} (${o.debtorName})`, proposedBy: ctx.actor, proposedAt: stamp(), status: 'Pending', decidedBy: null, decidedAt: null, note: p.reason.trim(), effect: '' });
  audit(db, ctx, { entityType: 'adjustment', entityId: id, caseId: o.caseId, action: label + ' proposed', detail: `${fmtUSD(p.amountCents)} on ${o.id}. No financial effect until approved. Reason: ${p.reason.trim()}` });
  return { ok: true, msg: `${label} proposed (${ap}). The balance does not change until a different approver approves it.` };
}
proposeAdjustment.perm = 'proposeAdjustment';

export function proposeClosure(db, p, ctx) {
  const chk = closureCheck(db, p.caseId);
  if (!chk.ok) return err('Financial closure is blocked: ' + chk.blockers.join('; ') + '.', { blockers: chk.blockers });
  const id = nextId(db, 'AP', 'AP');
  db.approvals.push({ id, kind: 'Closure', refId: p.caseId, caseId: p.caseId, amountCents: 0, summary: `Financial closure of ${p.caseId}`, proposedBy: ctx.actor, proposedAt: stamp(), status: 'Pending', decidedBy: null, decidedAt: null, note: '', effect: '' });
  audit(db, ctx, { entityType: 'approval', entityId: id, caseId: p.caseId, action: 'Closure proposed', detail: 'Zero balances and resolved reconciliation confirmed; awaiting approval' });
  return { ok: true, msg: `Closure proposed (${id}). A different approver must approve it.` };
}
proposeClosure.perm = 'closeFinance';

export function decideApproval(db, p, ctx) {
  const a = db.approvals.find((x) => x.id === p.id);
  if (!a || a.status !== 'Pending') return err('This item is no longer pending.');
  if (a.proposedBy === ctx.actor) return err('You proposed this item, so you cannot approve it. A different approver is required.');
  const approve = p.decision === 'Approve';
  if (!approve && !(p.note && p.note.trim())) return err('Enter a note explaining the rejection.');
  let effect = '';
  if (approve) {
    if (['Deduction', 'Write-off', 'Debit'].includes(a.kind)) {
      const j = db.adjustments.find((x) => x.id === a.refId); const o = db.obligations.find((x) => x.id === j.obId);
      const xx = obCalc(db, o);
      if (j.kind !== 'Debit' && j.amountCents > xx.outstanding) return err(`The balance is now ${fmtUSD(xx.outstanding)}, less than this ${a.kind.toLowerCase()}. Reject it and propose a new amount.`);
      j.status = 'Approved'; j.decidedBy = ctx.actor; j.decidedAt = stamp();
      const after = obCalc(db, o);
      effect = `${a.kind} of ${fmtUSD(j.amountCents)} applied to ${o.id}. Adjusted obligation ${fmtUSD(after.adjusted)}; outstanding ${fmtUSD(after.outstanding)}.${j.kind === 'Writeoff' ? ' No cash was collected.' : ''}`;
    } else if (a.kind === 'Refund') {
      const r = db.receipts.find((x) => x.id === a.payload.receiptId);
      if (a.payload.amountCents > rcCalc(db, r).available) return err('The unapplied amount on this receipt is now smaller than the refund.');
      r.refundedCents = (r.refundedCents || 0) + a.payload.amountCents;
      effect = `Refund of ${fmtUSD(a.payload.amountCents, r.currency)} recorded against ${r.id} (simulated; no payment was sent).`;
    } else if (a.kind === 'Closure') {
      const chk = closureCheck({ ...db, approvals: db.approvals.filter((x) => x.id !== a.id) }, a.refId);
      if (!chk.ok) return err('Closure conditions are no longer met: ' + chk.blockers.join('; ') + '.');
      const c = db.cases.find((x) => x.id === a.refId);
      const adj = db.obligations.filter((o) => o.caseId === c.id).some((o) => obCalc(db, o).writeoffs > 0);
      c.finClosed = true; c.finClosedAt = TODAY; c.finClosedKind = adj ? 'Adjusted closure' : 'Cash settled';
      effect = `${c.id} financially closed (${c.finClosedKind.toLowerCase()}).`;
    }
  } else {
    if (['Deduction', 'Write-off', 'Debit'].includes(a.kind)) { const j = db.adjustments.find((x) => x.id === a.refId); j.status = 'Rejected'; j.decidedBy = ctx.actor; j.decidedAt = stamp(); }
    effect = 'Rejected; no financial effect.';
  }
  a.status = approve ? 'Approved' : 'Rejected'; a.decidedBy = ctx.actor; a.decidedAt = stamp(); a.effect = effect; if (p.note) a.note = p.note.trim();
  audit(db, ctx, { entityType: 'approval', entityId: a.id, caseId: a.caseId, action: `${a.kind} ${approve ? 'approved' : 'rejected'}`, detail: effect });
  return { ok: true, msg: effect };
}
decideApproval.perm = 'approve';

// ---------- Collections: owner, follow-up, outcome, dispute ----------
export function assignOwner(db, p, ctx) {
  const o = db.obligations.find((x) => x.id === p.obId); if (!o) return err('Obligation not found.');
  if (!p.owner) return err('Choose an owner.');
  const before = o.owner; o.owner = p.owner;
  audit(db, ctx, { entityType: 'obligation', entityId: o.id, caseId: o.caseId, action: 'Owner assigned', detail: `${before} to ${p.owner}` });
  return { ok: true, msg: `${o.id} is now owned by ${p.owner}.` };
}
assignOwner.perm = 'assignOwner';

export function scheduleFollowUp(db, p, ctx) {
  const o = db.obligations.find((x) => x.id === p.obId); if (!o) return err('Obligation not found.');
  if (!p.date) return err('Choose a follow-up date.');
  if (p.date < TODAY) return err('Follow-up date cannot be in the past.');
  if (!p.note || !p.note.trim()) return err('Enter what the follow-up is for.');
  const id = nextId(db, 'FU', 'FU');
  o.followUps.push({ id, date: p.date, note: p.note.trim(), owner: p.owner || o.owner, done: false });
  if (o.triggerState === 'Awaiting') o.reviewDate = p.date;
  audit(db, ctx, { entityType: 'obligation', entityId: o.id, caseId: o.caseId, action: 'Follow-up scheduled', detail: `${p.date}: ${p.note.trim()}` });
  return { ok: true, msg: `Follow-up scheduled for ${p.date}.` };
}
scheduleFollowUp.perm = 'followUp';

export function recordOutcome(db, p, ctx) {
  const o = db.obligations.find((x) => x.id === p.obId); if (!o) return err('Obligation not found.');
  if (!p.outcome) return err('Choose an outcome.');
  o.outcomes.push({ at: stamp(), by: ctx.actor, outcome: p.outcome, note: (p.note || '').trim() });
  if (p.outcome === 'Dispute raised') o.disputed = true;
  audit(db, ctx, { entityType: 'obligation', entityId: o.id, caseId: o.caseId, action: 'Collection outcome', detail: `${p.outcome}${p.note ? ': ' + p.note.trim() : ''} (internal note; no financial effect)` });
  return { ok: true, msg: `Outcome recorded: ${p.outcome}. Internal note only; balances are unchanged.` };
}
recordOutcome.perm = 'followUp';

export function setDispute(db, p, ctx) {
  const o = db.obligations.find((x) => x.id === p.obId); if (!o) return err('Obligation not found.');
  o.disputed = !!p.disputed;
  audit(db, ctx, { entityType: 'obligation', entityId: o.id, caseId: o.caseId, action: p.disputed ? 'Dispute opened' : 'Dispute resolved', detail: p.note || '' });
  return { ok: true, msg: p.disputed ? 'Marked as disputed.' : 'Dispute cleared.' };
}
setDispute.perm = 'followUp';

export function setCaseStage(db, p, ctx) {
  const c = db.cases.find((x) => x.id === p.caseId); if (!c) return err('Case not found.');
  const before = c.opStatus; c.opStatus = p.opStatus;
  audit(db, ctx, { entityType: 'case', entityId: c.id, caseId: c.id, action: 'Operational stage changed', detail: `${before} to ${p.opStatus}. Financial status is independent and did not change.` });
  return { ok: true, msg: `${c.id} operational stage set to ${p.opStatus}. Financial status is unchanged.` };
}
setCaseStage.perm = 'caseStage';

export function setFinancialOwner(db, p, ctx) {
  const c = db.cases.find((x) => x.id === p.caseId); if (!c) return err('Case not found.');
  const before = c.financialOwner; c.financialOwner = p.owner;
  audit(db, ctx, { entityType: 'case', entityId: c.id, caseId: c.id, action: 'Financial owner changed', detail: `${before} to ${p.owner}` });
  return { ok: true, msg: `Financial owner is now ${p.owner}.` };
}
setFinancialOwner.perm = 'assignOwner';

// ---------- Tasks ----------
export function addTask(db, p, ctx) {
  if (!p.title || !p.title.trim()) return err('Enter a task title.');
  if (!p.due) return err('Choose a due date.');
  const id = nextId(db, 'TK', 'TK');
  db.tasks.push({ id, title: p.title.trim(), caseId: p.caseId || null, obId: p.obId || null, owner: p.owner || ctx.actor, due: p.due, status: 'Open', outcome: '', escalated: false, kind: p.kind || 'Manual' });
  audit(db, ctx, { entityType: 'task', entityId: id, caseId: p.caseId || null, action: 'Task created', detail: p.title.trim() });
  return { ok: true, msg: `${id} created.` };
}
addTask.perm = 'manageTasks';
export function completeTask(db, p, ctx) {
  const t = db.tasks.find((x) => x.id === p.id); if (!t || t.status === 'Done') return err('Task not found or already done.');
  if (!p.outcome || !p.outcome.trim()) return err('Record the outcome before completing the task.');
  t.status = 'Done'; t.outcome = p.outcome.trim(); t.doneAt = stamp();
  audit(db, ctx, { entityType: 'task', entityId: t.id, caseId: t.caseId, action: 'Task completed', detail: t.outcome });
  return { ok: true, msg: `${t.id} completed.` };
}
completeTask.perm = 'manageTasks';
export function escalateTask(db, p, ctx) {
  const t = db.tasks.find((x) => x.id === p.id); if (!t) return err('Task not found.');
  t.escalated = true; t.owner = 'Dana Whitfield';
  audit(db, ctx, { entityType: 'task', entityId: t.id, caseId: t.caseId, action: 'Task escalated', detail: 'Reassigned to Dana Whitfield (CEO)' });
  return { ok: true, msg: `${t.id} escalated to the CEO.` };
}
escalateTask.perm = 'manageTasks';
export { addDays, caseRecon };
