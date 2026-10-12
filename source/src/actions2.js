// Mutations: agreements, policies, deals, reconciliation, settings.
import { TODAY, stamp, nextId, fmtUSD, addDays, clone } from './util.js';
import { obCalc, policyMismatch, dealMissing, derive } from './calc.js';
import { err, audit } from './actions1.js';
import { STAGE_REQ, POLICY_STAGES, DEAL_STAGES, DEAL_EVIDENCE } from './seed.js';

const verOf = (a, v) => a.versions.find((x) => x.v === v);
function addDoc(db, caseId, kind, name, note) {
  const id = nextId(db, 'DOC', 'DOC');
  db.documents.push({ id, caseId, kind, name, status: 'Verified', date: TODAY, pages: 4, hash: 'sha256:' + Math.abs(id.split('-')[1] * 7919).toString(16).padEnd(8, '0') + '…demo', note: note || 'Fictional document metadata for demonstration. No real file is stored.' });
  return id;
}

// ---------- Agreements ----------
export function attachSignedEA(db, p, ctx) {
  const a = db.agreements.find((x) => x.id === p.agId); if (!a) return err('Agreement not found.');
  const v = verOf(a, a.currentVersion);
  if (v.status === 'Verified') return err('Verified versions are locked. Start an amendment instead.');
  v.docId = addDoc(db, a.caseId, 'Signed EA', `Signed EA – ${a.caseId} v${v.v}.pdf`);
  audit(db, ctx, { entityType: 'agreement', entityId: a.id, caseId: a.caseId, action: 'Signed EA attached', detail: `${v.docId} (fictional metadata)` });
  return { ok: true, msg: 'Signed EA metadata attached (fictional preview).' };
}
attachSignedEA.perm = 'draftAgreement';

export function saveAgreementDraft(db, p, ctx) {
  if (!p.caseId) return err('Choose a case.');
  if (!p.type) return err('Choose an agreement type.');
  const comps = (p.components || []).map((c, i) => ({ ...c, id: c.id || 'CP-' + (++db.seq.CP) + '-' + (i + 1) }));
  if (!comps.length) return err('Add at least one component (fee, policy exchange, property proceeds…).');
  const unknown = p.grossFeeCents == null || comps.some((c) => c.amountCents == null);
  if (unknown && !(p.unknownReason && p.unknownReason.trim())) return err('An amount is unknown. Add a reason so the gap is visible on the exception list.');
  for (const c of comps) if (c.amountCents != null && (!Number.isInteger(c.amountCents) || c.amountCents < 0)) return err('Amounts must be valid, non-negative dollar values.');
  const fields = { signedDate: p.signedDate || null, parties: (p.parties || []).filter(Boolean), grossFeeCents: p.grossFeeCents == null ? null : p.grossFeeCents, legalFeeCents: p.legalFeeCents || 0, components: comps, terms: p.terms || '', unknownReason: (p.unknownReason || '').trim() };
  if (p.agId) {
    const a = db.agreements.find((x) => x.id === p.agId); const v = verOf(a, a.currentVersion);
    if (v.status !== 'Draft') return err('Only draft versions can be edited. Use Amend for verified agreements.');
    Object.assign(v, fields); a.type = p.type;
    audit(db, ctx, { entityType: 'agreement', entityId: a.id, caseId: a.caseId, action: 'Draft saved', detail: unknown ? 'Saved with unknown amounts (reason recorded)' : 'Saved' });
    return { ok: true, id: a.id, msg: `${a.id} draft saved.${unknown ? ' It stays on the exception list until amounts are known and it is verified.' : ''}` };
  }
  const id = nextId(db, 'AG', 'AG');
  db.agreements.push({ id, caseId: p.caseId, type: p.type, status: 'Draft', currentVersion: 1, verifiedVersion: null, pending: null, versions: [{ v: 1, status: 'Draft', ...fields, docId: null, draftedBy: ctx.actor, verifiedBy: null, verifiedAt: null, deltas: [], note: '' }] });
  audit(db, ctx, { entityType: 'agreement', entityId: id, caseId: p.caseId, action: 'Draft created', detail: unknown ? 'Created with unknown amounts (reason recorded)' : 'Created' });
  return { ok: true, id, msg: `${id} draft created.${unknown ? ' Unknown amounts display as Unknown and are excluded from confirmed totals.' : ''}` };
}
saveAgreementDraft.perm = 'draftAgreement';

