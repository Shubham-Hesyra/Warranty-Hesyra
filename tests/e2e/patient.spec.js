// End-to-end patient journeys against the real backend logic (GAS emulator).
const { test, expect } = require('@playwright/test');
const { RECENT, plusYears } = require('../support/fixtures');

const LOCATION = { ip: '203.0.113.50', city: 'Nagpur', region: 'Maharashtra', country_name: 'India' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

test.beforeEach(async ({ page, request }) => {
  await request.get('/__test/reset');
  await page.route('https://ipapi.co/**', (r) => r.fulfill({ json: LOCATION }));
  await page.route('https://ipwho.is/**', (r) => r.fulfill({ json: { success: false } }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  page.on('pageerror', (err) => { throw err; });
});

async function row(request, id) {
  return (await (await request.get(`/__test/row?id=${id}`)).json()).row;
}
async function apiLog(request) {
  return (await (await request.get('/__test/log')).json()).requests;
}
async function typeId(page, id, selector = '#crown-id-input') {
  await page.locator(selector).fill('');
  await page.locator(selector).pressSequentially(id, { delay: 15 });
}
async function registerAs(page, { name = 'Meera Joshi', phone = '98220 11111', email = '' } = {}) {
  await page.fill('#input-name', name);
  await page.fill('#input-phone', phone);
  if (email) await page.fill('#input-email', email);
  await page.click('#submit-btn');
}

// --------------------------------------------------------------- landing
test('landing shows the registration portal, never a sample card', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#portal-heading')).toHaveText('Register Your Crown');
  await expect(page.locator('#card-view-section')).toBeHidden();
  await expect(page.locator('#step2-section')).toBeHidden();
});

test('?view=card cannot open a card without signing in', async ({ page }) => {
  await page.goto('/?view=card');
  await expect(page.locator('#card-view-section')).toBeHidden();
  await expect(page.locator('#form-view-section')).toBeVisible();
});

test('nothing is written to localStorage', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

// --------------------------------------------------------------- crown ID entry
test('typing an ID formats it and reveals real case details', async ({ page }) => {
  await page.goto('/');
  await typeId(page, 'zir4510');
  await expect(page.locator('#crown-id-input')).toHaveValue('ZIR-4510');
  await expect(page.locator('#id-hint')).toHaveText('Crown verified in laboratory registry.');
  await expect(page.locator('#form-match-title')).toHaveText('Zirconia Crown · Multi-Layer 3D Pro');
  await expect(page.locator('#form-match-clinic')).toHaveText('Smile Studio Dental Care, Nagpur · Dr Aarav Deshmukh');
  await expect(page.locator('#form-match-fitted')).toHaveText(`Dispatched ${longDate(RECENT)} · Teeth 16, 17`);
  await expect(page.locator('#step2-section')).toBeVisible();
  await expect(page.locator('#input-name')).toBeFocused();
});

test('pasting the full QR link into the ID box still works', async ({ page }) => {
  await page.goto('/');
  await page.locator('#crown-id-input').fill('https://warranty.hesyralabs.com/?id=EMX-1001');
  await expect(page.locator('#crown-id-input')).toHaveValue('EMX-1001');
  await expect(page.locator('#step2-section')).toBeVisible();
});

test('QR deep link pre-fills the ID and opens step 2', async ({ page }) => {
  await page.goto('/?id=emx-1001');
  await expect(page.locator('#crown-id-input')).toHaveValue('EMX-1001');
  await expect(page.locator('#form-match-title')).toHaveText('E.max Crown · Lithium Disilicate');
  await expect(page.locator('#step2-section')).toBeVisible();
});

test('unknown ID shows a clear not-found message and no form', async ({ page }) => {
  await page.goto('/');
  await typeId(page, 'ZIR-9999');
  await expect(page.locator('#id-hint')).toContainText('couldn\'t find crown ZIR-9999');
  await expect(page.locator('#step2-section')).toBeHidden();
  await expect(page.locator('#lookup-retry-btn')).toBeHidden();
});

test('malformed ID explains the expected format', async ({ page }) => {
  await page.goto('/');
  await typeId(page, '1234567');
  await expect(page.locator('#id-hint')).toContainText('three letters, then four numbers');
});

test('a crown still in production cannot be registered', async ({ page }) => {
  await page.goto('/');
  await typeId(page, 'CER-1001');
  await expect(page.locator('#id-hint')).toContainText('hasn\'t been released by the laboratory yet');
  await expect(page.locator('#step2-section')).toBeHidden();
});

test('clearing the ID hides the patient form again', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await page.locator('#crown-id-input').press('End');
  await page.locator('#crown-id-input').press('Backspace');
  await expect(page.locator('#step2-section')).toBeHidden();
  await expect(page.locator('#crown-id-input')).toHaveValue('ZIR-451');
});

// --------------------------------------------------------------- registration
test('happy path: register and see the correct warranty card', async ({ page, request }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page, { name: 'Meera  Joshi', phone: '+91 98220 11111', email: 'meera@example.com' });

  await expect(page.locator('#card-view-section')).toBeVisible();
  await expect(page.locator('#card-patient')).toHaveText('MEERA JOSHI');
  await expect(page.locator('#card-product')).toHaveText('Zirconia Crown');
  await expect(page.locator('#card-meta')).toHaveText(`Teeth 16, 17 · Shade A2 · ${RECENT.slice(0, 4)}`);
  const stamp = RECENT.slice(2, 4) + RECENT.slice(5, 7);
  await expect(page.locator('#card-warranty-id')).toHaveText(`HLW ZIR 4510 ${stamp}`);
  const exp = plusYears(RECENT, 5);
  await expect(page.locator('#card-valid-thru')).toHaveText(`${exp.slice(5, 7)} / ${exp.slice(2, 4)}`);
  await expect(page.locator('#status-label')).toHaveText('Warranty active');
  await expect(page.locator('#dash-until-date')).toHaveText(`Until ${longDate(exp)}`);
  await expect(page.locator('#dash-clinic')).toHaveText('Smile Studio Dental Care, Nagpur');

  const r = await row(request, 'ZIR-4510');
  expect(r[14]).toBe('MEERA JOSHI');
  expect(r[15]).toBe('919822011111');
  expect(r[16]).toBe('meera@example.com');
  expect(r.slice(18, 22)).toEqual(['Nagpur', 'Maharashtra', 'India', '203.0.113.50']);
  expect(r[22]).toMatch(/^AGREED - v1\.0/);
});

test('registration sends personal data in a POST body, never in the URL', async ({ page, request }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  const log = await apiLog(request);
  const reg = log.find((l) => l.body.includes('"register"'));
  expect(reg.method).toBe('POST');
  expect(reg.contentType).toContain('text/plain');
  for (const l of log) expect(JSON.stringify(l.params)).not.toMatch(/9822011111|MEERA|Meera/);
});

test('validation: name, phone and email errors block submission', async ({ page, request }) => {
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await page.fill('#input-phone', '12345');
  await page.fill('#input-email', 'not-an-email');
  await page.click('#submit-btn');
  await expect(page.locator('#name-err')).toBeVisible();
  await expect(page.locator('#phone-err')).toBeVisible();
  await expect(page.locator('#email-err')).toBeVisible();
  await expect(page.locator('#input-name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#input-name')).toBeFocused();
  expect((await apiLog(request)).some((l) => l.body.includes('register'))).toBe(false);

  await page.fill('#input-name', 'Meera Joshi');
  await expect(page.locator('#name-err')).toBeHidden();
  await page.fill('#input-phone', '9822011111');
  await page.fill('#input-email', '');
  await page.click('#submit-btn');
  await expect(page.locator('#card-view-section')).toBeVisible();
});

test('phone helper counts digits as the patient types', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await page.locator('#input-phone').pressSequentially('98220');
  await expect(page.locator('#phone-helper-text')).toHaveText('Enter your 10-digit mobile number (5/10 digits).');
  await page.locator('#input-phone').pressSequentially('11111');
  await expect(page.locator('#phone-helper-text')).toContainText('ready for secure check-in');
});

