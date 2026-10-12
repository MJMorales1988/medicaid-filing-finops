import { seed } from './seed.js';
import { derive, closureCheck } from './calc.js';
import * as A1 from './actions1.js';
import * as A2 from './actions2.js';
import { fmtUSD, toCents } from './util.js';

let db = seed();
const can = () => true;
const ctxFor = (actor, role) => ({ actor, role, can });
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL:', msg); } else console.log('ok  :', msg); };
const act = (fn, p, actor = 'Accounting Lead', role = 'Accounting') => { const { db: nd, res } = A1.runAct(db, fn, p, ctxFor(actor, role)); db = nd; return res; };

let d = derive(db);
console.log('KPIs', Object.fromEntries(Object.entries(d.k).filter(([k]) => !['buckets', 'byDebtor', 'recon', 'exceptionsCases'].includes(k)).map(([k, v]) => [k, typeof v === 'number' && k !== 'reconExceptions' ? fmtUSD(v) : v])));
const ob = (id) => d.ob[id];
ok(ob('OB-3001').outstanding === 0 && ob('OB-3001').status === 'Settled', 'A Avery settled');
ok(ob('OB-3002').adjusted === 1140000 && ob('OB-3002').outstanding === 540000 && ob('OB-3002').status === 'Overdue', 'B Jordan 11,400 adjusted, 5,400 overdue');
ok(d.cs['CS-1002'].client === 'Fulfilled' && d.cs['CS-1002'].mfcCash === 600000, 'B client fulfilled, MFC partial cash 6,000');
ok(ob('OB-3003').outstanding === 800000 && d.cs['CS-1003'].mfcCash === 0, 'C Morgan PS owes 8,000, MFC cash 0');
ok(ob('OB-3004').outstanding === 750000 && ob('OB-3004').status !== 'Awaiting trigger', 'D Taylor outstanding 7,500 collectible');
ok(ob('OB-3005').outstanding === 120000 && ob('OB-3005').status === 'Overdue', 'E Casey 1,200 unpaid (reported receipt not counted)');
ok(['OB-3006', 'OB-3007', 'OB-3008'].every((i) => ob(i).outstanding === 300000), 'F three obligations 3,000');
ok(ob('OB-3009').outstanding === 0 && d.rc['RC-4004'].available === 100000, 'G Riley settled, 1,000 unapplied');
ok(d.cs['CS-1010'].exception && d.cs['CS-1010'].agreed === null, 'H Sam Vale exception, Unknown fee');
ok(ob('OB-3010').outstanding === 80000, 'I Drew 800 outstanding pre-approval');
ok(ob('OB-3011').status === 'Awaiting trigger' && ob('OB-3011').daysPastDue === 0, 'J Quinn conditional, not overdue');
console.log('collectible', fmtUSD(d.k.collectible), 'conditional', fmtUSD(d.k.conditional), 'overdue', fmtUSD(d.k.overdue), 'unapplied', fmtUSD(d.k.unapplied), 'cashMonth', fmtUSD(d.k.cashMonth), 'groupExt', fmtUSD(d.k.groupExternal));
ok(d.k.conditional === 1000000, 'conditional total 10,000');
ok(d.k.cashMonth === 1400000, 'verified MFC cash this month 14,000 (CAD excluded)');

// over-allocation / entity / currency blocks
let r = act(A1.allocate, { receiptId: 'RC-4003', lines: [{ obId: 'OB-3006', amountCents: 400000 }] });
ok(!r.ok, 'block over-allocation vs outstanding: ' + r.error);
r = act(A1.allocate, { receiptId: 'RC-4006', lines: [{ obId: 'OB-3006', amountCents: 100000 }] });
ok(!r.ok && /entity/.test(r.error), 'block entity mismatch: ' + r.error);
r = act(A1.allocate, { receiptId: 'RC-4007', lines: [{ obId: 'OB-3006', amountCents: 100000 }] });
ok(!r.ok && /currency/.test(r.error), 'block currency mismatch: ' + r.error);
r = act(A1.allocate, { receiptId: 'RC-4008', lines: [{ obId: 'OB-3005', amountCents: 60000 }] });
ok(!r.ok, 'block unverified receipt: ' + r.error);
r = act(A1.allocate, { receiptId: 'RC-4003', lines: [{ obId: 'OB-3011', amountCents: 100000 }] });
ok(!r.ok && /trigger/.test(r.error), 'block allocation to awaiting-trigger obligation');