export function verifyAgreement(db, p, ctx) {
  const a = db.agreements.find((x) => x.id === p.agId); if (!a) return err('Agreement not found.');
  const v = verOf(a, a.currentVersion);
  if (v.status !== 'Draft') return err('Only draft versions can be verified.');
  const miss = [];
  if (!v.signedDate) miss.push('Signed date');
  if (v.parties.length < 2) miss.push('At least two parties');
  if (v.grossFeeCents == null) miss.push('Gross fee amount');
  v.components.forEach((c) => { if (c.amountCents == null) miss.push(`Amount for "${c.label || c.kind}"`); if (c.createsAt !== 'none' && c.trigger === 'Due date' && !c.dueDate) miss.push(`Due date for "${c.label || c.kind}"`); });
  if (!v.docId) miss.push('Signed EA document');
  if (!p.reviewer) miss.push('Reviewer');
  if (p.reviewer && db.settings.requireReviewerDifferent && p.reviewer === v.draftedBy) miss.push(`A reviewer other than the drafter (${v.draftedBy})`);
  if (miss.length) return err('Cannot verify. Missing or invalid: ' + miss.join('; ') + '.', { missing: miss });
  v.status = 'Verified'; v.verifiedBy = p.reviewer; v.verifiedAt = stamp(); a.status = 'Verified'; a.verifiedVersion = v.v;
  const made = [];
  v.components.forEach((c) => {
    if (c.createsAt !== 'verify' || !(c.amountCents > 0)) return;
    if (db.obligations.some((o) => o.compId === c.id)) return; // created once only
    const id = nextId(db, 'OB', 'OB'); made.push(id);
    const due = c.trigger === 'Due date';
    db.obligations.push({ id, caseId: a.caseId, agId: a.id, compId: c.id, creditor: 'MFC', entity: 'MFC', currency: 'USD', category: c.category, debtorType: c.debtorType, debtorName: c.debtorName || '—', principalCents: c.amountCents, triggerState: due ? 'Active' : 'Awaiting', dueDate: due ? c.dueDate : null, trigger: c.trigger, activeFrom: TODAY, owner: 'Accounting Lead', manualNext: '', disputed: false, evidence: 'Complete', collateral: c.collateral || null, reviewDate: null, outcomes: [], followUps: [], verified: true });
  });
  audit(db, ctx, { entityType: 'agreement', entityId: a.id, caseId: a.caseId, action: 'Agreement verified', detail: `v${v.v} verified by ${p.reviewer}. ${made.length ? 'Obligations created: ' + made.join(', ') : 'No new obligations (components create obligations at a later trigger or none)'}.` });
  return { ok: true, made, msg: `${a.id} verified.${made.length ? ' Created ' + made.join(', ') + ' (once).' : ' No new obligations were needed.'}` };
}
verifyAgreement.perm = 'verifyAgreement';

export function submitAmendment(db, p, ctx) {
  const a = db.agreements.find((x) => x.id === p.agId); if (!a) return err('Agreement not found.');
  if (a.status !== 'Verified' || a.pending) return err('Only a verified agreement with no pending amendment can be amended.');
  if (!p.reason || !p.reason.trim()) return err('Enter the reason for the amendment.');
  const base = clone(verOf(a, a.verifiedVersion));
  const deltas = [];
  (p.changes || []).forEach((ch) => {
    const c = base.components.find((x) => x.id === ch.compId); if (!c || ch.amountCents == null || ch.amountCents === c.amountCents) return;
    const o = db.obligations.find((x) => x.compId === c.id);
    deltas.push({ compId: c.id, label: c.label, obId: o ? o.id : null, before: c.amountCents, after: ch.amountCents, delta: ch.amountCents - c.amountCents });
    c.amountCents = ch.amountCents;
  });
  if (!deltas.length) return err('Change at least one component amount to create an amendment.');
  const nv = a.versions.length + 1;
  const gross = base.components.filter((c) => ['Cash fee', 'Attorney-collected fee', 'Policy exchange', 'Property proceeds'].includes(c.kind)).reduce((s, c) => s + (c.amountCents || 0), 0);
  a.versions.push({ ...base, v: nv, status: 'Pending review', grossFeeCents: gross, deltas, draftedBy: ctx.actor, verifiedBy: null, verifiedAt: null, note: p.reason.trim() });
  a.currentVersion = nv; a.pending = nv;
  audit(db, ctx, { entityType: 'agreement', entityId: a.id, caseId: a.caseId, action: 'Amendment submitted', detail: `v${nv}: ${deltas.map((d) => `${d.label} ${fmtUSD(d.before)} to ${fmtUSD(d.after)}`).join('; ')}. v${a.verifiedVersion} stays on record.` });
  return { ok: true, msg: `Amendment v${nv} submitted for review. Version history is preserved; no balance changes until it is reviewed.` };
}
submitAmendment.perm = 'amendAgreement';

