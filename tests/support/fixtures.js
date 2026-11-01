// Registry rows used by backend and end-to-end tests. Dates are relative to
// today so the "active" cases never age into "expired".
function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
function plusYears(iso, y) {
  return String(+iso.slice(0, 4) + y) + iso.slice(4);
}

const RECENT = isoDaysAgo(60);
const RECENT2 = isoDaysAgo(20);

const blankPatient = ['', '', '', '', '', '', '', '', '', ''];

function fixtureRows() {
  return [
    ['ZIR-4510', 'Dispatched', RECENT, 7, plusYears(RECENT, 7), '', 'Zirconia Crown', 'Multi-Layer 3D Pro', '16, 17', 'A2', 'Smile Studio Dental Care, Nagpur', 'Dr Aarav Deshmukh', 'JOB-1042', 'Passed QA', ...blankPatient],
    ['EMX-1001', 'Delivered', RECENT2, 5, plusYears(RECENT2, 5), RECENT2, 'E.max Crown', 'Lithium Disilicate', '11', 'BL2', 'Prime Aesthetics, Delhi', 'Dr Arthur Miller', 'JOB-1102', '', ...blankPatient],
    ['CER-8942', 'Delivered', RECENT, 5, plusYears(RECENT, 5), RECENT, 'Ceramic Crown', 'Ceramic-Hybrid Prime', '36', 'B1', 'Apex Dental Care, Mumbai', 'Dr Sarah Jenkins', 'JOB-1088', '',
      'JANE DOE', "'9822012345", 'jane@example.com', '2026-01-02 10:00:00', 'Mumbai', 'Maharashtra', 'India', '203.0.113.19', 'AGREED - v1.0 [T&C + Privacy Policy]', '2026-01-02 10:00:00'],
    ['CER-1001', 'In Production', '', 5, '', '', 'Ceramic Crown', '', '14', 'A1', 'Summit Dental Group', 'Dr Lisa Ray', 'JOB-1090', '', ...blankPatient],
    ['ZIR-0001', 'Delivered', '2018-01-10', 7, '2025-01-10', '2018-01-12', 'Zirconia Crown', '', '26', 'A3', 'Old Town Dental', 'Dr Rao', 'JOB-0001', '',
      'RAVI KUMAR', "'9000000001", '', '2018-01-15 09:00:00', 'Pune', 'Maharashtra', 'India', '198.51.100.7', 'AGREED - v1.0 [T&C + Privacy Policy]', '2018-01-15 09:00:00'],
    ['ZIR-2002', 'Dispatched', RECENT, '', '', '', '', '', '', '', '', '', '', '', ...blankPatient]
  ];
}

module.exports = { fixtureRows, RECENT, RECENT2, plusYears, isoDaysAgo };