// Scenario F: 9,000 across three
r = act(A1.allocate, { receiptId: 'RC-4003', lines: [{ obId: 'OB-3006', amountCents: 300000 }, { obId: 'OB-3007', amountCents: 300000 }, { obId: 'OB-3008', amountCents: 300000 }] });
d = derive(db);
ok(r.ok && d.rc['RC-4003'].available === 0 && ['OB-3006', 'OB-3007', 'OB-3008'].every((i) => d.ob[i].outstanding === 0), 'F allocation across 3 cases fully applies 9,000');

// Walkthrough 1
const rr = act(A1.recordReceipt, { payerName: 'Harbor Law', payerType: 'Attorney', recipient: 'MFC', receivedDate: '2026-10-12', amountCents: 540000, method: 'Wire', reference: 'WIRE-HL-0219', caseId: 'CS-1002' });
ok(rr.ok, 'WT1 record 5,400 receipt');
d = derive(db); ok(d.ob['OB-3002'].outstanding === 540000, 'WT1 reported receipt does not reduce balance');
ok(!act(A1.recordReceipt, { payerName: 'Harbor Law', payerType: 'Attorney', recipient: 'MFC', receivedDate: '2026-10-12', amountCents: 540000, method: 'Wire', reference: 'WIRE-HL-0219' }).ok, 'WT1 duplicate blocked');
ok(act(A1.verifyReceipt, { id: rr.id, evidence: 'Bank advice WIRE-HL-0219', depositedDate: '2026-10-12' }).ok, 'WT1 verify');
d = derive(db); ok(d.k.reconExceptions >= 1 && d.k.recon.suggested.length === 1, 'WT1 suggested match appears: ' + d.k.recon.suggested.length);
ok(act(A1.allocate, { receiptId: rr.id, lines: [{ obId: 'OB-3002', amountCents: 540000 }] }).ok, 'WT1 allocate');
d = derive(db); ok(d.ob['OB-3002'].outstanding === 0 && d.cs['CS-1002'].fin === 'Paid – reconciliation open', 'WT1 balance zero, recon still open: ' + d.cs['CS-1002'].fin);
ok(!act(A1.proposeClosure, { caseId: 'CS-1002' }).ok, 'WT1 closure blocked until recon resolved');
ok(act(A2.matchQbo, { qboId: 'QBO-DEP-8841', receiptId: rr.id }).ok, 'WT1 match QBO');
d = derive(db); ok(d.cs['CS-1002'].fin === 'Settled', 'WT1 settled after reconciliation: ' + d.cs['CS-1002'].fin);
ok(act(A1.proposeClosure, { caseId: 'CS-1002' }, 'Accounting Lead').ok, 'WT1 propose closure');
const apId = db.approvals.find((a) => a.kind === 'Closure' && a.status === 'Pending').id;
ok(!act(A1.decideApproval, { id: apId, decision: 'Approve' }, 'Accounting Lead').ok, 'WT1 self-approval blocked');
ok(act(A1.decideApproval, { id: apId, decision: 'Approve' }, 'Dana Whitfield', 'CEO').ok, 'WT1 CEO approves closure');
d = derive(db); ok(d.cs['CS-1002'].fin === 'Financially closed', 'WT1 financially closed');
// reversal reopens
const rv = act(A1.reverseReceipt, { id: rr.id, reason: 'Demo: bounced wire' });
d = derive(db);
ok(rv.ok && d.ob['OB-3002'].outstanding === 540000 && !db.cases.find((c) => c.id === 'CS-1002').finClosed, 'reversal reopens balance and finances: ' + rv.msg);
ok(db.receipts.some((x) => x.kind === 'contra' && x.reversalOf === rr.id), 'reversal keeps linked contra history');