export function reviewAmendment(db, p, ctx) {
  const a = db.agreements.find((x) => x.id === p.agId); if (!a || !a.pending) return err('No amendment is pending review.');
  const v = verOf(a, a.pending);
  if (v.draftedBy === ctx.actor) return err(`You submitted this amendment (${ctx.actor}). A different reviewer is required.`);
  if (p.decision === 'Reject') { v.status = 'Rejected'; a.pending = null; a.currentVersion = a.verifiedVersion; audit(db, ctx, { entityType: 'agreement', entityId: a.id, caseId: a.caseId, action: 'Amendment rejected', detail: `v${v.v} rejected` }); return { ok: true, msg: 'Amendment rejected; the verified version is unchanged.' }; }
  for (const d of v.deltas) {
    if (!d.obId) continue;
    const o = db.obligations.find((x) => x.id === d.obId); const x = obCalc(db, o);
    if (d.delta < 0 && -d.delta > x.outstanding) return err(`${o.id}: the reduction of ${fmtUSD(-d.delta)} exceeds the outstanding ${fmtUSD(x.outstanding)}. Handle the overpayment through a refund request first.`);
  }
  const made = [];
  v.deltas.forEach((d) => {
    if (!d.obId) return;
    const id = nextId(db, 'AJ', 'AJ'); made.push(id);
    db.adjustments.push({ id, obId: d.obId, kind: d.delta > 0 ? 'Debit' : 'Credit', amountCents: Math.abs(d.delta), reason: `Amendment v${v.v}: ${d.label}`, status: 'Approved', proposedBy: v.draftedBy, proposedAt: stamp(), decidedBy: ctx.actor, decidedAt: stamp() });
  });
  v.status = 'Verified'; v.verifiedBy = ctx.actor; v.verifiedAt = stamp(); a.verifiedVersion = v.v; a.pending = null; a.status = 'Verified';
  audit(db, ctx, { entityType: 'agreement', entityId: a.id, caseId: a.caseId, action: 'Amendment approved', detail: `v${v.v} verified. Reviewed deltas posted as ${made.length ? made.join(', ') : 'no obligation adjustments (no obligation yet)'}.` });
  return { ok: true, msg: `Amendment v${v.v} approved. ${made.length} adjustment${made.length === 1 ? '' : 's'} posted; principal and history are preserved.` };
}
reviewAmendment.perm = 'verifyAgreement';

// ---------- Policy Solutions ----------
export function setPolicyStage(db, p, ctx) {
  const pol = db.policies.find((x) => x.id === p.id); if (!pol) return err('Policy not found.');
  const idx = (k) => POLICY_STAGES.findIndex((s) => s[0] === k);
  if (p.stage === 'ownership' && idx(pol.stage) < idx('ownership')) return err('Use "Confirm ownership" so evidence is recorded before the stage moves to Ownership confirmed.');
  const probe = { ...pol, stage: p.stage };
  const mm = policyMismatch({ ...probe, overrides: pol.overrides });
  if (mm.warn && !(p.override && p.override.trim())) return err(`Checklist mismatch for ${POLICY_STAGES[idx(p.stage)][1]}: missing ${mm.missing.join(', ')}. Add evidence or record an override reason.`, { needsOverride: true, missing: mm.missing });
  if (mm.warn) pol.overrides.push({ stage: p.stage, reason: p.override.trim(), by: ctx.actor, at: stamp() });
  const before = pol.stage; pol.stage = p.stage;
  audit(db, ctx, { entityType: 'policy', entityId: pol.id, caseId: pol.caseId, action: 'Policy stage changed', detail: `${before} to ${p.stage}${mm.warn ? '. Override: ' + p.override.trim() : ''}` });
  return { ok: true, msg: `${pol.id} moved to ${POLICY_STAGES[idx(p.stage)][1]}.${mm.warn ? ' Override recorded.' : ''}` };
}
setPolicyStage.perm = 'policyWork';

