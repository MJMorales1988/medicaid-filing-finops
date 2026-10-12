// Fictional seed data (scenarios A-K plus extras). No real people, patients or balances.
export const ROLES = ['CEO', 'Intake', 'Accounting', 'Policy Coordinator', 'Property Coordinator'];
export const ACTORS = {
  CEO: 'Dana Whitfield',
  Intake: 'Intake Coordinator',
  Accounting: 'Accounting Lead',
  'Policy Coordinator': 'Policy Coordinator',
  'Property Coordinator': 'Property Coordinator',
};
export const OWNERS = ['Intake Coordinator', 'Accounting Lead', 'Policy Coordinator', 'Property Coordinator', 'Reconciliation Lead', 'Dana Whitfield'];
export const CASE_STAGES = ['Onboarding', 'Application', 'Documentation', 'Submitted', 'Approval', 'Star Plus', 'Closed'];
export const POLICY_STAGES = [
  ['referral', 'Referral'], ['review', 'Review'], ['forms', 'Forms / POA'], ['contracts', 'Contracts'], ['processing', 'Processing'],
  ['ownership', 'Ownership confirmed'], ['premium', 'Premium setup'], ['active', 'Active'], ['claim', 'Claim'], ['inactive', 'Inactive'],
];
export const DEAL_STAGES = [
  ['referral', 'Referral'], ['assessment', 'Assessment'], ['agreement', 'Agreement'], ['listed', 'Listed'],
  ['contract', 'Under contract'], ['closing', 'Closing'], ['closed', 'Closed'], ['wrapup', 'Wrap-up'],
];
export const CHECKLIST_LABELS = {
  referralReceived: 'Referral received', policyReviewed: 'Policy reviewed', formsPoaSigned: 'Forms / POA signed',
  contractsSigned: 'Contracts signed', processingSubmitted: 'Submitted to carrier', ownershipEvidence: 'Ownership evidence on file',
  beneficiaryUpdated: 'Beneficiary evidence on file', premiumSetup: 'Premium payments set up',
};
const R0 = [], R1 = ['referralReceived'], R2 = [...R1, 'policyReviewed'], R3 = [...R2, 'formsPoaSigned'], R4 = [...R3, 'contractsSigned'];
const R5 = [...R4, 'processingSubmitted', 'ownershipEvidence'], R6 = [...R5, 'beneficiaryUpdated'], R7 = [...R6, 'premiumSetup'];
export const STAGE_REQ = { referral: R0, review: R1, forms: R2, contracts: R3, processing: R4, ownership: R5, premium: R6, active: R7, claim: R7, inactive: R0 };
export const DEAL_EVIDENCE = [
  ['deedOfTrust', 'Deed of trust'], ['promissoryNote', 'Promissory note'], ['recording', 'Recording confirmation'],
  ['titleInvoice', 'Title invoice'], ['closingStatement', 'Closing statement'],
];
export const PERM_LABELS = {
  recordReceipt: 'Record receipts', verifyReceipt: 'Verify receipts', allocate: 'Allocate receipts', reverse: 'Reverse receipts / allocations',
  refund: 'Request refunds', proposeAdjustment: 'Propose deductions / write-offs', approve: 'Decide approvals',
  draftAgreement: 'Draft agreements', verifyAgreement: 'Verify agreements', amendAgreement: 'Amend agreements',
  assignOwner: 'Assign financial owner', followUp: 'Follow-ups and outcomes', caseStage: 'Change operational stage',
  reconcile: 'Match / resolve reconciliation', importQBO: 'Run QBO import', policyWork: 'Policy Solutions workflow',
  dealWork: 'Simply Sold workflow', closeFinance: 'Propose financial closure', manageTasks: 'Manage tasks',
};
const ALL = Object.keys(PERM_LABELS);
export const DEFAULT_PERMS = () => {
  const mk = (list) => Object.fromEntries(ALL.map((k) => [k, list.includes(k)]));
  return {
    CEO: mk(ALL),
    Intake: mk(['draftAgreement', 'followUp', 'caseStage', 'manageTasks']),
    Accounting: mk(['recordReceipt', 'verifyReceipt', 'allocate', 'reverse', 'refund', 'proposeAdjustment', 'approve', 'draftAgreement', 'verifyAgreement', 'amendAgreement', 'assignOwner', 'followUp', 'reconcile', 'importQBO', 'closeFinance', 'manageTasks']),
    'Policy Coordinator': mk(['policyWork', 'draftAgreement', 'followUp', 'manageTasks']),
    'Property Coordinator': mk(['dealWork', 'draftAgreement', 'followUp', 'manageTasks']),
  };
};
export const DEFAULT_SETTINGS = () => ({
  dueDays: 14, graceDays: 0, psExchangeCreatesObligation: true, ownershipFulfillsClient: true,
  closingActivatesDue: true, requireReviewerDifferent: true, matchToleranceCents: 0,
});