// Scenario I
const apw = db.approvals.find((a) => a.kind === 'Write-off').id;
ok(!act(A1.decideApproval, { id: apw, decision: 'Approve' }, 'Accounting Lead').ok, 'I proposer cannot approve own write-off');
const cashBefore = d.k.cashMonth;
ok(act(A1.decideApproval, { id: apw, decision: 'Approve' }, 'Dana Whitfield', 'CEO').ok, 'I CEO approves write-off');
d = derive(db);
ok(d.ob['OB-3010'].outstanding === 0 && d.ob['OB-3010'].status === 'Settled – adjusted' && d.k.cashMonth === cashBefore, 'I zero balance, adjusted closure label, no cash increase');

// Refund approval
const apr = db.approvals.find((a) => a.kind === 'Refund' && a.status === 'Pending').id;
ok(act(A1.decideApproval, { id: apr, decision: 'Approve' }, 'Dana Whitfield', 'CEO').ok && derive(db).rc['RC-4004'].available === 0, 'refund approval reduces unapplied (simulated)');

// Walkthrough 2
ok(!act(A2.setPolicyStage, { id: 'POL-7002', stage: 'ownership' }, 'Policy Coordinator', 'Policy Coordinator').ok, 'policy: stage change to ownership requires evidence path');
r = act(A2.confirmOwnership, { id: 'POL-7002', evidence: 'Recorded assignment CM-DEMO-0442' }, 'Policy Coordinator', 'Policy Coordinator');
d = derive(db);
const newOb = db.obligations.find((o) => o.compId === 'CP-2013-1');
ok(r.ok && newOb && d.ob[newOb.id].outstanding === 650000 && d.cs['CS-1013'].mfcCash === 0, 'WT2 ownership creates PS obligation 6,500, MFC cash 0');
ok(act(A2.confirmOwnership, { id: 'POL-7002', evidence: 'again' }, 'Policy Coordinator', 'Policy Coordinator').ok && db.obligations.filter((o) => o.compId === 'CP-2013-1').length === 1, 'WT2 obligation created once');
const ps = act(A1.recordReceipt, { payerName: 'Policy Solutions (PS)', payerType: 'Policy Solutions', recipient: 'MFC', receivedDate: '2026-10-13', amountCents: 650000, method: 'ACH', reference: 'ACH-PS-1013', caseId: 'CS-1013' });
act(A1.verifyReceipt, { id: ps.id, evidence: 'Bank advice PS-1013', depositedDate: '2026-10-13' });
const cm0 = derive(db).k;
ok(act(A1.allocate, { receiptId: ps.id, lines: [{ obId: newOb.id, amountCents: 650000 }] }).ok, 'WT2 allocate PS remittance');
d = derive(db);
ok(d.ob[newOb.id].outstanding === 0 && d.k.internalMonth >= 650000, 'WT2 remittance counts as MFC cash but flagged internal for group totals');