export function toggleChecklist(db, p, ctx) {
  const pol = db.policies.find((x) => x.id === p.id); if (!pol) return err('Policy not found.');
  pol.checklist[p.key] = !pol.checklist[p.key];
  audit(db, ctx, { entityType: 'policy', entityId: pol.id, caseId: pol.caseId, action: 'Checklist updated', detail: `${p.key} set to ${pol.checklist[p.key]}` });
  return { ok: true, msg: 'Checklist updated.' };
}
toggleChecklist.perm = 'policyWork';

export function confirmOwnership(db, p, ctx) {
  const pol = db.policies.find((x) => x.id === p.id); if (!pol) return err('Policy not found.');
  const idx = (k) => POLICY_STAGES.findIndex((s) => s[0] === k);
  if (idx(pol.stage) < idx('processing')) return err('The policy must reach Processing before ownership can be confirmed.');
  if (!p.evidence || !p.evidence.trim()) return err('Enter the ownership evidence reference (for example, the recorded assignment form).');
  const ag = db.agreements.find((x) => x.id === pol.agId);
  const dd = db.documents.length;
  pol.evidence.ownership = { status: 'Verified', note: p.evidence.trim(), docId: addDoc(db, pol.caseId, 'Ownership evidence', `Ownership evidence ${pol.policyNo}.pdf`) };
  pol.checklist.processingSubmitted = true; pol.checklist.ownershipEvidence = true;
  if (idx(pol.stage) < idx('ownership')) pol.stage = 'ownership';
  const notes = [];
  const comp = ag && ag.verifiedVersion ? verOf(ag, ag.verifiedVersion).components.find((c) => c.id === pol.compId) : null;
  if (comp && db.settings.ownershipFulfillsClient && !db.fulfillment.some((f) => f.compId === comp.id)) {
    db.fulfillment.push({ id: nextId(db, 'FE', 'FE'), caseId: pol.caseId, compId: comp.id, kind: 'Policy ownership transferred to PS', amountCents: comp.amountCents, date: TODAY, evidence: p.evidence.trim(), mfcCash: false });
    notes.push('Client component marked fulfilled');
  }
  if (comp && db.settings.psExchangeCreatesObligation && ag.verifiedVersion && comp.amountCents > 0 && !db.obligations.some((o) => o.compId === comp.id)) {
    const id = nextId(db, 'OB', 'OB');
    db.obligations.push({ id, caseId: pol.caseId, agId: ag.id, compId: comp.id, creditor: 'MFC', entity: 'MFC', currency: 'USD', category: 'Policy exchange', debtorType: 'Policy Solutions', debtorName: 'Policy Solutions (PS)', principalCents: comp.amountCents, triggerState: 'Active', dueDate: addDays(TODAY, db.settings.dueDays), trigger: 'Ownership confirmed ' + TODAY, activeFrom: TODAY, owner: 'Policy Coordinator', manualNext: '', disputed: false, evidence: 'Complete', collateral: null, reviewDate: null, outcomes: [], followUps: [], verified: true });
    pol.obId = id; notes.push(`PS-to-MFC obligation ${id} created for ${fmtUSD(comp.amountCents)}, due ${addDays(TODAY, db.settings.dueDays)}`);
  } else if (comp && !ag.verifiedVersion) notes.push('Agreement is not verified, so no obligation was created');
  audit(db, ctx, { entityType: 'policy', entityId: pol.id, caseId: pol.caseId, action: 'Ownership confirmed', detail: `${p.evidence.trim()}. ${notes.join('. ')}. No MFC cash was created.` });
  return { ok: true, msg: `Ownership confirmed on ${pol.id}. ${notes.join('. ')}. MFC cash is still $0.00 until Policy Solutions actually remits.` };
}
confirmOwnership.perm = 'policyWork';

export function setPolicyEvidence(db, p, ctx) {
  const pol = db.policies.find((x) => x.id === p.id); if (!pol) return err('Policy not found.');
  if (!p.note || !p.note.trim()) return err('Enter the evidence reference.');
  pol.evidence.beneficiary = { status: 'Verified', note: p.note.trim(), docId: addDoc(db, pol.caseId, 'Beneficiary evidence', `Beneficiary confirmation ${pol.policyNo}.pdf`) };
  pol.checklist.beneficiaryUpdated = true;
  audit(db, ctx, { entityType: 'policy', entityId: pol.id, caseId: pol.caseId, action: 'Beneficiary evidence added', detail: p.note.trim() });
  return { ok: true, msg: 'Beneficiary evidence recorded.' };
}
setPolicyEvidence.perm = 'policyWork';