test('double-clicking Activate registers only once', async ({ page, request }) => {
  await page.goto('/?id=ZIR-4510');
  await page.fill('#input-name', 'Meera Joshi');
  await page.fill('#input-phone', '9822011111');
  await page.locator('#submit-btn').dblclick();
  await expect(page.locator('#card-view-section')).toBeVisible();
  const regs = (await apiLog(request)).filter((l) => l.body.includes('"register"'));
  expect(regs).toHaveLength(1);
});

test('location service down: registration still succeeds with Unknown location', async ({ page, request }) => {
  await page.unroute('https://ipapi.co/**');
  await page.route('https://ipapi.co/**', (r) => r.abort());
  await page.route('https://ipwho.is/**', (r) => r.abort());
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  expect((await row(request, 'ZIR-4510')).slice(18, 22)).toEqual(['Unknown', 'Unknown', 'Unknown', 'Unknown']);
});

test('registry unreachable during registration: clear error, no fake card', async ({ page, request }) => {
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await page.route('**/exec', (r) => r.abort('internetdisconnected'));
  await registerAs(page);
  await expect(page.locator('#register-error-box')).toContainText('couldn’t reach the warranty registry');
  await expect(page.locator('#card-view-section')).toBeHidden();
  await expect(page.locator('#submit-btn')).toBeEnabled();
  expect((await row(request, 'ZIR-4510'))[15]).toBe('');

  await page.unroute('**/exec');
  await page.click('#submit-btn');
  await expect(page.locator('#card-view-section')).toBeVisible();
});