// Agreements: Sam Vale
const s1 = act(A2.verifyAgreement, { agId: 'AG-2010', reviewer: 'Accounting Lead' });
ok(!s1.ok, 'H verify blocked: ' + s1.error);
const ag = db.agreements.find((a) => a.id === 'AG-2010'); const v = ag.versions[0];
r = act(A2.saveAgreementDraft, { agId: 'AG-2010', caseId: 'CS-1010', type: 'engagement', signedDate: v.signedDate, parties: v.parties.concat(['Sam Vale (patient)']), grossFeeCents: 600000, legalFeeCents: 0, components: [{ ...v.components[0], amountCents: 600000 }], unknownReason: '' }, 'Intake Coordinator', 'Intake');
ok(r.ok, 'H fee entered ' + (r.error || ''));
act(A2.attachSignedEA, { agId: 'AG-2010' }, 'Intake Coordinator', 'Intake');
ok(!act(A2.verifyAgreement, { agId: 'AG-2010', reviewer: 'Intake Coordinator' }).ok, 'H reviewer must differ from drafter');
r = act(A2.verifyAgreement, { agId: 'AG-2010', reviewer: 'Accounting Lead' });
ok(r.ok && r.made.length === 1, 'H verify creates one obligation');
ok(!act(A2.verifyAgreement, { agId: 'AG-2010', reviewer: 'Accounting Lead' }).ok && db.obligations.filter((o) => o.compId === 'CP-2010-1').length === 1, 'verification creates obligations once');
// Amendment
r = act(A2.submitAmendment, { agId: 'AG-2014', reason: 'Fee reduced after review', changes: [{ compId: 'CP-2014-1', amountCents: 300000 }] }, 'Intake Coordinator', 'Intake');
ok(r.ok, 'amendment submitted');
ok(!act(A2.reviewAmendment, { agId: 'AG-2014', decision: 'Approve' }, 'Intake Coordinator', 'Intake').ok, 'amendment self-review blocked');
r = act(A2.reviewAmendment, { agId: 'AG-2014', decision: 'Approve' }, 'Accounting Lead');
d = derive(db);
ok(r.ok && d.ob['OB-3012'].adjusted === 300000 && db.agreements.find((a) => a.id === 'AG-2014').versions.length === 2, 'amendment posts reviewed credit delta; history preserved: ' + (r.error || ''));

// Deal closing
ok(!act(A2.verifyClosing, { id: 'SS-8002', closingDate: '2026-10-12' }, 'Property Coordinator', 'Property Coordinator').ok, 'deal closing blocked without evidence');
act(A2.verifyDealEvidence, { id: 'SS-8002', key: 'titleInvoice' }, 'Property Coordinator', 'Property Coordinator');
act(A2.verifyDealEvidence, { id: 'SS-8002', key: 'closingStatement' }, 'Property Coordinator', 'Property Coordinator');
r = act(A2.verifyClosing, { id: 'SS-8002', closingDate: '2026-10-12', titleCompany: 'Cedar Title (fictional escrow)', proceedsRecipient: 'Pending' }, 'Property Coordinator', 'Property Coordinator');
d = derive(db);
ok(r.ok && d.ob['OB-3011'].status !== 'Awaiting trigger' && d.ob['OB-3011'].outstanding === 1000000 && d.cs['CS-1012'].mfcCash === 0, 'J closing activates due; no cash yet');

// Recon import
r = act(A2.importQBO, {}); ok(r.ok && /2 new/.test(r.msg), 'import run 1: ' + r.msg);
const k1 = JSON.stringify(Object.values(derive(db).ob).map((x) => x.outstanding));
r = act(A2.importQBO, {}); ok(r.ok && /replay/.test(r.msg) && k1 === JSON.stringify(Object.values(derive(db).ob).map((x) => x.outstanding)), 'import replay changes nothing: ' + r.msg);
// Riley difference resolve then closure ready
ok(!act(A1.proposeClosure, { caseId: 'CS-1009' }).ok, 'Riley closure blocked by QBO difference');
ok(act(A2.resolveItem, { qboId: 'QBO-DEP-7004', resolution: 'accept', note: 'Bank wire fee accepted' }).ok, 'resolve difference');
ok(closureCheck(db, 'CS-1009').ok, 'Riley closure ready after resolution');
// permissions
const denied = A1.runAct(db, A1.allocate, { receiptId: 'x', lines: [] }, { actor: 'Intake Coordinator', role: 'Intake', can: (k) => db.perms.Intake[k] });
ok(!denied.res.ok && /not permitted/.test(denied.res.error), 'role permission enforced');
console.log(fails ? `\n${fails} FAILURES` : '\nALL LOGIC CHECKS PASSED');
process.exit(fails ? 1 : 0);