export function logPolicyEvent(db, p, ctx) {
  const pol = db.policies.find((x) => x.id === p.id); if (!pol) return err('Policy not found.');
  if (!p.note || !p.note.trim()) return err('Enter a note.');
  if (p.kind === 'claim') pol.claimHistory.push({ date: TODAY, note: p.note.trim() });
  else { if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return err('Enter the premium amount.'); pol.premiumHistory.push({ date: TODAY, amountCents: p.amountCents, note: p.note.trim() }); }
  audit(db, ctx, { entityType: 'policy', entityId: pol.id, caseId: pol.caseId, action: p.kind === 'claim' ? 'Claim note added' : 'Premium logged', detail: p.note.trim() + ' (history only; not an MFC receipt)' });
  return { ok: true, msg: 'Recorded in policy history. This is not an MFC receipt.' };
}
logPolicyEvent.perm = 'policyWork';

// ---------- Simply Sold ----------
export function setDealStage(db, p, ctx) {
  const d = db.deals.find((x) => x.id === p.id); if (!d) return err('Deal not found.');
  if (['closed', 'wrapup'].includes(p.stage) && !d.closingVerified) return err('Verify the closing first. Closed and Wrap-up require verified closing evidence.');
  const before = d.stage; d.stage = p.stage;
  audit(db, ctx, { entityType: 'deal', entityId: d.id, caseId: d.caseId, action: 'Deal stage changed', detail: `${before} to ${p.stage}` });
  return { ok: true, msg: `${d.id} moved to ${DEAL_STAGES.find((s) => s[0] === p.stage)[1]}.` };
}
setDealStage.perm = 'dealWork';

export function verifyDealEvidence(db, p, ctx) {
  const d = db.deals.find((x) => x.id === p.id); if (!d) return err('Deal not found.');
  const label = DEAL_EVIDENCE.find((e) => e[0] === p.key)[1];
  d.evidence[p.key] = { status: 'Verified', docId: addDoc(db, d.caseId, 'Property evidence', `${label} ${d.id}.pdf`) };
  audit(db, ctx, { entityType: 'deal', entityId: d.id, caseId: d.caseId, action: 'Evidence verified', detail: label });
  return { ok: true, msg: `${label} verified (fictional document metadata).` };
}
verifyDealEvidence.perm = 'dealWork';

export function verifyClosing(db, p, ctx) {
  const d = db.deals.find((x) => x.id === p.id); if (!d) return err('Deal not found.');
  const missing = dealMissing(d);
  if (missing.length) return err('Closing cannot be verified. Missing evidence: ' + missing.join(', ') + '.');
  if (!p.closingDate) return err('Enter the closing date.');
  if (p.closingDate > TODAY) return err('Closing date cannot be in the future.');
  d.closingDate = p.closingDate; d.closingVerified = true; d.stage = 'closed';
  if (p.titleCompany) d.titleCompany = p.titleCompany;
  if (p.proceedsRecipient) d.proceedsRecipient = p.proceedsRecipient;
  if (!d.feeAllocations.length && d.entitlementCents) d.feeAllocations = [{ label: 'MFC entitlement (agreed fee)', amountCents: d.entitlementCents }];
  const o = d.obId && db.obligations.find((x) => x.id === d.obId);
  const notes = [];
  if (o && db.settings.closingActivatesDue) { o.triggerState = 'Active'; o.dueDate = addDays(p.closingDate, db.settings.dueDays); o.trigger = 'Closing verified ' + p.closingDate; o.activeFrom = p.closingDate; if (d.titleCompany && d.titleCompany !== 'To be assigned') o.debtorName = d.titleCompany; o.reviewDate = null; notes.push(`${o.id} is now due ${o.dueDate}`); }
  const comp = db.agreements.flatMap((a) => (a.verifiedVersion ? verOf(a, a.verifiedVersion).components : [])).find((c) => c.id === d.compId);
  if (comp && !db.fulfillment.some((f) => f.compId === comp.id)) db.fulfillment.push({ id: nextId(db, 'FE', 'FE'), caseId: d.caseId, compId: comp.id, kind: 'Property closing verified', amountCents: comp.amountCents, date: p.closingDate, evidence: 'Closing statement ' + d.id, mfcCash: false });
  audit(db, ctx, { entityType: 'deal', entityId: d.id, caseId: d.caseId, action: 'Closing verified', detail: `Closed ${p.closingDate}. ${notes.join('. ')}. Proceeds recipient: ${d.proceedsRecipient}. No MFC cash recorded.` });
  return { ok: true, msg: `Closing verified. ${notes.join('. ')}. Settlement still waits for a receipt and reconciliation.` };
}
verifyClosing.perm = 'dealWork';

