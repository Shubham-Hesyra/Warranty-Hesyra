/**
 * Hesyra Labs — Digital Crown Warranty portal (v2.0.0)
 *
 * Talks to the Apps Script backend in google_sheets_setup.gs. There is no
 * offline/local fallback: a registration is only confirmed once the registry
 * has stored it.
 */
(function () {
  'use strict';

  const CFG = window.HESYRA_CONFIG || {};
  const API_URL = CFG.apiUrl || '';
  const TIMEOUT_MS = CFG.requestTimeoutMs || 20000;
  const SESSION_KEY = 'hesyra_warranty_session_v2';
  const SESSION_TTL_MS = (CFG.sessionMinutes || 30) * 60 * 1000;
  const CONSENT_VERSION = 'v1.0';
  const ID_RE = /^[A-Z]{3}-\d{4}$/;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MSG = {
    NETWORK: 'We couldn’t reach the warranty registry. Check your internet connection and try again.',
    TIMEOUT: 'The warranty registry is taking too long to respond. Please try again.',
    CONFIG: 'The warranty service is not configured. Please contact Hesyra Labs.',
    GENERIC: 'Something went wrong. Please try again.'
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    page: $('page'),
    cardView: $('card-view-section'),
    formView: $('form-view-section'),
    stage: $('stage'),
    card: $('card'),
    flipper: $('flipper'),
    flipHint: $('flip-hint'),
    cardProduct: $('card-product'),
    cardMeta: $('card-meta'),
    cardPatient: $('card-patient'),
    cardWarrantyId: $('card-warranty-id'),
    cardValidThru: $('card-valid-thru'),
    backTooth: $('back-tooth'),
    backShade: $('back-shade'),
    backCase: $('back-case'),
    backDentist: $('back-dentist'),
    backIssued: $('back-issued'),
    statusDot: $('status-dot'),
    statusLabel: $('status-label'),
    statusTag: $('status-tag'),
    progressBar: $('progress-bar'),
    dashRestoration: $('dash-restoration'),
    dashClinic: $('dash-clinic'),
    dashWarrantyId: $('dash-warranty-id'),
    dashIssued: $('dash-issued-date'),
    dashUntil: $('dash-until-date'),
    downloadPdf: $('download-pdf-btn'),
    signOut: $('sign-out-btn'),
    tabRegister: $('tab-register-btn'),
    tabLogin: $('tab-login-btn'),
    panelRegister: $('panel-register'),
    panelLogin: $('panel-login'),
    heading: $('portal-heading'),
    subhead: $('portal-subhead'),
    registerForm: $('warranty-form'),
    crownId: $('crown-id-input'),
    crownValidIcon: $('crown-valid-icon'),
    idHint: $('id-hint'),
    retry: $('lookup-retry-btn'),
    matchBox: $('match-box'),
    matchTitle: $('form-match-title'),
    matchClinic: $('form-match-clinic'),
    matchFitted: $('form-match-fitted'),
    step1Num: $('step1-num'),
    step1Check: $('step1-check'),
    stepConnector: $('step-connector'),
    step2Indicator: $('step2-indicator'),
    step2Section: $('step2-section'),
    name: $('input-name'),
    phone: $('input-phone'),
    email: $('input-email'),
    phoneHelper: $('phone-smart-helper'),
    phoneAuthTag: $('phone-auth-tag'),
    phoneHelperText: $('phone-helper-text'),
    nameErr: $('name-err'),
    phoneErr: $('phone-err'),
    emailErr: $('email-err'),
    registerError: $('register-error-box'),
    submit: $('submit-btn'),
    submitSpinner: $('submit-spinner'),
    submitText: $('submit-text'),
    locationHint: $('location-hint'),
    loginForm: $('login-form'),
    loginId: $('login-crown-id-input'),
    loginPhone: $('login-phone-input'),
    loginMasked: $('login-masked-hint'),
    loginError: $('login-error-box'),
    loginErrorText: $('login-error-text'),
    loginIdErr: $('login-id-err'),
    loginPhoneErr: $('login-phone-err'),
    loginSubmit: $('login-submit-btn'),
    loginSpinner: $('login-spinner'),
    loginBtnText: $('login-btn-text'),
    switchToRegister: $('switch-to-register-link'),
    termsModal: $('terms-modal'),
    openTerms: $('open-terms'),
    closeTerms: $('close-terms'),
    viewTerms: $('view-terms-link'),
    viewPrivacy: $('view-privacy-link'),
    modalTabTerms: $('modal-tab-terms'),
    modalTabPrivacy: $('modal-tab-privacy'),
    modalTerms: $('modal-content-terms'),
    modalPrivacy: $('modal-content-privacy')
  };

  const state = {
    currentCrown: null,
    lookupSeq: 0,
    lookupTimer: null,
    lastLookupId: '',
    registering: false,
    loggingIn: false,
    locationPromise: null,
    flipped: false,
    lastFocus: null
  };

  const show = (node) => node && node.classList.remove('hidden');
  const hide = (node) => node && node.classList.add('hidden');

  // ==========================================================================
  // Formatting helpers
  // ==========================================================================
  function digits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function formatCrownId(raw) {
    let v = String(raw || '');
    const fromUrl = v.match(/[?&]id=([^&#\s]+)/i);
    if (fromUrl) v = decodeURIComponent(fromUrl[1]);
    v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 7);
    return v.slice(0, 8);
  }

  function parseIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function fmtLong(iso) {
    const p = parseIso(iso);
    return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : '';
  }

  function fmtShort(iso) {
    const p = parseIso(iso);
    return p ? `${String(p.d).padStart(2, '0')} ${MONTHS[p.m - 1]} ${String(p.y).slice(-2)}` : '';
  }

  function fmtValidThru(iso) {
    const p = parseIso(iso);
    return p ? `${String(p.m).padStart(2, '0')} / ${String(p.y).slice(-2)}` : '—';
  }

  function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isoToUtc(iso) {
    const p = parseIso(iso);
    return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN;
  }

  // ==========================================================================
  // API client
  // ==========================================================================
  function inferCode(res) {
    if (res.code) return res.code;
    if (res.alreadyRegistered) return 'ALREADY_REGISTERED';
    if (res.needsRegistration) return 'NOT_REGISTERED';
    if (res.verified === false) return 'WRONG_PHONE';
    return res.success ? '' : 'ERROR';
  }

  async function callApi(method, params) {
    if (!API_URL) return { success: false, code: 'CONFIG', error: MSG.CONFIG };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let res;
      if (method === 'GET') {
        const sep = API_URL.includes('?') ? '&' : '?';
        res = await fetch(API_URL + sep + new URLSearchParams(params).toString(), {
          signal: controller.signal, cache: 'no-store', credentials: 'omit'
        });
      } else {
        // text/plain keeps this a "simple" request: no CORS preflight, which Apps Script can't answer.
        res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(params),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'follow'
        });
      }
      if (!res.ok) return { success: false, code: 'NETWORK', error: MSG.NETWORK };
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        return { success: false, code: 'NETWORK', error: MSG.NETWORK };
      }
      if (!json || typeof json !== 'object') return { success: false, code: 'NETWORK', error: MSG.NETWORK };
      json.code = inferCode(json);
      if (!json.success && !json.error) json.error = MSG.GENERIC;
      return json;
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      return { success: false, code: timedOut ? 'TIMEOUT' : 'NETWORK', error: timedOut ? MSG.TIMEOUT : MSG.NETWORK };
    } finally {
      clearTimeout(timer);
    }
  }

  const api = {
    lookup: (id) => callApi('GET', { action: 'lookup', id }),
    register: (payload) => callApi('POST', Object.assign({ action: 'register' }, payload)),
    verifyLogin: (id, phone) => callApi('POST', { action: 'verify_login', id, phone })
  };

  async function fetchJson(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Approximate location for the audit trail. Never blocks registration.
  async function lookupLocation() {
    const unknown = { city: 'Unknown', region: 'Unknown', country: 'Unknown', ip: 'Unknown' };
    if (CFG.geoLookup === false) return unknown;
    const a = await fetchJson('https://ipapi.co/json/', 2500);
    if (a && a.ip && !a.error) {
      return { city: a.city || 'Unknown', region: a.region || 'Unknown', country: a.country_name || 'Unknown', ip: a.ip };
    }
    const b = await fetchJson('https://ipwho.is/', 2500);
    if (b && b.ip && b.success !== false) {
      return { city: b.city || 'Unknown', region: b.region || 'Unknown', country: b.country || 'Unknown', ip: b.ip };
    }
    return unknown;
  }

  function prefetchLocation() {
    if (!state.locationPromise) state.locationPromise = lookupLocation();
    return state.locationPromise;
  }

  function withDeadline(promise, ms, fallback) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
  }

  // ==========================================================================
  // Session (per tab, no phone numbers stored)
  // ==========================================================================
  function saveSession(crown) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ crown, savedAt: Date.now() }));
    } catch (e) { /* private mode: card simply won't survive a reload */ }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.crown || !s.crown.crownId || Date.now() - s.savedAt > SESSION_TTL_MS) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s.crown;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  // ==========================================================================
  // Portal tabs
  // ==========================================================================
  function setPortalMode(mode) {
    const login = mode === 'login';
    el.tabLogin.style.background = login ? '#052659' : 'transparent';
    el.tabLogin.style.color = login ? '#F2FAFF' : '#5483B3';
    el.tabRegister.style.background = login ? 'transparent' : '#052659';
    el.tabRegister.style.color = login ? '#5483B3' : '#F2FAFF';
    el.tabLogin.setAttribute('aria-selected', String(login));
    el.tabRegister.setAttribute('aria-selected', String(!login));
    (login ? hide : show)(el.panelRegister);
    (login ? show : hide)(el.panelLogin);
    el.heading.textContent = login ? 'Patient Check-In' : 'Register Your Crown';
    el.subhead.textContent = login
      ? 'Enter your Crown ID and registered mobile number to access your card.'
      : 'Enter the ID on your box to activate your digital warranty.';
  }

  // ==========================================================================
  // Step 1: Crown ID lookup
  // ==========================================================================
  function setHint(text, tone) {
    const colors = { info: '#6b84a0', busy: '#5483B3', ok: '#16a34a', error: '#c0392b' };
    el.idHint.textContent = text;
    el.idHint.style.color = colors[tone] || colors.info;
  }

  function resetStep1() {
    hide(el.crownValidIcon);
    show(el.step1Num);
    hide(el.step1Check);
    hide(el.matchBox);
    hide(el.stepConnector);
    hide(el.step2Indicator);
    hide(el.step2Section);
    hide(el.retry);
    hide(el.registerError);
    el.loginMasked.textContent = '';
    el.crownId.removeAttribute('aria-invalid');
  }

  function onCrownIdInput(e) {
    const v = formatCrownId(e.target.value);
    el.crownId.value = v;
    el.loginId.value = v;
    hide(el.loginIdErr);
    clearTimeout(state.lookupTimer);
    if (!ID_RE.test(v)) {
      resolveCrown(v, true); // incomplete: reset the form right away, no network call
      return;
    }
    if (v === state.lastLookupId) return;
    state.lookupTimer = setTimeout(() => resolveCrown(v, true), 250);
  }

  async function resolveCrown(id, autoFocus) {
    const seq = ++state.lookupSeq;
    resetStep1();
    state.lastLookupId = '';

    if (!ID_RE.test(id)) {
      if (id.length >= 8 || (id.length >= 4 && !/^[A-Z]{3}/.test(id))) {
        setHint('Crown IDs look like ZIR-4510 — three letters, then four numbers.', 'error');
        el.crownId.setAttribute('aria-invalid', 'true');
      } else {
        setHint('Printed on the packaging label of your crown (sample: ZIR-4510).', 'info');
      }
      return;
    }

    setHint('Checking laboratory registry…', 'busy');
    const res = await api.lookup(id);
    if (seq !== state.lookupSeq) return; // a newer lookup has started
    state.lastLookupId = id;

    if (res.success && res.isRegistered) {
      setPortalMode('login');
      el.loginId.value = id;
      el.loginMasked.textContent = res.maskedPhone ? `Registered ${res.maskedPhone}` : '';
      hide(el.loginError);
      setHint('Crown found.', 'ok');
      if (autoFocus) el.loginPhone.focus();
      return;
    }

    if (res.success && res.crown) {
      setPortalMode('register');
      showMatch(res.crown);
      prefetchLocation();
      if (autoFocus) el.name.focus();
      return;
    }

    state.lastLookupId = '';
    if (res.code === 'NETWORK' || res.code === 'TIMEOUT' || res.code === 'SERVER_ERROR' || res.code === 'BUSY') {
      show(el.retry);
    } else {
      el.crownId.setAttribute('aria-invalid', 'true');
    }
    setHint(res.error || MSG.GENERIC, 'error');
  }

  function showMatch(c) {
    show(el.crownValidIcon);
    hide(el.step1Num);
    show(el.step1Check);
    setHint('Crown verified in laboratory registry.', 'ok');

    el.matchTitle.textContent = c.materialFull || c.product || 'Dental crown';
    const clinicLine = [c.clinic, c.dentist].filter(Boolean).join(' · ');
    el.matchClinic.textContent = clinicLine;
    (clinicLine ? show : hide)(el.matchClinic);
    el.matchFitted.textContent = [
      c.dispatchDate ? `Dispatched ${fmtLong(c.dispatchDate)}` : '',
      c.tooth ? `Teeth ${c.tooth}` : ''
    ].filter(Boolean).join(' · ');
    show(el.matchBox);
    show(el.stepConnector);
    show(el.step2Indicator);
    show(el.step2Section);
  }

  // ==========================================================================
  // Step 2: registration
  // ==========================================================================
  function updatePhoneHint() {
    const phoneDigits = digits(el.phone.value);
    if (el.name.value.trim().length >= 2 || document.activeElement === el.phone || phoneDigits) {
      show(el.phoneHelper);
      show(el.phoneAuthTag);
    } else {
      hide(el.phoneHelper);
      hide(el.phoneAuthTag);
    }
    const tone = phoneDigits.length >= 10 ? 'ok' : phoneDigits.length > 0 ? 'warn' : 'info';
    const styles = {
      ok: ['#F0FDF4', '#BBF7D0', '#166534', 'Phone linked: ready for secure check-in.'],
      warn: ['#FFFBEB', '#FDE68A', '#92400E', `Enter your 10-digit mobile number (${phoneDigits.length}/10 digits).`],
      info: ['#F0F7FD', '#D0E4F5', '#3b5f8a', 'This number becomes your check-in key. You’ll need it to open your card later.']
    }[tone];
    el.phoneHelper.style.background = styles[0];
    el.phoneHelper.style.borderColor = styles[1];
    el.phoneHelper.style.color = styles[2];
    el.phoneHelperText.textContent = styles[3];
  }

  function fieldError(input, errNode, bad) {
    (bad ? show : hide)(errNode);
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    return !bad;
  }

  function validName(name) {
    return name.length >= 2 && name.length <= 80 && /\p{L}/u.test(name);
  }

  function validPhone(p) {
    return p.length >= 10 && p.length <= 15;
  }

  function validEmail(email) {
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function setRegisterBusy(busy) {
    state.registering = busy;
    el.submit.disabled = busy;
    el.submit.setAttribute('aria-busy', String(busy));
    (busy ? show : hide)(el.submitSpinner);
    el.submitText.textContent = busy ? 'Activating your warranty…' : 'Activate Warranty & Show Card';
    el.locationHint.textContent = busy ? 'Securing registration & activating warranty…' : 'Encrypted registration & tamper-evident verification';
  }

  async function onRegisterSubmit(e) {
    e.preventDefault();
    if (state.registering) return;
    hide(el.registerError);

    const crownId = formatCrownId(el.crownId.value);
    const name = el.name.value.trim().replace(/\s+/g, ' ');
    const phone = digits(el.phone.value);
    const email = el.email.value.trim();

    if (!ID_RE.test(crownId) || state.lastLookupId !== crownId) {
      resolveCrown(crownId, false);
      return;
    }
    const ok = [
      fieldError(el.name, el.nameErr, !validName(name)),
      fieldError(el.phone, el.phoneErr, !validPhone(phone)),
      fieldError(el.email, el.emailErr, !validEmail(email))
    ].every(Boolean);
    if (!ok) {
      const firstBad = [el.name, el.phone, el.email].find((i) => i.getAttribute('aria-invalid') === 'true');
      if (firstBad) firstBad.focus();
      return;
    }

    setRegisterBusy(true);
    try {
      const location = await withDeadline(prefetchLocation(), 3000, { city: 'Unknown', region: 'Unknown', country: 'Unknown', ip: 'Unknown' });
      const res = await api.register({
        id: crownId, patientName: name, phone, email,
        consentAgreed: true, consentVersion: CONSENT_VERSION, location
      });

      if (res.success && res.crown) {
        openCard(res.crown);
        return;
      }
      if (res.code === 'ALREADY_REGISTERED') {
        // Same person re-submitting (e.g. after a dropped response): just sign them in.
        const login = await api.verifyLogin(crownId, phone);
        if (login.success && login.crown) {
          openCard(login.crown);
          return;
        }
        setPortalMode('login');
        el.loginId.value = crownId;
        el.loginMasked.textContent = res.maskedPhone ? `Registered ${res.maskedPhone}` : '';
        showLoginError('This crown is already registered' + (res.maskedPhone ? ` to a phone ${res.maskedPhone}` : '') + '. Enter that number to check in.');
        el.loginPhone.focus();
        return;
      }
      el.registerError.textContent = res.error || MSG.GENERIC;
      show(el.registerError);
      el.registerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      setRegisterBusy(false);
    }
  }

  // ==========================================================================
  // Patient check-in
  // ==========================================================================
  function showLoginError(text) {
    el.loginErrorText.textContent = text;
    show(el.loginError);
    el.loginError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setLoginBusy(busy) {
    state.loggingIn = busy;
    el.loginSubmit.disabled = busy;
    el.loginSubmit.setAttribute('aria-busy', String(busy));
    (busy ? show : hide)(el.loginSpinner);
    el.loginBtnText.textContent = busy ? 'Verifying…' : 'Verify Identity & View Card';
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    if (state.loggingIn) return;
    hide(el.loginError);
    const crownId = formatCrownId(el.loginId.value);
    const phone = digits(el.loginPhone.value);
    const ok = [
      fieldError(el.loginId, el.loginIdErr, !ID_RE.test(crownId)),
      fieldError(el.loginPhone, el.loginPhoneErr, !validPhone(phone))
    ].every(Boolean);
    if (!ok) return;

    setLoginBusy(true);
    try {
      const res = await api.verifyLogin(crownId, phone);
      if (res.success && res.crown) {
        openCard(res.crown);
        return;
      }
      if (res.code === 'NOT_REGISTERED') {
        setPortalMode('register');
        el.crownId.value = crownId;
        resolveCrown(crownId, true);
        return;
      }
      let message = res.error || MSG.GENERIC;
      if (res.code === 'WRONG_PHONE' && typeof res.attemptsLeft === 'number' && res.attemptsLeft <= 2) {
        message += ` ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? '' : 's'} left.`;
      }
      showLoginError(message);
    } finally {
      setLoginBusy(false);
    }
  }

  // ==========================================================================
  // Card view
  // ==========================================================================
  function renderCard(c) {
    const product = c.product || 'Dental crown';
    const year = parseIso(c.dispatchDate) ? String(parseIso(c.dispatchDate).y) : '';
    el.cardProduct.textContent = product;
    el.cardMeta.textContent = [c.tooth && `Teeth ${c.tooth}`, c.shade && `Shade ${c.shade}`, year].filter(Boolean).join(' · ');
    el.cardPatient.textContent = (c.patient || '').toUpperCase();
    el.cardPatient.title = c.patient || '';
    el.cardWarrantyId.textContent = c.warrantyId || '';
    el.cardValidThru.textContent = fmtValidThru(c.expiryDate);

    el.backTooth.textContent = c.tooth || '—';
    el.backShade.textContent = c.shade || '—';
    el.backCase.textContent = c.caseRef || '—';
    el.backDentist.textContent = c.dentist || '—';
    el.backIssued.textContent = fmtShort(c.dispatchDate) || '—';

    el.dashRestoration.textContent = c.materialFull || product;
    el.dashClinic.textContent = c.clinic || '—';
    el.dashWarrantyId.textContent = c.warrantyId || '—';
    el.dashIssued.textContent = c.dispatchDate ? `Dispatched ${fmtLong(c.dispatchDate)}` : 'Awaiting dispatch';
    el.dashUntil.textContent = c.expiryDate ? `Until ${fmtLong(c.expiryDate)}` : '';

    const start = isoToUtc(c.dispatchDate);
    const end = isoToUtc(c.expiryDate);
    const today = isoToUtc(todayIso());
    const expired = !isNaN(end) && today > end;
    const pct = (!isNaN(start) && !isNaN(end) && end > start) ? Math.min(100, Math.max(2, ((today - start) / (end - start)) * 100)) : 0;
    el.progressBar.style.width = pct.toFixed(1) + '%';
    el.progressBar.setAttribute('aria-valuenow', pct.toFixed(0));

    el.statusLabel.textContent = expired ? 'Warranty expired' : 'Warranty active';
    el.statusTag.textContent = expired ? `Ended ${fmtLong(c.expiryDate)}` : 'Verified genuine';
    el.statusDot.style.background = expired ? '#f59e0b' : '#C1E8FF';
    el.statusDot.style.animation = expired ? 'none' : '';
  }

  function openCard(crown) {
    state.currentCrown = crown;
    saveSession(crown);
    renderCard(crown);
    showCardView();
  }

  function showCardView() {
    hide(el.formView);
    show(el.cardView);
    el.page.style.background = 'linear-gradient(180deg, #C1E8FF 0%, #7DA0CA 22%, #5483B3 40%, #052659 66%, #021024 100%)';
    setFlipped(false);
    motion.start();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showFormView() {
    hide(el.cardView);
    show(el.formView);
    motion.stop();
    el.page.style.background = 'linear-gradient(180deg, #F5FAFE 0%, #E6F1FB 45%, #D2E4F5 100%)';
  }

  function signOut() {
    clearSession();
    state.currentCrown = null;
    state.lastLookupId = '';
    state.locationPromise = null;
    [el.crownId, el.loginId, el.name, el.phone, el.email, el.loginPhone].forEach((i) => { i.value = ''; i.removeAttribute('aria-invalid'); });
    [el.nameErr, el.phoneErr, el.emailErr, el.loginError, el.loginIdErr, el.loginPhoneErr, el.phoneHelper, el.phoneAuthTag].forEach(hide);
    resetStep1();
    setHint('Printed on the packaging label of your crown.', 'info');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      url.searchParams.delete('view');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) { /* ignore */ }
    setPortalMode('register');
    showFormView();
    window.scrollTo({ top: 0 });
    el.crownId.focus();
  }

  function setFlipped(flipped) {
    state.flipped = flipped;
    el.flipper.style.transform = flipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    el.flipHint.textContent = flipped ? 'TAP TO SEE FRONT' : 'TAP CARD FOR CASE DETAILS';
  }

  function toggleFlip() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function' && !state.gyroAsked) {
      state.gyroAsked = true;
      DOE.requestPermission().catch(() => {});
    }
    setFlipped(!state.flipped);
  }

  function downloadPdf() {
    const oldTitle = document.title;
    const id = (state.currentCrown && (state.currentCrown.warrantyId || state.currentCrown.crownId)) || 'Card';
    document.title = 'Hesyra-Warranty-' + id.replace(/\s+/g, '-');
    setFlipped(false);
    window.print();
    setTimeout(() => { document.title = oldTitle; }, 500);
  }

  // 3D tilt & reflection. Runs only while the card is on screen.
  const motion = (function () {
    const t = { x: 0.5, y: 0.3, tx: 0.5, ty: 0.3, last: 0, raf: 0 };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function loop(now) {
      if (!reduce && now - t.last > 2200) {
        t.tx = 0.5 + Math.sin(now / 2600) * 0.32;
        t.ty = 0.35 + Math.cos(now / 3400) * 0.22;
      }
      t.x += (t.tx - t.x) * 0.08;
      t.y += (t.ty - t.y) * 0.08;
      const k = reduce ? 0 : 1;
      const s = el.card.style;
      s.setProperty('--ry', ((t.x - 0.5) * 18 * k).toFixed(2) + 'deg');
      s.setProperty('--rx', ((0.5 - t.y) * 14 * k).toFixed(2) + 'deg');
      s.setProperty('--mx', (t.x * 100).toFixed(1) + '%');
      s.setProperty('--my', (t.y * 100).toFixed(1) + '%');
      s.setProperty('--gl', (0.35 + Math.hypot(t.x - 0.5, t.y - 0.5) * 0.9).toFixed(3));
      t.raf = requestAnimationFrame(loop);
    }
    el.stage.addEventListener('pointermove', (e) => {
      const r = el.stage.getBoundingClientRect();
      t.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      t.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      t.last = performance.now();
    });
    el.stage.addEventListener('pointerleave', () => { t.last = 0; });
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      t.tx = Math.min(1, Math.max(0, 0.5 + e.gamma / 50));
      t.ty = Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 50));
      t.last = performance.now();
    });
    return {
      start() { if (!t.raf) t.raf = requestAnimationFrame(loop); },
      stop() { if (t.raf) cancelAnimationFrame(t.raf); t.raf = 0; }
    };
  })();

  // ==========================================================================
  // Legal modal
  // ==========================================================================
  function switchPolicy(tab) {
    const privacy = tab === 'privacy';
    el.modalTabPrivacy.style.background = privacy ? '#C1E8FF' : 'transparent';
    el.modalTabPrivacy.style.color = privacy ? '#021024' : '#7DA0CA';
    el.modalTabTerms.style.background = privacy ? 'transparent' : '#C1E8FF';
    el.modalTabTerms.style.color = privacy ? '#7DA0CA' : '#021024';
    el.modalTabPrivacy.setAttribute('aria-pressed', String(privacy));
    el.modalTabTerms.setAttribute('aria-pressed', String(!privacy));
    (privacy ? show : hide)(el.modalPrivacy);
    (privacy ? hide : show)(el.modalTerms);
  }

  function openModal(tab) {
    state.lastFocus = document.activeElement;
    switchPolicy(tab);
    show(el.termsModal);
    el.closeTerms.focus();
  }

  function closeModal() {
    if (el.termsModal.classList.contains('hidden')) return;
    hide(el.termsModal);
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  // ==========================================================================
  // Wiring
  // ==========================================================================
  el.tabRegister.addEventListener('click', () => setPortalMode('register'));
  el.tabLogin.addEventListener('click', () => setPortalMode('login'));
  el.switchToRegister.addEventListener('click', () => {
    setPortalMode('register');
    el.crownId.focus();
  });

  el.crownId.addEventListener('input', onCrownIdInput);
  el.loginId.addEventListener('input', onCrownIdInput);
  el.retry.addEventListener('click', () => resolveCrown(formatCrownId(el.crownId.value), true));

  el.name.addEventListener('input', () => { updatePhoneHint(); if (validName(el.name.value.trim())) fieldError(el.name, el.nameErr, false); });
  el.name.addEventListener('blur', updatePhoneHint);
  el.phone.addEventListener('focus', updatePhoneHint);
  el.phone.addEventListener('input', () => { updatePhoneHint(); if (validPhone(digits(el.phone.value))) fieldError(el.phone, el.phoneErr, false); });
  el.email.addEventListener('input', () => { if (validEmail(el.email.value.trim())) fieldError(el.email, el.emailErr, false); });
  el.loginPhone.addEventListener('input', () => { hide(el.loginError); if (validPhone(digits(el.loginPhone.value))) fieldError(el.loginPhone, el.loginPhoneErr, false); });

  el.registerForm.addEventListener('submit', onRegisterSubmit);
  el.loginForm.addEventListener('submit', onLoginSubmit);

  el.stage.addEventListener('click', toggleFlip);
  el.stage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleFlip();
    }
  });
  el.downloadPdf.addEventListener('click', downloadPdf);
  el.signOut.addEventListener('click', signOut);

  el.modalTabTerms.addEventListener('click', () => switchPolicy('terms'));
  el.modalTabPrivacy.addEventListener('click', () => switchPolicy('privacy'));
  el.openTerms.addEventListener('click', (e) => { e.stopPropagation(); openModal('terms'); });
  el.viewTerms.addEventListener('click', (e) => { e.preventDefault(); openModal('terms'); });
  el.viewPrivacy.addEventListener('click', (e) => { e.preventDefault(); openModal('privacy'); });
  el.closeTerms.addEventListener('click', closeModal);
  el.termsModal.addEventListener('click', (e) => { if (e.target === el.termsModal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ==========================================================================
  // Boot
  // ==========================================================================
  (function boot() {
    const params = new URLSearchParams(window.location.search);
    const idParam = formatCrownId(params.get('id') || '');
    const session = loadSession();

    if (session && (!idParam || idParam === session.crownId)) {
      openCard(session);
      return;
    }
    showFormView();
    setPortalMode('register');
    if (idParam) {
      el.crownId.value = idParam;
      el.loginId.value = idParam;
      resolveCrown(idParam, false);
    }
  })();
})();