test('registry returns garbage HTML (e.g. Google login page): treated as an outage', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await page.route('**/exec', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in</html>' }));
  await registerAs(page);
  await expect(page.locator('#register-error-box')).toBeVisible();
  await expect(page.locator('#card-view-section')).toBeHidden();
});

test('lookup outage shows Try again, which recovers', async ({ page }) => {
  await page.route('**/exec**', (r) => r.abort('internetdisconnected'));
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#id-hint')).toContainText('couldn’t reach the warranty registry');
  await expect(page.locator('#lookup-retry-btn')).toBeVisible();
  await page.unroute('**/exec**');
  await page.click('#lookup-retry-btn');
  await expect(page.locator('#step2-section')).toBeVisible();
});

test('slow registry: request times out with a friendly message', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await page.route('**/exec', async () => { /* never answer */ });
  await registerAs(page);
  await expect(page.locator('#register-error-box')).toContainText('taking too long', { timeout: 10000 });
});

test('formula text in the name is stored literally in the sheet', async ({ page, request }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page, { name: '=HYPERLINK("http://evil.example","x")' });
  await expect(page.locator('#card-view-section')).toBeVisible();
  const r = await row(request, 'ZIR-4510');
  expect(r).not.toContain('#FORMULA_EXECUTED');
  expect(r[14]).toBe('=HYPERLINK("HTTP://EVIL.EXAMPLE","X")');
});

test('HTML in the name is shown as text, not executed', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page, { name: '<img src=x onerror=alert(1)>' });
  await expect(page.locator('#card-patient')).toHaveText('<IMG SRC=X ONERROR=ALERT(1)>');
  expect(await page.locator('#card-patient img').count()).toBe(0);
});

test('missing ops data shows dashes, never invented details', async ({ page }) => {
  await page.goto('/?id=ZIR-2002');
  await expect(page.locator('#form-match-title')).toHaveText('Dental crown');
  await expect(page.locator('#form-match-clinic')).toBeHidden();
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  await expect(page.locator('#back-dentist')).toHaveText('—');
  await expect(page.locator('#dash-clinic')).toHaveText('—');
  await expect(page.locator('#back-shade')).toHaveText('—');
  await expect(page.locator('body')).not.toContainText('Aarav');
});

// --------------------------------------------------------------- already registered / check-in
test('a registered ID switches to Check-In with a masked phone hint', async ({ page, request }) => {
  await page.goto('/');
  await typeId(page, 'CER-8942');
  await expect(page.locator('#portal-heading')).toHaveText('Patient Check-In');
  await expect(page.locator('#login-masked-hint')).toHaveText('Registered ending in 2345');
  await expect(page.locator('#login-crown-id-input')).toHaveValue('CER-8942');
  await expect(page.locator('#login-phone-input')).toBeFocused();
  const lookup = (await apiLog(request)).find((l) => l.params.action === 'lookup');
  expect(lookup).toBeTruthy();
});

test('lookup response for a registered crown contains no patient data', async ({ page }) => {
  const bodies = [];
  page.on('response', async (res) => { if (res.url().includes('/exec')) bodies.push(await res.text()); });
  await page.goto('/?id=CER-8942');
  await expect(page.locator('#login-masked-hint')).toBeVisible();
  const all = bodies.join('\n');
  for (const s of ['JANE', '9822012345', 'jane@example.com', '203.0.113.19', 'Mumbai']) expect(all).not.toContain(s);
});