export function updateDeal(db, p, ctx) {
  const d = db.deals.find((x) => x.id === p.id); if (!d) return err('Deal not found.');
  Object.assign(d, p.patch);
  audit(db, ctx, { entityType: 'deal', entityId: d.id, caseId: d.caseId, action: 'Deal updated', detail: Object.keys(p.patch).join(', ') });
  return { ok: true, msg: 'Deal updated.' };
}
updateDeal.perm = 'dealWork';

// ---------- Reconciliation (simulated QBO) ----------
export function matchQbo(db, p, ctx) {
  const q = db.qbo.find((x) => x.id === p.qboId); const r = db.receipts.find((x) => x.id === p.receiptId);
  if (!q || !r) return err('Record not found.');
  if (!['Unmatched', 'Review'].includes(q.state)) return err('This QBO record is already matched.');
  if (r.state !== 'Verified' || r.qboRef) return err('Only verified, unlinked receipts can be matched.');
  if (q.type === 'Invoice') return err('An invoice is not a receipt. Match deposits and payments only.');
  if (q.company !== r.recipient) return err(`Company mismatch: QBO record is ${q.company}, receipt was received by ${r.recipient}.`);
  r.qboRef = q.id; q.matchedReceiptId = r.id;
  const diff = r.amountCents - q.amountCents;
  if (Math.abs(diff) <= db.settings.matchToleranceCents) { q.state = 'Matched'; q.differenceCents = 0; q.reason = ''; }
  else { q.state = 'Difference'; q.differenceCents = diff; q.reason = `Amounts differ by ${fmtUSD(Math.abs(diff))}; review and resolve`; }
  audit(db, ctx, { entityType: 'reconciliation', entityId: q.id, caseId: (q.mappedCaseIds || [])[0] || null, action: q.state === 'Matched' ? 'QBO matched' : 'QBO matched with difference', detail: `${q.id} linked to ${r.id}${diff ? ' (difference ' + fmtUSD(Math.abs(diff)) + ')' : ''}` });
  return { ok: true, msg: q.state === 'Matched' ? `${q.id} matched to ${r.id}.` : `${q.id} linked to ${r.id} with a ${fmtUSD(Math.abs(diff))} difference to resolve.` };
}
matchQbo.perm = 'reconcile';

export function rejectMatch(db, p, ctx) {
  db.rejectedPairs.push(p.qboId + '|' + p.receiptId);
  audit(db, ctx, { entityType: 'reconciliation', entityId: p.qboId, action: 'Suggested match rejected', detail: `${p.qboId} is not ${p.receiptId}` });
  return { ok: true, msg: 'Suggestion rejected. It will not be offered again.' };
}
rejectMatch.perm = 'reconcile';

export function resolveItem(db, p, ctx) {
  const q = db.qbo.find((x) => x.id === p.qboId); if (!q) return err('Record not found.');
  if (!p.note || !p.note.trim()) return err('Enter a resolution note.');
  if (p.resolution === 'map') {
    if (!p.caseId) return err('Choose the case this record belongs to.');
    q.mappedCaseIds = [p.caseId]; q.state = 'Unmatched'; q.reason = 'Mapped to ' + p.caseId + '; record the matching app receipt';
    audit(db, ctx, { entityType: 'reconciliation', entityId: q.id, caseId: p.caseId, action: 'Case mapping set', detail: p.note.trim() });
    return { ok: true, msg: `${q.id} mapped to ${p.caseId}. It now needs a matching app receipt.` };
  }
  if (q.matchedReceiptId && p.resolution === 'void') return err('This record is linked to an app receipt. Reverse the receipt or accept the difference instead.');
  q.state = 'Resolved'; q.resolvedNote = p.note.trim(); q.resolvedBy = ctx.actor; q.reason = p.resolution === 'void' ? 'Void confirmed; no app impact' : q.reason;
  audit(db, ctx, { entityType: 'reconciliation', entityId: q.id, caseId: (q.mappedCaseIds || [])[0] || null, action: 'Reconciliation item resolved', detail: `${p.resolution === 'void' ? 'Void confirmed' : p.resolution === 'dismiss' ? 'Dismissed' : 'Difference accepted'}: ${p.note.trim()}` });
  return { ok: true, msg: `${q.id} resolved.` };
}
resolveItem.perm = 'reconcile';