export function seed() {
  const db = {
    v: 3, seq: { RC: 4008, AL: 5004, AJ: 6002, AP: 7003, TK: 10, FU: 2, DOC: 9000, QB: 9100, AU: 0, OB: 3013, AG: 2015, CP: 100, FE: 4, CS: 1015, EV: 0, IMP: 0, NC: 0 },
    settings: DEFAULT_SETTINGS(), perms: DEFAULT_PERMS(),
    patients: [], cases: [], agreements: [], obligations: [], receipts: [], allocations: [], adjustments: [], noncash: [],
    approvals: [], fulfillment: [], documents: [], tasks: [], policies: [], deals: [], qbo: [], rejectedPairs: [],
    importRuns: [], audit: [],
    importBatch: { id: 'IMP-2026-10-13', label: 'Simulated QBO nightly export (Oct 13)', txns: [] },
    migration: { batch: 'MIG-2026-10 (legacy tracker)', previewed: false, rows: [] },
    guide: { done: {} },
  };
  let dn = 0;
  const doc = (caseId, kind, name, status = 'Verified', extra = {}) => {
    dn += 1; const id = 'DOC-' + (9000 + dn);
    db.documents.push({ id, caseId, kind, name, status, date: extra.date || '2026-08-01', pages: extra.pages || 4, hash: 'sha256:' + (1000 + dn * 7919).toString(16).padEnd(8, '0') + '…demo', note: extra.note || 'Fictional document metadata for demonstration. No real file is stored.' });
    return id;
  };
  db.seq.DOC = 9000 + 60;
  const pt = (id, name) => db.patients.push({ id, name });
  [['PT-001', 'Avery Stone'], ['PT-002', 'Jordan Reed'], ['PT-003', 'Morgan Lake'], ['PT-004', 'Taylor Brooks'], ['PT-005', 'Casey Hill'],
    ['PT-006', 'Nia Cole'], ['PT-007', 'Omar Pike'], ['PT-008', 'Elise Pike'], ['PT-009', 'Lena Ward'], ['PT-010', 'Riley Park'],
    ['PT-011', 'Sam Vale'], ['PT-012', 'Drew West'], ['PT-013', 'Quinn Moss'], ['PT-014', 'Wren Ashby'], ['PT-015', 'Elliot Frost']].forEach(([i, n]) => pt(i, n));
  const cs = (id, pts, label, op, worker, extra = {}) => db.cases.push({ id, patientIds: pts, label, opStatus: op, caseworker: worker, financialOwner: 'Accounting Lead', finClosed: false, finClosedAt: null, finClosedKind: null, sharedFee: false, ...extra });
  cs('CS-1001', ['PT-001'], 'Initial Medicaid application', 'Closed', 'M. Alvarez', { finClosed: true, finClosedAt: '2026-08-20', finClosedKind: 'Cash settled' });
  cs('CS-1002', ['PT-002'], 'Initial application (attorney-collected)', 'Approval', 'T. Okafor');
  cs('CS-1003', ['PT-003'], 'Application with policy exchange', 'Star Plus', 'J. Lindqvist', { financialOwner: 'Policy Coordinator' });
  cs('CS-1004', ['PT-004'], 'Application with property pledge', 'Approval', 'S. Rahman', { financialOwner: 'Property Coordinator' });
  cs('CS-1005', ['PT-005'], 'Medicaid approved, case closed', 'Closed', 'M. Alvarez', { financialOwner: 'Intake Coordinator' });
  cs('CS-1006', ['PT-006'], 'Initial application', 'Submitted', 'T. Okafor');
  cs('CS-1007', ['PT-007', 'PT-008'], 'Couple application (one shared fee)', 'Documentation', 'J. Lindqvist', { sharedFee: true });
  cs('CS-1008', ['PT-009'], 'Initial application', 'Application', 'S. Rahman');
  cs('CS-1009', ['PT-010'], 'Annuity-based plan', 'Star Plus', 'M. Alvarez');
  cs('CS-1010', ['PT-011'], 'Initial application (agreement incomplete)', 'Onboarding', 'T. Okafor', { financialOwner: 'Intake Coordinator' });
  cs('CS-1011', ['PT-012'], 'Medicaid approved, case closed', 'Closed', 'J. Lindqvist');
  cs('CS-1012', ['PT-013'], 'CareNow with property pledge', 'Application', 'S. Rahman', { financialOwner: 'Property Coordinator' });
  cs('CS-1013', ['PT-014'], 'Application with policy transfer', 'Documentation', 'M. Alvarez', { financialOwner: 'Policy Coordinator' });
  cs('CS-1014', ['PT-015'], 'Policy purchase and application', 'Approval', 'T. Okafor', { financialOwner: 'Policy Coordinator' });
  cs('CS-1015', ['PT-001'], 'Renewal 2026-27', 'Onboarding', 'M. Alvarez');

  // ---- Agreements, versions, components ----
  const comp = (id, kind, label, amt, o = {}) => ({ id, kind, label, amountCents: amt, debtorType: 'Client', debtorName: '', trigger: 'Due date', dueDate: null, createsAt: 'verify', category: 'Direct fee', clientSide: true, direct: true, collateral: null, ...o });
  const ag = (id, caseId, type, gross, comps, o = {}) => {
    const ver = { v: 1, status: o.status || 'Verified', signedDate: o.signed || null, parties: o.parties || [], grossFeeCents: gross, legalFeeCents: o.legal || 0, components: comps, terms: o.terms || '', docId: o.docId === undefined ? doc(caseId, 'Signed EA', 'Signed EA – ' + caseId + ' v1.pdf', 'Verified', { date: o.signed, pages: 6 }) : o.docId, unknownReason: o.reason || '', draftedBy: o.drafted || 'Intake Coordinator', verifiedBy: o.status === 'Draft' ? null : (o.verifier || 'Accounting Lead'), verifiedAt: o.status === 'Draft' ? null : (o.signed || null), deltas: [], note: '' };
    db.agreements.push({ id, caseId, type, status: ver.status, currentVersion: 1, verifiedVersion: ver.status === 'Verified' ? 1 : null, pending: null, versions: [ver] });
  };
  const P = (n) => ['MFC', n];
  ag('AG-2001', 'CS-1001', 'engagement', 1200000, [comp('CP-2001-1', 'Cash fee', 'Direct fee payable to MFC', 1200000, { debtorName: 'Avery Stone', dueDate: '2026-07-18' })], { signed: '2026-06-18', parties: P('Avery Stone') });
  ag('AG-2002', 'CS-1002', 'engagement', 1200000, [
    comp('CP-2002-1', 'Attorney-collected fee', 'Fee collected by attorney, remitted to MFC', 1200000, { debtorType: 'Attorney', debtorName: 'Harbor Law (attorney of record)', dueDate: '2026-09-15', category: 'Attorney remittance', direct: false }),
    comp('CP-2002-2', 'Legal fee', 'Approved legal fee deducted by attorney', 60000, { createsAt: 'none', clientSide: false, direct: false, debtorType: 'Attorney', debtorName: 'Harbor Law' })], { signed: '2026-07-20', parties: [...P('Jordan Reed'), 'Harbor Law'], legal: 60000 });
  ag('AG-2003', 'CS-1003', 'engagement', 800000, [comp('CP-2003-1', 'Policy exchange', 'Policy transferred to Policy Solutions in exchange for fee', 800000, { debtorType: 'Policy Solutions', debtorName: 'Policy Solutions (PS)', trigger: 'Ownership confirmed', createsAt: 'ownership', category: 'Policy exchange', direct: false })], { signed: '2026-08-02', parties: [...P('Morgan Lake'), 'Policy Solutions'] });
  ag('AG-2004', 'CS-1004', 'engagement', 750000, [comp('CP-2004-1', 'Property proceeds', 'Fee from house-sale proceeds, secured by deed of trust', 750000, { debtorType: 'Title/Escrow', debtorName: 'Lakeshore Title (fictional escrow)', trigger: 'Closing verified', category: 'Property proceeds', direct: false, collateral: { type: 'Deed of Trust', desc: 'Deed of trust on 14 Alder Court' } })], { signed: '2026-07-30', parties: [...P('Taylor Brooks'), 'Simply Sold'] });
  ag('AG-2005', 'CS-1005', 'engagement', 120000, [comp('CP-2005-1', 'Cash fee', 'Direct fee payable to MFC', 120000, { debtorName: 'Casey Hill', dueDate: '2026-08-20' })], { signed: '2026-05-10', parties: P('Casey Hill'), docId: null });
  [['AG-2006', 'CS-1006', 'Nia Cole'], ['AG-2007', 'CS-1007', 'Omar Pike & Elise Pike'], ['AG-2008', 'CS-1008', 'Lena Ward']].forEach(([a, c, n], i) =>
    ag(a, c, 'engagement', 300000, [comp('CP-' + a.slice(3) + '-1', 'Cash fee', 'Direct fee payable to MFC', 300000, { debtorName: n, dueDate: '2026-10-31' })], { signed: '2026-09-' + (10 + i * 2), parties: P(n) }));
  ag('AG-2009', 'CS-1009', 'annuity', 400000, [comp('CP-2009-1', 'Cash fee', 'Annuity plan fee payable to MFC', 400000, { debtorName: 'Riley Park', dueDate: '2026-09-30' })], { signed: '2026-08-28', parties: P('Riley Park') });
  ag('AG-2010', 'CS-1010', 'engagement', null, [comp('CP-2010-1', 'Cash fee', 'Direct fee payable to MFC', null, { debtorName: 'Sam Vale', dueDate: '2026-11-15' })], { status: 'Draft', signed: '2026-10-01', parties: P('Sam Vale'), docId: null, reason: 'Fee schedule page missing from the scanned agreement; confirm with client.' });
  ag('AG-2011', 'CS-1011', 'engagement', 500000, [comp('CP-2011-1', 'Cash fee', 'Direct fee payable to MFC', 500000, { debtorName: 'Drew West', dueDate: '2026-09-02' })], { signed: '2026-04-15', parties: P('Drew West') });
  ag('AG-2012', 'CS-1012', 'CareNow', 1000000, [comp('CP-2012-1', 'Property proceeds', 'CareNow advance repaid from future sale, secured by deed of trust', 1000000, { debtorType: 'Title/Escrow', debtorName: 'To be assigned at sale', trigger: 'Sale event', category: 'Collateral-backed', direct: false, collateral: { type: 'Deed of Trust', desc: 'Deed of trust on 77 Fern Row' } })], { signed: '2026-09-10', parties: [...P('Quinn Moss'), 'Simply Sold'] });
  ag('AG-2013', 'CS-1013', 'engagement', 650000, [comp('CP-2013-1', 'Policy exchange', 'Policy transferred to Policy Solutions in exchange for fee', 650000, { debtorType: 'Policy Solutions', debtorName: 'Policy Solutions (PS)', trigger: 'Ownership confirmed', createsAt: 'ownership', category: 'Policy exchange', direct: false })], { signed: '2026-09-22', parties: [...P('Wren Ashby'), 'Policy Solutions'] });
  ag('AG-2014', 'CS-1014', 'policy purchase', 350000, [
    comp('CP-2014-1', 'Cash fee', 'Direct fee payable to MFC', 350000, { debtorName: 'Elliot Frost', dueDate: '2026-11-15' }),
    comp('CP-2014-2', 'Cash purchase', 'PS cash purchase of policy, paid to client (not an MFC receivable)', 250000, { createsAt: 'none', clientSide: false, direct: false, debtorType: 'Policy Solutions', debtorName: 'Policy Solutions (PS)' })], { signed: '2026-09-05', parties: [...P('Elliot Frost'), 'Policy Solutions'] });
  ag('AG-2015', 'CS-1015', 'renewal', 240000, [comp('CP-2015-1', 'Cash fee', 'Renewal fee payable to MFC', 240000, { debtorName: 'Avery Stone', dueDate: '2026-11-30' })], { signed: '2026-10-05', parties: P('Avery Stone') });

  // ---- Obligations ----
  const ob = (id, caseId, agId, compId, o) => db.obligations.push({ id, caseId, agId, compId, creditor: 'MFC', entity: 'MFC', currency: 'USD', triggerState: 'Active', dueDate: null, trigger: 'Due date', activeFrom: null, owner: 'Accounting Lead', manualNext: '', disputed: false, evidence: 'Complete', collateral: null, reviewDate: null, outcomes: [], followUps: [], verified: true, ...o });
  ob('OB-3001', 'CS-1001', 'AG-2001', 'CP-2001-1', { category: 'Direct fee', debtorType: 'Client', debtorName: 'Avery Stone', principalCents: 1200000, dueDate: '2026-07-18', activeFrom: '2026-06-18' });
  ob('OB-3002', 'CS-1002', 'AG-2002', 'CP-2002-1', { category: 'Attorney remittance', debtorType: 'Attorney', debtorName: 'Harbor Law (attorney of record)', principalCents: 1200000, dueDate: '2026-09-15', activeFrom: '2026-07-20' });
  ob('OB-3003', 'CS-1003', 'AG-2003', 'CP-2003-1', { category: 'Policy exchange', debtorType: 'Policy Solutions', debtorName: 'Policy Solutions (PS)', principalCents: 800000, dueDate: '2026-10-19', trigger: 'Ownership confirmed 2026-10-05', activeFrom: '2026-10-05', owner: 'Policy Coordinator' });
  ob('OB-3004', 'CS-1004', 'AG-2004', 'CP-2004-1', { category: 'Property proceeds', debtorType: 'Title/Escrow', debtorName: 'Lakeshore Title (fictional escrow)', principalCents: 750000, dueDate: '2026-10-22', trigger: 'Closing verified 2026-10-08', activeFrom: '2026-10-08', owner: 'Property Coordinator', collateral: { type: 'Deed of Trust', desc: 'Deed of trust on 14 Alder Court' } });
  ob('OB-3005', 'CS-1005', 'AG-2005', 'CP-2005-1', { category: 'Direct fee', debtorType: 'Client', debtorName: 'Casey Hill', principalCents: 120000, dueDate: '2026-08-20', activeFrom: '2026-05-10', owner: 'Intake Coordinator', disputed: true, evidence: 'Missing signed EA' });
  [['OB-3006', 'CS-1006', 'AG-2006', 'Nia Cole'], ['OB-3007', 'CS-1007', 'AG-2007', 'Omar Pike & Elise Pike'], ['OB-3008', 'CS-1008', 'AG-2008', 'Lena Ward']].forEach(([o, c, a, n]) =>
    ob(o, c, a, 'CP-' + a.slice(3) + '-1', { category: 'Direct fee', debtorType: 'Client', debtorName: n, principalCents: 300000, dueDate: '2026-10-31', activeFrom: '2026-09-12' }));
  ob('OB-3009', 'CS-1009', 'AG-2009', 'CP-2009-1', { category: 'Direct fee', debtorType: 'Client', debtorName: 'Riley Park', principalCents: 400000, dueDate: '2026-09-30', activeFrom: '2026-08-28' });
  ob('OB-3010', 'CS-1011', 'AG-2011', 'CP-2011-1', { category: 'Direct fee', debtorType: 'Client', debtorName: 'Drew West', principalCents: 500000, dueDate: '2026-09-02', activeFrom: '2026-04-15' });
  ob('OB-3011', 'CS-1012', 'AG-2012', 'CP-2012-1', { category: 'Collateral-backed', debtorType: 'Title/Escrow', debtorName: 'To be assigned at sale', principalCents: 1000000, trigger: 'Sale event', triggerState: 'Awaiting', activeFrom: '2026-09-10', owner: 'Property Coordinator', reviewDate: '2026-11-15', collateral: { type: 'Deed of Trust', desc: 'Deed of trust on 77 Fern Row' }, followUps: [{ id: 'FU-1', date: '2026-11-15', note: 'Review sale status and listing activity', owner: 'Property Coordinator', done: false }] });
  ob('OB-3012', 'CS-1014', 'AG-2014', 'CP-2014-1', { category: 'Direct fee', debtorType: 'Client', debtorName: 'Elliot Frost', principalCents: 350000, dueDate: '2026-11-15', activeFrom: '2026-09-05' });
  ob('OB-3013', 'CS-1015', 'AG-2015', 'CP-2015-1', { category: 'Direct fee', debtorType: 'Client', debtorName: 'Avery Stone', principalCents: 240000, dueDate: '2026-11-30', activeFrom: '2026-10-05' });

  // ---- Receipts and allocations ----
  const rc = (id, payer, payerType, rec, amt, recvd, dep, method, ref, state, evidence, qbo, o = {}) => db.receipts.push({ id, kind: 'receipt', payerName: payer, payerType, recipient: rec, currency: 'USD', receivedDate: recvd, depositedDate: dep, amountCents: amt, method, reference: ref, state, evidence, qboRef: qbo, refundedCents: 0, internal: ['Policy Solutions', 'Simply Sold', 'MFC'].includes(payerType), memo: '', recordedBy: 'Accounting Lead', ...o });
  rc('RC-4001', 'Avery Stone', 'Client', 'MFC', 1200000, '2026-07-22', '2026-07-23', 'Wire', 'WIRE-AS-0722', 'Verified', 'Bank advice AS-0722', 'QBO-DEP-7001');
  rc('RC-4002', 'Harbor Law', 'Attorney', 'MFC', 600000, '2026-09-28', '2026-09-29', 'ACH', 'ACH-HL-0928', 'Verified', 'Bank advice HL-0928', 'QBO-DEP-7002', { memo: 'First remittance; legal fee of $600 already deducted by attorney' });
  rc('RC-4003', 'Cole Family Trust', 'Client', 'MFC', 900000, '2026-10-08', '2026-10-09', 'Check', 'CHK-4471', 'Verified', 'Check image CHK-4471', 'QBO-DEP-7003', { memo: 'One check covering three client fees' });
  rc('RC-4004', 'Riley Park', 'Client', 'MFC', 500000, '2026-10-05', '2026-10-06', 'Wire', 'WIRE-RP-1005', 'Verified', 'Bank advice RP-1005', 'QBO-DEP-7004');
  rc('RC-4005', 'Drew West', 'Client', 'MFC', 420000, '2026-08-18', '2026-08-19', 'Check', 'CHK-2290', 'Verified', 'Check image CHK-2290', 'QBO-DEP-7005');
  rc('RC-4006', 'Gale Ferris', 'Client', 'PS', 250000, '2026-10-01', '2026-10-02', 'ACH', 'ACH-GF-1001', 'Verified', 'Bank advice GF-1001', 'QBO-PS-0101', { memo: 'Received by Policy Solutions (not MFC)', recordedBy: 'Policy Coordinator' });
  rc('RC-4007', 'Mara Quill', 'Client', 'MFC', 150000, '2026-10-10', '2026-10-11', 'Wire', 'WIRE-MQ-1010', 'Verified', 'Bank advice MQ-1010', 'QBO-DEP-7007', { currency: 'CAD', memo: 'Canadian-dollar deposit; not allocatable to USD obligations' });
  rc('RC-4008', 'Casey Hill', 'Client', 'MFC', 60000, '2026-10-09', null, 'Check', 'CHK-3098', 'Reported', null, null, { memo: 'Client says a check was mailed; not yet seen at the bank', recordedBy: 'Intake Coordinator' });
  const al = (id, r, o, amt, at) => db.allocations.push({ id, receiptId: r, obId: o, amountCents: amt, status: 'Active', kind: 'alloc', at, by: 'Accounting Lead' });
  al('AL-5001', 'RC-4001', 'OB-3001', 1200000, '2026-07-23T10:00:00');
  al('AL-5002', 'RC-4002', 'OB-3002', 600000, '2026-09-29T10:00:00');
  al('AL-5003', 'RC-4004', 'OB-3009', 400000, '2026-10-06T10:00:00');
  al('AL-5004', 'RC-4005', 'OB-3010', 420000, '2026-08-19T10:00:00');

  // ---- Adjustments and approvals ----
  db.adjustments.push(
    { id: 'AJ-6001', obId: 'OB-3002', kind: 'Credit', amountCents: 60000, reason: 'Approved legal fee kept by Harbor Law', status: 'Approved', proposedBy: 'Accounting Lead', proposedAt: '2026-09-01T09:00:00', decidedBy: 'Dana Whitfield', decidedAt: '2026-09-02T09:00:00' },
    { id: 'AJ-6002', obId: 'OB-3010', kind: 'Writeoff', amountCents: 80000, reason: 'Client unreachable after three attempts; collection cost exceeds balance', status: 'Pending', proposedBy: 'Accounting Lead', proposedAt: '2026-10-09T09:00:00', decidedBy: null, decidedAt: null });
  db.approvals.push(
    { id: 'AP-7001', kind: 'Deduction', refId: 'AJ-6001', caseId: 'CS-1002', amountCents: 60000, summary: 'Approved legal fee deduction on OB-3002', proposedBy: 'Accounting Lead', proposedAt: '2026-09-01T09:00:00', status: 'Approved', decidedBy: 'Dana Whitfield', decidedAt: '2026-09-02T09:00:00', note: 'Matches engagement agreement legal fee term.', effect: 'Adjusted obligation reduced by $600.00' },
    { id: 'AP-7002', kind: 'Write-off', refId: 'AJ-6002', caseId: 'CS-1011', amountCents: 80000, summary: 'Write off remaining $800.00 on OB-3010 (Drew West)', proposedBy: 'Accounting Lead', proposedAt: '2026-10-09T09:00:00', status: 'Pending', decidedBy: null, decidedAt: null, note: '', effect: '' },
    { id: 'AP-7003', kind: 'Refund', refId: 'RC-4004', caseId: 'CS-1009', amountCents: 100000, summary: 'Refund $1,000.00 unapplied overpayment to Riley Park (simulated)', proposedBy: 'Reconciliation Lead', proposedAt: '2026-10-12T09:00:00', status: 'Pending', decidedBy: null, decidedAt: null, note: '', effect: '', payload: { receiptId: 'RC-4004', amountCents: 100000, payee: 'Riley Park', method: 'ACH' } });

  // ---- Fulfillment events (client-side performance; never MFC cash by themselves) ----
  db.fulfillment.push(
    { id: 'FE-1', caseId: 'CS-1002', compId: 'CP-2002-1', kind: 'Client paid attorney', amountCents: 1200000, date: '2026-08-04', evidence: 'Harbor Law trust receipt HL-TR-2208', mfcCash: false },
    { id: 'FE-2', caseId: 'CS-1003', compId: 'CP-2003-1', kind: 'Policy ownership transferred to PS', amountCents: 800000, date: '2026-10-05', evidence: 'Ownership assignment (recorded)', mfcCash: false },
    { id: 'FE-3', caseId: 'CS-1004', compId: 'CP-2004-1', kind: 'Property closing verified', amountCents: 750000, date: '2026-10-08', evidence: 'Closing statement SS-8001', mfcCash: false });
  doc('CS-1002', 'Attorney evidence', 'Harbor Law trust receipt HL-TR-2208.pdf');

  // ---- Policies ----
  const chk = (n) => Object.fromEntries(Object.keys(CHECKLIST_LABELS).map((k, i) => [k, i < n]));
  db.policies.push(
    { id: 'POL-7001', caseId: 'CS-1003', agId: 'AG-2003', compId: 'CP-2003-1', obId: 'OB-3003', carrier: 'Northline Life (fictional)', policyNo: 'NL-DEMO-0001', faceCents: 3000000, cashValueCents: 950000, exchangeValueCents: 800000, cashPurchaseCents: 0, stage: 'ownership', checklist: { ...chk(5), ownershipEvidence: true, beneficiaryUpdated: true, premiumSetup: false }, evidence: { ownership: { status: 'Verified', note: 'Ownership assignment recorded 2026-10-05', docId: doc('CS-1003', 'Ownership evidence', 'Ownership assignment NL-DEMO-0001.pdf') }, beneficiary: { status: 'Verified', note: 'Beneficiary change confirmed by carrier', docId: doc('CS-1003', 'Beneficiary evidence', 'Beneficiary confirmation NL-DEMO-0001.pdf') } }, team: { coordinator: 'Policy Coordinator', agent: 'R. Beltran', processor: 'L. Okoye' }, owner: 'Policy Coordinator', premiumHistory: [], claimHistory: [], overrides: [] },
    { id: 'POL-7002', caseId: 'CS-1013', agId: 'AG-2013', compId: 'CP-2013-1', obId: null, carrier: 'Cedar Mutual (fictional)', policyNo: 'CM-DEMO-0442', faceCents: 1800000, cashValueCents: 690000, exchangeValueCents: 650000, cashPurchaseCents: 0, stage: 'processing', checklist: { ...chk(4) }, evidence: { ownership: { status: 'Pending', note: '', docId: null }, beneficiary: { status: 'Pending', note: '', docId: null } }, team: { coordinator: 'Policy Coordinator', agent: 'R. Beltran', processor: 'L. Okoye' }, owner: 'Policy Coordinator', premiumHistory: [], claimHistory: [], overrides: [] },
    { id: 'POL-7003', caseId: 'CS-1014', agId: 'AG-2014', compId: 'CP-2014-2', obId: null, carrier: 'Northline Life (fictional)', policyNo: 'NL-DEMO-0187', faceCents: 2200000, cashValueCents: 620000, exchangeValueCents: 0, cashPurchaseCents: 250000, stage: 'premium', checklist: { ...chk(5), ownershipEvidence: false, beneficiaryUpdated: false }, evidence: { ownership: { status: 'Missing', note: '', docId: null }, beneficiary: { status: 'Missing', note: '', docId: null } }, team: { coordinator: 'Policy Coordinator', agent: 'A. Nwosu', processor: 'L. Okoye' }, owner: 'Policy Coordinator', premiumHistory: [{ date: '2026-10-02', amountCents: 41000, note: 'First premium (paid by PS)' }], claimHistory: [], overrides: [] },
    { id: 'POL-7004', caseId: 'CS-1006', agId: null, compId: null, obId: null, carrier: 'Cedar Mutual (fictional)', policyNo: 'Unknown', faceCents: null, cashValueCents: null, exchangeValueCents: null, cashPurchaseCents: 0, stage: 'referral', checklist: { ...chk(0) }, evidence: { ownership: { status: 'Pending', note: '', docId: null }, beneficiary: { status: 'Pending', note: '', docId: null } }, team: { coordinator: 'Policy Coordinator', agent: 'Unassigned', processor: 'Unassigned' }, owner: 'Policy Coordinator', premiumHistory: [], claimHistory: [], overrides: [] });

  // ---- Simply Sold deals ----
  const ev = (st, c, n) => ({ status: st, docId: st === 'Verified' ? doc(c, 'Property evidence', n) : null });
  db.deals.push(
    { id: 'SS-8001', caseId: 'CS-1004', obId: 'OB-3004', compId: 'CP-2004-1', stage: 'closed', property: { address: '14 Alder Court, Fictional Springs', valueCents: 31200000 }, entitlementCents: 750000, components: { collateralLien: true, saleProceeds: true, titleTransfer: false, careNow: false }, evidence: { deedOfTrust: ev('Verified', 'CS-1004', 'Deed of trust 14 Alder Court.pdf'), promissoryNote: ev('Verified', 'CS-1004', 'Promissory note 14 Alder Court.pdf'), recording: ev('Verified', 'CS-1004', 'Recording confirmation.pdf'), titleInvoice: ev('Verified', 'CS-1004', 'Title invoice LT-2210.pdf'), closingStatement: ev('Verified', 'CS-1004', 'Closing statement SS-8001.pdf') }, closingDate: '2026-10-08', closingVerified: true, titleCompany: 'Lakeshore Title (fictional escrow)', proceedsRecipient: 'Pending: proceeds not yet received by MFC', feeAllocations: [{ label: 'Existing mortgage payoff', amountCents: 16000000 }, { label: 'Title and recording fees', amountCents: 184000 }, { label: 'MFC entitlement (agreed fee)', amountCents: 750000 }, { label: 'Net to client', amountCents: 14266000 }], owner: 'Property Coordinator' },
    { id: 'SS-8002', caseId: 'CS-1012', obId: 'OB-3011', compId: 'CP-2012-1', stage: 'listed', property: { address: '77 Fern Row, Fictional Springs', valueCents: 26800000 }, entitlementCents: 1000000, components: { collateralLien: true, saleProceeds: true, titleTransfer: false, careNow: true }, evidence: { deedOfTrust: ev('Verified', 'CS-1012', 'Deed of trust 77 Fern Row.pdf'), promissoryNote: ev('Verified', 'CS-1012', 'Promissory note 77 Fern Row.pdf'), recording: ev('Verified', 'CS-1012', 'Recording confirmation 77 Fern Row.pdf'), titleInvoice: { status: 'Pending', docId: null }, closingStatement: { status: 'Pending', docId: null } }, closingDate: null, closingVerified: false, titleCompany: 'To be assigned', proceedsRecipient: 'Pending', feeAllocations: [], owner: 'Property Coordinator' },
    { id: 'SS-8003', caseId: 'CS-1010', obId: null, compId: null, stage: 'referral', property: { address: '9 Linden Way, Fictional Springs', valueCents: null }, entitlementCents: null, components: { collateralLien: false, saleProceeds: false, titleTransfer: true, careNow: false }, evidence: { deedOfTrust: { status: 'Pending', docId: null }, promissoryNote: { status: 'Pending', docId: null }, recording: { status: 'Pending', docId: null }, titleInvoice: { status: 'Pending', docId: null }, closingStatement: { status: 'Pending', docId: null } }, closingDate: null, closingVerified: false, titleCompany: 'To be assigned', proceedsRecipient: 'Pending', feeAllocations: [], owner: 'Property Coordinator' });

  // ---- Tasks ----
  const tk = (n, title, caseId, owner, due, o = {}) => db.tasks.push({ id: 'TK-' + n, title, caseId, obId: o.obId || null, owner, due, status: 'Open', outcome: '', escalated: false, link: o.link || null, kind: o.kind || 'Collections' });
  tk(1, 'Chase Harbor Law for the final $5,400.00 remittance', 'CS-1002', 'Accounting Lead', '2026-10-14', { obId: 'OB-3002' });
  tk(2, 'Verify Casey Hill reported check CHK-3098 ($600.00)', 'CS-1005', 'Accounting Lead', '2026-10-14', { obId: 'OB-3005' });
  tk(3, 'Obtain missing signed EA copy for Casey Hill', 'CS-1005', 'Intake Coordinator', '2026-10-10', { kind: 'Evidence' });
  tk(4, 'Allocate Cole Family Trust $9,000.00 across three cases', 'CS-1006', 'Accounting Lead', '2026-10-14', { kind: 'Allocation' });
  tk(5, 'Complete Sam Vale fee schedule and verify agreement', 'CS-1010', 'Intake Coordinator', '2026-10-15', { kind: 'Agreement' });
  tk(6, 'Confirm Wren Ashby policy ownership transfer', 'CS-1013', 'Policy Coordinator', '2026-10-20', { kind: 'Policy' });
  tk(7, 'Follow up with Lakeshore Title on closing proceeds', 'CS-1004', 'Property Coordinator', '2026-10-16', { obId: 'OB-3004', kind: 'Property' });
  tk(8, 'Review Quinn Moss sale status', 'CS-1012', 'Property Coordinator', '2026-11-15', { obId: 'OB-3011', kind: 'Property' });
  tk(9, 'Resolve Riley Park $50.00 wire-fee difference with QBO', 'CS-1009', 'Reconciliation Lead', '2026-10-15', { kind: 'Reconciliation' });
  tk(10, 'Add ownership evidence or override for Elliot Frost policy', 'CS-1014', 'Policy Coordinator', '2026-10-14', { kind: 'Policy' });

  // ---- Mock QBO (simulated, not a live integration) ----
  const q = (id, company, type, date, amt, memo, state, o = {}) => db.qbo.push({ id, company, type, date, amountCents: amt, memo, state, mappedCaseIds: [], matchedReceiptId: null, obId: null, adjId: null, differenceCents: 0, reason: '', owner: 'Reconciliation Lead', lastSync: '2026-10-13 06:00', voided: false, resolvedNote: '', ...o });
  q('QBO-INV-5001', 'MFC', 'Invoice', '2026-06-18', 1200000, 'Invoice Avery Stone', 'Matched', { mappedCaseIds: ['CS-1001'], obId: 'OB-3001' });
  q('QBO-INV-5002', 'MFC', 'Invoice', '2026-07-20', 1140000, 'Invoice Harbor Law (net of legal fee)', 'Matched', { mappedCaseIds: ['CS-1002'], obId: 'OB-3002' });
  q('QBO-CM-5002', 'MFC', 'Credit Memo', '2026-09-02', 60000, 'Credit memo: legal fee', 'Matched', { mappedCaseIds: ['CS-1002'], adjId: 'AJ-6001' });
  q('QBO-INV-5005', 'MFC', 'Invoice', '2026-05-10', 120000, 'Invoice Casey Hill', 'Matched', { mappedCaseIds: ['CS-1005'], obId: 'OB-3005' });
  q('QBO-DEP-7001', 'MFC', 'Deposit', '2026-07-23', 1200000, 'Deposit Avery Stone wire', 'Matched', { mappedCaseIds: ['CS-1001'], matchedReceiptId: 'RC-4001' });
  q('QBO-DEP-7002', 'MFC', 'Deposit', '2026-09-29', 600000, 'Deposit Harbor Law ACH', 'Matched', { mappedCaseIds: ['CS-1002'], matchedReceiptId: 'RC-4002' });
  q('QBO-DEP-7003', 'MFC', 'Deposit', '2026-10-09', 900000, 'Deposit Cole Family Trust check', 'Matched', { matchedReceiptId: 'RC-4003' });
  q('QBO-DEP-7004', 'MFC', 'Deposit', '2026-10-06', 495000, 'Deposit Riley Park wire (net of bank fee)', 'Difference', { mappedCaseIds: ['CS-1009'], matchedReceiptId: 'RC-4004', differenceCents: 5000, reason: 'Wire fee netted by bank (simulated); app shows gross amount' });
  q('QBO-DEP-7005', 'MFC', 'Deposit', '2026-08-19', 420000, 'Deposit Drew West check', 'Matched', { mappedCaseIds: ['CS-1011'], matchedReceiptId: 'RC-4005' });
  q('QBO-DEP-7007', 'MFC', 'Deposit', '2026-10-11', 150000, 'Deposit Mara Quill CAD wire', 'Matched', { matchedReceiptId: 'RC-4007' });
  q('QBO-PS-0101', 'PS', 'Deposit', '2026-10-02', 250000, 'Deposit Gale Ferris (PS)', 'Matched', { matchedReceiptId: 'RC-4006' });
  q('QBO-DEP-8841', 'MFC', 'Deposit', '2026-10-12', 540000, 'Deposit Harbor Law final remittance', 'Unmatched', { mappedCaseIds: ['CS-1002'], reason: 'No app receipt recorded yet' });
  db.importBatch.txns = [
    { id: 'QBO-DEP-9002', company: 'MFC', type: 'Deposit', date: '2026-10-12', amountCents: 300000, memo: 'Deposit Cole Trust (three possible cases)', state: 'Review', mappedCaseIds: ['CS-1006', 'CS-1007', 'CS-1008'], reason: 'Ambiguous case mapping: 3 candidate cases', voided: false },
    { id: 'QBO-DEP-9003', company: 'MFC', type: 'Deposit', date: '2026-10-11', amountCents: 60000, memo: 'Deposit Casey Hill check (voided in source)', state: 'Review', mappedCaseIds: ['CS-1005'], reason: 'Voided in source (simulated); confirm no app receipt depends on it', voided: true },
    { id: 'QBO-DEP-8841', company: 'MFC', type: 'Deposit', date: '2026-10-12', amountCents: 540000, memo: 'Deposit Harbor Law final remittance', state: 'Unmatched', mappedCaseIds: ['CS-1002'], reason: 'Replay of an existing record', voided: false },
    { id: 'QBO-DEP-7003', company: 'MFC', type: 'Deposit', date: '2026-10-09', amountCents: 900000, memo: 'Deposit Cole Family Trust check', state: 'Matched', mappedCaseIds: [], reason: 'Replay of an existing record', voided: false },
  ];

  // ---- Migration batch preview (fictional legacy tracker) ----
  const mg = [['LEG-0101', 'Avery Stone', 'OK'], ['LEG-0102', 'Jordan Reed', 'OK'], ['LEG-0103', 'Morgan Lake', 'OK'], ['LEG-0104', 'Taylor Brooks', 'OK'], ['LEG-0105', 'Casey Hill', 'Missing signed EA'], ['LEG-0106', 'Nia Cole', 'OK'], ['LEG-0107', 'Omar Pike', 'Couple: confirm shared fee'], ['LEG-0108', 'Lena Ward', 'OK'], ['LEG-0109', 'Sam Vale', 'Fee unknown'], ['LEG-0110', 'Drew West', 'OK'], ['LEG-0111', 'Quinn Moss', 'OK'], ['LEG-0112', 'Avery Stone', 'Duplicate patient (renewal?)']];
  db.migration.rows = mg.map(([id, name, issue]) => ({ legacyId: id, name, issue }));

  // ---- Seed audit trail ----
  const au = (caseId, entityType, entityId, action, detail, actor, at) => { db.seq.AU += 1; db.audit.unshift({ id: 'AU-' + db.seq.AU, at, actor, role: '', caseId, entityType, entityId, action, detail }); };
  au('CS-1001', 'agreement', 'AG-2001', 'Agreement verified', 'Engagement agreement verified; OB-3001 created for $12,000.00', 'Accounting Lead', '2026-06-18T11:00:00');
  au('CS-1001', 'receipt', 'RC-4001', 'Receipt verified', 'Wire $12,000.00 verified and allocated to OB-3001', 'Accounting Lead', '2026-07-23T10:00:00');
  au('CS-1001', 'case', 'CS-1001', 'Financial closure approved', 'Cash settled; reconciliation resolved', 'Dana Whitfield', '2026-08-20T09:00:00');
  au('CS-1002', 'agreement', 'AG-2002', 'Agreement verified', 'OB-3002 created: attorney owes MFC $12,000.00 before approved deductions', 'Accounting Lead', '2026-07-20T11:00:00');
  au('CS-1002', 'adjustment', 'AJ-6001', 'Deduction approved', 'Legal fee $600.00 approved by Dana Whitfield', 'Dana Whitfield', '2026-09-02T09:00:00');
  au('CS-1002', 'receipt', 'RC-4002', 'Receipt verified', 'Harbor Law remitted $6,000.00; allocated to OB-3002', 'Accounting Lead', '2026-09-29T10:00:00');
  au('CS-1003', 'policy', 'POL-7001', 'Ownership confirmed', 'Ownership evidence recorded; PS-to-MFC obligation OB-3003 created. No MFC cash recorded.', 'Policy Coordinator', '2026-10-05T14:00:00');
  au('CS-1004', 'deal', 'SS-8001', 'Closing verified', 'Closing statement verified; OB-3004 now collectible. Proceeds not yet received.', 'Property Coordinator', '2026-10-08T16:00:00');
  au('CS-1011', 'adjustment', 'AJ-6002', 'Write-off proposed', 'Write-off of $800.00 proposed; awaiting approval', 'Accounting Lead', '2026-10-09T09:00:00');
  au('CS-1009', 'receipt', 'RC-4004', 'Refund requested', 'Refund of $1,000.00 requested (simulated); awaiting approval', 'Reconciliation Lead', '2026-10-12T09:00:00');
  return db;
}