test('check-in with the right phone (any format) opens the card', async ({ page }) => {
  await page.goto('/?id=CER-8942');
  await page.fill('#login-phone-input', '+91-98220 12345');
  await page.press('#login-phone-input', 'Enter');
  await expect(page.locator('#card-view-section')).toBeVisible();
  await expect(page.locator('#card-patient')).toHaveText('JANE DOE');
  await expect(page.locator('#card-product')).toHaveText('Ceramic Crown');
});

test('check-in with a wrong phone is refused, then locked after 5 tries', async ({ page }) => {
  await page.goto('/?id=CER-8942');
  await expect(page.locator('#login-masked-hint')).toBeVisible();
  for (let i = 1; i <= 4; i++) {
    await page.fill('#login-phone-input', '9000000000');
    await page.click('#login-submit-btn');
    await expect(page.locator('#login-error-text')).toContainText('doesn\'t match our records');
    await expect(page.locator('#login-submit-btn')).toBeEnabled();
  }
  await expect(page.locator('#login-error-text')).toContainText('1 attempt left');
  await page.click('#login-submit-btn');
  await expect(page.locator('#login-error-text')).toContainText('paused for 15 minutes');
  await page.fill('#login-phone-input', '9822012345');
  await page.click('#login-submit-btn');
  await expect(page.locator('#login-error-text')).toContainText('paused for 15 minutes');
  await expect(page.locator('#card-view-section')).toBeHidden();
});

test('check-in validation: missing ID and short phone', async ({ page }) => {
  await page.goto('/');
  await page.click('#tab-login-btn');
  await page.fill('#login-phone-input', '123');
  await page.click('#login-submit-btn');
  await expect(page.locator('#login-id-err')).toBeVisible();
  await expect(page.locator('#login-phone-err')).toBeVisible();
});

test('check-in on an unregistered crown moves the patient to registration', async ({ page }) => {
  await page.goto('/');
  await page.click('#tab-login-btn');
  await page.locator('#login-crown-id-input').pressSequentially('ZIR-4510');
  // the live lookup already routes an unregistered crown to the register tab
  await expect(page.locator('#portal-heading')).toHaveText('Register Your Crown');
  await expect(page.locator('#step2-section')).toBeVisible();
});

test('re-registering with the same phone just signs the patient in', async ({ page, browser }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page, { phone: '9822011111' });
  await expect(page.locator('#card-view-section')).toBeVisible();

  // Second device that still had the form open from before.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.route('https://ipapi.co/**', (r) => r.fulfill({ json: LOCATION }));
  await p2.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await p2.goto('/');
  await p2.route('**/exec**', async (r) => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('action') === 'lookup') {
      return r.fulfill({ json: { success: true, isRegistered: false, crown: { crownId: 'ZIR-4510', product: 'Zirconia Crown', dispatchDate: RECENT } } });
    }
    return r.continue();
  });
  await typeId(p2, 'ZIR-4510');
  await expect(p2.locator('#step2-section')).toBeVisible();
  await registerAs(p2, { name: 'Meera Joshi', phone: '98220 11111' });
  await expect(p2.locator('#card-view-section')).toBeVisible();
  await expect(p2.locator('#card-patient')).toHaveText('MEERA JOSHI');
  await ctx.close();
});

test('someone else trying to register a taken crown is sent to check-in', async ({ page, request }) => {
  await page.goto('/');
  await page.route('**/exec**', async (r) => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('action') === 'lookup') {
      return r.fulfill({ json: { success: true, isRegistered: false, crown: { crownId: 'CER-8942', product: 'Ceramic Crown', dispatchDate: RECENT } } });
    }
    return r.continue();
  });
  await typeId(page, 'CER-8942');
  await registerAs(page, { name: 'Intruder', phone: '9111111111' });
  await expect(page.locator('#portal-heading')).toHaveText('Patient Check-In');
  await expect(page.locator('#login-error-text')).toContainText('already registered to a phone ending in 2345');
  await expect(page.locator('#card-view-section')).toBeHidden();
  expect((await row(request, 'CER-8942'))[14]).toBe('JANE DOE');
});