export function postReceiptToQbo(db, p, ctx) {
  const r = db.receipts.find((x) => x.id === p.receiptId); if (!r || r.state !== 'Verified' || r.qboRef) return err('Receipt cannot be posted.');
  const id = 'QBO-' + (r.recipient === 'MFC' ? 'DEP-' : r.recipient + '-') + (++db.seq.QB);
  db.qbo.push({ id, company: r.recipient, type: 'Deposit', date: r.depositedDate || TODAY, amountCents: r.amountCents, memo: `Deposit ${r.payerName} (simulated posting)`, state: 'Matched', mappedCaseIds: [], matchedReceiptId: r.id, obId: null, adjId: null, differenceCents: 0, reason: '', owner: 'Reconciliation Lead', lastSync: TODAY + ' now', voided: false, resolvedNote: '' });
  r.qboRef = id;
  audit(db, ctx, { entityType: 'reconciliation', entityId: id, action: 'Simulated QBO posting', detail: `${r.id} posted to simulated QBO as ${id}` });
  return { ok: true, msg: `Simulated QBO deposit ${id} created and matched to ${r.id}.` };
}
postReceiptToQbo.perm = 'reconcile';

export function importQBO(db, p, ctx) {
  const snap = () => JSON.stringify(Object.entries(derive(db).ob).map(([k, v]) => [k, v.outstanding, v.cash]));
  const before = snap();
  let added = 0, dup = 0;
  db.importBatch.txns.forEach((t) => {
    if (db.qbo.some((x) => x.id === t.id)) { dup += 1; return; }
    db.qbo.push({ ...clone(t), matchedReceiptId: null, obId: null, adjId: null, differenceCents: 0, owner: 'Reconciliation Lead', lastSync: TODAY + ' now', resolvedNote: '' }); added += 1;
  });
  const unchanged = snap() === before;
  const run = nextId(db, 'IMP', 'RUN');
  db.importRuns.unshift({ id: run, at: stamp(), added, dup, unchanged, by: ctx.actor });
  audit(db, ctx, { entityType: 'reconciliation', entityId: run, action: 'Simulated QBO import', detail: `${added} new, ${dup} duplicate${dup === 1 ? '' : 's'} ignored. App balances ${unchanged ? 'unchanged' : 'changed'}.` });
  return { ok: true, msg: added ? `Import ${run}: ${added} new record${added > 1 ? 's' : ''} need review, ${dup} duplicates ignored. App balances unchanged.` : `Import ${run}: replay detected. ${dup} duplicates ignored, nothing changed, balances unchanged.` };
}
importQBO.perm = 'importQBO';

// ---------- Settings ----------
export function updateSettings(db, p, ctx) {
  Object.assign(db.settings, p.patch);
  audit(db, ctx, { entityType: 'settings', entityId: 'settings', action: 'Rule changed', detail: Object.entries(p.patch).map(([k, v]) => `${k}=${v}`).join(', ') });
  return { ok: true, msg: 'Rule updated. New activity uses it; existing records keep their history.' };
}
updateSettings.perm = 'approve';
export function togglePerm(db, p, ctx) {
  if (ctx.role !== 'CEO') return err('Only the CEO role can change team permissions.');
  if (p.role === 'CEO') return err('CEO permissions are fixed in this demo.');
  db.perms[p.role][p.action] = !db.perms[p.role][p.action];
  audit(db, ctx, { entityType: 'settings', entityId: p.role, action: 'Permission changed', detail: `${p.role}: ${p.action} ${db.perms[p.role][p.action] ? 'granted' : 'removed'}` });
  return { ok: true, msg: `${p.role}: permission ${db.perms[p.role][p.action] ? 'granted' : 'removed'}.` };
}
export function previewMigration(db, p, ctx) {
  db.migration.previewed = true;
  audit(db, ctx, { entityType: 'settings', entityId: db.migration.batch, action: 'Migration batch previewed', detail: 'Preview only; no records were created' });
  return { ok: true, msg: 'Migration preview recorded. No records were created or changed.' };
}
export { STAGE_REQ };
