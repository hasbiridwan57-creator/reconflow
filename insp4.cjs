// 0 could be correct (user has 0 sessions now since cleanup). Use CREATE to test:
// POST /api/sessions with external header → ownerKey should become user:cmws1bu1h...
const base = 'http://localhost:3458';
(async () => {
  const body = {companyName: 'PT Ext Header Probe', bankAccountName: 'BCA', periodLabel: 'November 2026', periodEndDate: '2026-11-30', endingBankBalance: 100, endingBookBalance: 100, bankTransactions: [{source: 'BANK', rowIndex: 0, date: '2026-11-03', reference: 'T1', description: 'x', direction: 'IN', amount: 100, runningBalance: 100, counterAccount: null}], bookTransactions: [{source: 'BOOK', rowIndex: 0, date: '2026-11-03', reference: 'T2', description: 'x', direction: 'IN', amount: 100, runningBalance: 100, counterAccount: null}]};
  const r = await fetch(base + '/api/sessions', {method: 'POST', headers: {'Content-Type': 'application/json', 'x-rf-auth-user-id': 'cmws1bu1h0000jz08igbdr932'}, body: JSON.stringify(body)});
  const j = await r.json();
  console.log('created with ext header:', j.data?.id);
})();