// --------------------------------------------------------------- card view
test('expired warranty is labelled as expired', async ({ page }) => {
  await page.goto('/?id=ZIR-0001');
  await page.fill('#login-phone-input', '9000000001');
  await page.click('#login-submit-btn');
  await expect(page.locator('#status-label')).toHaveText('Warranty expired');
  await expect(page.locator('#status-tag')).toHaveText('Ended 10 Jan 2023');
  await expect(page.locator('#card-valid-thru')).toHaveText('01 / 23');
});

test('card flips by tap and by keyboard', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  await page.click('#stage');
  await expect(page.locator('#flipper')).toHaveAttribute('style', /rotateY\(180deg\)/);
  await expect(page.locator('#flip-hint')).toHaveText('TAP TO SEE FRONT');
  await page.locator('#stage').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#flipper')).toHaveAttribute('style', /rotateY\(0deg\)/);
  await expect(page.locator('#back-case')).toHaveText('JOB-1042');
});

test('Download card as PDF opens the print dialog with a named file', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  await page.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.title); });
  await page.click('#download-pdf-btn');
  const titles = await page.evaluate(() => window.__printed);
  expect(titles[0]).toMatch(/^Hesyra-Warranty-HLW-ZIR-4510-\d{4}$/);
});

test('print stylesheet renders both faces at ID-card size', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#download-pdf-btn')).toBeHidden();
  const faces = await page.locator('[data-face]').evaluateAll((els) => els.map((e) => getComputedStyle(e).position));
  expect(faces).toEqual(['relative', 'relative']);
});

test('reloading keeps the card open; sign out clears it', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  await page.reload();
  await expect(page.locator('#card-view-section')).toBeVisible();
  await expect(page.locator('#card-patient')).toHaveText('MEERA JOSHI');
  const stored = await page.evaluate(() => JSON.stringify(sessionStorage));
  expect(stored).not.toContain('9822011111');

  await page.click('#sign-out-btn');
  await expect(page.locator('#form-view-section')).toBeVisible();
  await expect(page.locator('#crown-id-input')).toHaveValue('');
  expect(page.url()).not.toContain('id=');
  await page.reload();
  await expect(page.locator('#card-view-section')).toBeHidden();
});

test('a QR link for a different crown does not reuse the open session', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  await page.goto('/?id=EMX-1001');
  await expect(page.locator('#form-view-section')).toBeVisible();
  await expect(page.locator('#form-match-title')).toHaveText('E.max Crown · Lithium Disilicate');
});

// --------------------------------------------------------------- legal modal
test('terms and privacy modal opens, switches tabs and closes with Escape', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await page.click('#view-privacy-link');
  await expect(page.locator('#terms-modal')).toBeVisible();
  await expect(page.locator('#modal-content-privacy')).toBeVisible();
  await expect(page.locator('#modal-content-privacy')).toContainText('third-party IP lookup');
  await page.click('#modal-tab-terms');
  await expect(page.locator('#modal-content-terms')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#terms-modal')).toBeHidden();
  await expect(page.locator('#view-privacy-link')).toBeFocused();
  expect(page.url()).not.toContain('#');
});

test('info button on the card opens the warranty terms without flipping', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  await registerAs(page);
  await page.click('#open-terms');
  await expect(page.locator('#modal-content-terms')).toBeVisible();
  await page.click('#close-terms');
  await expect(page.locator('#terms-modal')).toBeHidden();
  await expect(page.locator('#flipper')).toHaveAttribute('style', /rotateY\(0deg\)/);
});

// --------------------------------------------------------------- layout
test('no horizontal scrolling on the portal or the card', async ({ page }) => {
  await page.goto('/?id=ZIR-4510');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await registerAs(page, { name: 'Venkata Subramaniam Ramakrishnan Iyer Krishnamurthy' });
  await expect(page.locator('#card-view-section')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  const fits = await page.locator('#card-patient').evaluate((e) => e.getBoundingClientRect().right <= document.getElementById('card').getBoundingClientRect().right);
  expect(fits).toBe(true);
});

test('page loads with no console errors and no CSP violations', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?id=ZIR-4510');
  await expect(page.locator('#step2-section')).toBeVisible();
  await registerAs(page);
  await expect(page.locator('#card-view-section')).toBeVisible();
  expect(errors).toEqual([]);
});
