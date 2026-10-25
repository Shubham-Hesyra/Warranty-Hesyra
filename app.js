/**
 * Hesyra Labs — Digital Crown Warranty Application
 * Standard Production Implementation of Warranty Card v4
 */

// 1. Comprehensive Crown Database
const CROWN_DB = {
  'ZIR-4510': {
    material: 'Zirconia Crown',
    materialFull: 'Zirconia crown · multi-layer',
    tooth: '16, 17',
    shade: 'A2',
    caseRef: 'JOB-1042',
    dentist: 'Dr Aarav Deshmukh',
    clinic: 'Smile Studio Dental Care, Nagpur',
    issued: '19 Aug 26',
    issuedYear: '2026',
    validThru: '08 / 31',
    validYears: 5,
    issuedTimestamp: Date.UTC(2026, 7, 19),
    expiryTimestamp: Date.UTC(2031, 7, 19)
  },
  'CER-8942': {
    material: 'Ceramic Crown',
    materialFull: 'Ceramic-hybrid crown',
    tooth: '19 (Molar)',
    shade: 'B1',
    caseRef: 'JOB-1088',
    dentist: 'Dr Sarah Jenkins',
    clinic: 'Apex Dental Care, Mumbai',
    issued: '15 Oct 26',
    issuedYear: '2026',
    validThru: '10 / 31',
    validYears: 5,
    issuedTimestamp: Date.UTC(2026, 9, 15),
    expiryTimestamp: Date.UTC(2031, 9, 15)
  },
  'EMX-1001': {
    material: 'E.max Crown',
    materialFull: 'E.max lithium disilicate crown',
    tooth: '8 (Central Incisor)',
    shade: 'BL2',
    caseRef: 'JOB-1102',
    dentist: 'Dr Arthur Miller',
    clinic: 'Prime Aesthetics Lab, Delhi',
    issued: '01 Oct 26',
    issuedYear: '2026',
    validThru: '10 / 31',
    validYears: 5,
    issuedTimestamp: Date.UTC(2026, 9, 1),
    expiryTimestamp: Date.UTC(2031, 9, 1)
  },
  'CER-1001': {
    material: 'Ceramic Crown',
    materialFull: 'Ceramic-hybrid crown',
    tooth: '14 (Premolar)',
    shade: 'A1',
    caseRef: 'JOB-1090',
    dentist: 'Dr Lisa Ray',
    clinic: 'Summit Dental Group, Bangalore',
    issued: '12 Aug 26',
    issuedYear: '2026',
    validThru: '08 / 31',
    validYears: 5,
    issuedTimestamp: Date.UTC(2026, 7, 12),
    expiryTimestamp: Date.UTC(2031, 7, 12)
  }
};

// 2. DOM Elements
const bodyEl = document.body;
const formContainer = document.getElementById('form-container');
const cardStageContainer = document.getElementById('card-stage-container');
const warrantyForm = document.getElementById('warranty-form');

// Stepper Elements
const step1Num = document.getElementById('step1-num');
const step1Check = document.getElementById('step1-check');
const step2Node = document.getElementById('step2-node');
const step2Wrapper = document.getElementById('step2-wrapper');

const crownIdInput = document.getElementById('crown-id-input');
const idValidBadge = document.getElementById('id-valid-badge');
const idHintText = document.getElementById('id-hint-text');
const sampleBtn = document.getElementById('sample-btn');

const crownMatchCard = document.getElementById('crown-match-card');
const matchMaterialTitle = document.getElementById('match-material-title');
const matchClinicLine = document.getElementById('match-clinic-line');
const matchFittedLine = document.getElementById('match-fitted-line');

const patientNameInput = document.getElementById('patient-name-input');
const patientPhoneInput = document.getElementById('patient-phone-input');
const patientEmailInput = document.getElementById('patient-email-input');
const consentCheckbox = document.getElementById('consent-checkbox');
const consentWrap = document.getElementById('consent-wrap');
const consentBox = document.getElementById('consent-box');

const nameError = document.getElementById('name-error');
const phoneError = document.getElementById('phone-error');
const consentError = document.getElementById('consent-error');

const submitBtn = document.getElementById('submit-warranty-btn');
const btnSpinner = document.getElementById('btn-spinner');
const btnLabelText = document.getElementById('btn-label-text');

// GSheet Elements
const gsheetEndpointInput = document.getElementById('gsheet-endpoint-input');
const gsheetStatusPill = document.getElementById('gsheet-status-pill');

// 3D Card Elements
const cardStage = document.getElementById('card-stage');
const card3D = document.getElementById('card-3d');
const cardFlipper = document.getElementById('card-flipper');
const flipHintText = document.getElementById('flip-hint-text');

const cardProductTitle = document.getElementById('card-product-title');
const cardProductMeta = document.getElementById('card-product-meta');
const cardPatientDisplay = document.getElementById('card-patient-display');
const cardIdDisplay = document.getElementById('card-id-display');
const cardExpiryDisplay = document.getElementById('card-expiry-display');

const backToothVal = document.getElementById('back-tooth-val');
const backShadeVal = document.getElementById('back-shade-val');
const backCaseVal = document.getElementById('back-case-val');
const backDentistVal = document.getElementById('back-dentist-val');
const backIssuedVal = document.getElementById('back-issued-val');

// Dashboard Elements
const warrantyProgressBar = document.getElementById('warranty-progress-bar');
const progressStartDate = document.getElementById('progress-start-date');
const progressEndDate = document.getElementById('progress-end-date');
const dashMaterialFull = document.getElementById('dash-material-full');
const dashClinicFull = document.getElementById('dash-clinic-full');
const dashWarrantyId = document.getElementById('dash-warranty-id');

const downloadPdfBtn = document.getElementById('download-pdf-btn');
const restartFlowBtn = document.getElementById('restart-flow-btn');

// Terms Modal Elements
const openTermsBtn = document.getElementById('open-terms-btn');
const closeTermsBtn = document.getElementById('close-terms-btn');
const termsModal = document.getElementById('terms-modal');

// State
let currentCase = null;
let isFlipped = false;
let isVerifying = false;
let hasTriedSubmit = false;
let preferredSample = 'ZIR-4510';

// 3D Physics State
const motionState = {
  x: 0.5,
  y: 0.3,
  tx: 0.5,
  ty: 0.3,
  last: 0,
  rafId: null,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

// ========================================================
// INITIALIZATION & URL ROUTING
// ========================================================
function init() {
  const params = new URLSearchParams(window.location.search);
  const typeParam = (params.get('type') || '').toLowerCase();
  const idParam = params.get('id');

  // Handle Ceramic vs Zirconia QR code packaging targets
  if (typeParam === 'ceramic' || typeParam === 'cer') {
    preferredSample = 'CER-8942';
    sampleBtn.textContent = 'Try Ceramic sample';
  } else if (typeParam === 'emax') {
    preferredSample = 'EMX-1001';
    sampleBtn.textContent = 'Try E.max sample';
  } else {
    preferredSample = 'ZIR-4510';
    sampleBtn.textContent = 'Try Zirconia sample';
  }

  // Restore saved GSheet URL
  const savedGsheet = localStorage.getItem('hesyra_gsheet_url');
  if (savedGsheet) {
    gsheetEndpointInput.value = savedGsheet;
    gsheetStatusPill.textContent = 'Live GSheet';
  }

  // Auto-fill ID if passed in QR URL
  if (idParam) {
    crownIdInput.value = formatIdString(idParam);
    validateCrownId();
  }

  setupEventListeners();
  setup3DMotionPhysics();
}

// Format string as XXX-NNNN
function formatIdString(val) {
  let cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length > 3) {
    cleaned = cleaned.slice(0, 3) + '-' + cleaned.slice(3, 7);
  }
  return cleaned.slice(0, 8);
}

// ========================================================
// EVENT LISTENERS
// ========================================================
function setupEventListeners() {
  // 1. Crown ID Input Formatter & Validator
  crownIdInput.addEventListener('input', (e) => {
    e.target.value = formatIdString(e.target.value);
    validateCrownId();
  });

  // 2. Try Sample Button
  sampleBtn.addEventListener('click', () => {
    crownIdInput.value = preferredSample;
    patientNameInput.value = preferredSample.startsWith('ZIR') ? 'Meera Joshi' : 'Jane Doe';
    patientPhoneInput.value = '+91 98220 12345';
    consentCheckbox.checked = true;
    updateConsentUI();
    validateCrownId();
  });

  // 3. Consent Checkbox Toggle
  consentCheckbox.addEventListener('change', updateConsentUI);

  // 4. Form Submit
  warrantyForm.addEventListener('submit', handleFormSubmit);

  // 5. 3D Card Flip on Click / Tap
  cardStage.addEventListener('click', (e) => {
    // If terms button was clicked inside dashboard, do not flip
    if (e.target.closest('#open-terms-btn')) return;
    flipCard();
  });

  cardStage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flipCard();
    }
  });

  // 6. Download / Print PDF
  downloadPdfBtn.addEventListener('click', handleDownloadPdf);

  // 7. Restart Flow
  restartFlowBtn.addEventListener('click', resetForm);

  // 8. Terms Modal
  openTermsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    termsModal.classList.remove('hidden');
  });

  closeTermsBtn.addEventListener('click', () => {
    termsModal.classList.add('hidden');
  });

  termsModal.addEventListener('click', (e) => {
    if (e.target === termsModal) {
      termsModal.classList.add('hidden');
    }
  });

  // 9. GSheet URL config
  gsheetEndpointInput.addEventListener('change', (e) => {
    const url = e.target.value.trim();
    if (url) {
      localStorage.setItem('hesyra_gsheet_url', url);
      gsheetStatusPill.textContent = 'Live GSheet';
    } else {
      localStorage.removeItem('hesyra_gsheet_url');
      gsheetStatusPill.textContent = 'Active (Local)';
    }
  });
}

function updateConsentUI() {
  if (consentCheckbox.checked) {
    consentBox.classList.add('checked');
    consentWrap.classList.remove('error');
    consentError.classList.add('hidden');
  } else {
    consentBox.classList.remove('checked');
  }
}

// ========================================================
// STEP 1 VALIDATION & CROWN LOOKUP
// ========================================================
async function validateCrownId() {
  const val = crownIdInput.value.trim().toUpperCase();
  const isValidFormat = /^[A-Z]{3}-\d{4}$/.test(val);

  if (isValidFormat) {
    // Look up data in local dictionary or GSheet
    currentCase = await resolveCrownData(val);

    // Update UI Step 1 to valid state
    crownIdInput.classList.remove('error');
    crownIdInput.classList.add('valid');
    idValidBadge.classList.remove('hidden');
    step1Num.classList.add('hidden');
    step1Check.classList.remove('hidden');

    // Update Hint
    idHintText.textContent = 'Crown found. Check the details below.';
    idHintText.className = 'input-hint success';

    // Show Match Preview Card
    matchMaterialTitle.textContent = currentCase.materialFull;
    matchClinicLine.textContent = currentCase.clinic.includes('·') ? currentCase.clinic : `${currentCase.clinic} · ${currentCase.dentist}`;
    matchFittedLine.textContent = `Fitted ${currentCase.issued} · Teeth ${currentCase.tooth}`;
    crownMatchCard.classList.remove('hidden');

    // Unlock Step 2
    step2Wrapper.classList.remove('locked');
    step2Node.classList.remove('inactive');
    step2Node.classList.add('active-unlocked');

  } else {
    // Reset to invalid/incomplete state
    currentCase = null;
    crownIdInput.classList.remove('valid');
    idValidBadge.classList.add('hidden');
    step1Num.classList.remove('hidden');
    step1Check.classList.add('hidden');
    crownMatchCard.classList.add('hidden');

    // Lock Step 2
    step2Wrapper.classList.add('locked');
    step2Node.classList.add('inactive');
    step2Node.classList.remove('active-unlocked');

    if (val.length >= 8) {
      crownIdInput.classList.add('error');
      idHintText.textContent = 'We couldn’t read that ID. It looks like ZIR-4510 or CER-8942.';
      idHintText.className = 'input-hint error';
    } else {
      crownIdInput.classList.remove('error');
      idHintText.textContent = 'Printed on the label of your crown box.';
      idHintText.className = 'input-hint';
    }
  }
}

// Resolve Crown Data (Google Sheet or Local fallback)
async function resolveCrownData(id) {
  const gsheetUrl = gsheetEndpointInput.value.trim();

  // Try fetching from Google Apps Script Web App if configured
  if (gsheetUrl) {
    try {
      const res = await fetch(`${gsheetUrl}?action=lookup&id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error && data.patientName) {
          return {
            material: data.material || 'Permanent Crown',
            materialFull: data.tier || `${data.material} crown`,
            tooth: data.tooth || 'Standard',
            shade: 'A2',
            caseRef: data.serial || `JOB-${id}`,
            dentist: data.doctor || 'Attending Dentist',
            clinic: data.clinic || 'Smile Studio Dental Care',
            issued: data.issueDate || '19 Aug 26',
            issuedYear: '2026',
            validThru: '08 / 31',
            validYears: 5,
            issuedTimestamp: Date.now(),
            expiryTimestamp: Date.now() + 5 * 365 * 24 * 3600 * 1000
          };
        }
      }
    } catch (e) {
      console.warn('GSheet API lookup failed, falling back to local DB:', e);
    }
  }

  // Check Local Mock Dictionary
  if (CROWN_DB[id]) {
    return CROWN_DB[id];
  }

  // Dynamic Generator for any standard valid ID prefix
  const prefix = id.slice(0, 3);
  let material = 'Permanent Crown';
  let materialFull = 'Permanent crown';

  if (prefix === 'ZIR') {
    material = 'Zirconia Crown';
    materialFull = 'Zirconia crown · multi-layer';
  } else if (prefix === 'CER') {
    material = 'Ceramic Crown';
    materialFull = 'Ceramic-hybrid crown';
  } else if (prefix === 'EMX') {
    material = 'E.max Crown';
    materialFull = 'E.max lithium disilicate crown';
  }

  return {
    material,
    materialFull,
    tooth: '16, 17',
    shade: 'A2',
    caseRef: `JOB-${id.replace('-', '')}`,
    dentist: 'Dr Aarav Deshmukh',
    clinic: 'Smile Studio Dental Care, Nagpur',
    issued: '19 Aug 26',
    issuedYear: '2026',
    validThru: '08 / 31',
    validYears: 5,
    issuedTimestamp: Date.UTC(2026, 7, 19),
    expiryTimestamp: Date.UTC(2031, 7, 19)
  };
}

// ========================================================
// STEP 2 SUBMISSION & LEAD LOGGING
// ========================================================
async function handleFormSubmit(e) {
  e.preventDefault();
  hasTriedSubmit = true;

  const nameVal = patientNameInput.value.trim();
  const phoneClean = patientPhoneInput.value.replace(/\D/g, '');
  const emailVal = patientEmailInput.value.trim();
  const isConsent = consentCheckbox.checked;

  let isValid = true;

  if (nameVal.length < 2) {
    patientNameInput.classList.add('error');
    nameError.classList.remove('hidden');
    isValid = false;
  } else {
    patientNameInput.classList.remove('error');
    nameError.classList.add('hidden');
  }

  if (phoneClean.length < 8) {
    patientPhoneInput.classList.add('error');
    phoneError.classList.remove('hidden');
    isValid = false;
  } else {
    patientPhoneInput.classList.remove('error');
    phoneError.classList.add('hidden');
  }

  if (!isConsent) {
    consentWrap.classList.add('error');
    consentError.classList.remove('hidden');
    isValid = false;
  } else {
    consentWrap.classList.remove('error');
    consentError.classList.add('hidden');
  }

  if (!isValid || isVerifying || !currentCase) return;

  isVerifying = true;
  submitBtn.disabled = true;
  btnSpinner.classList.remove('hidden');
  btnLabelText.textContent = 'Creating your card…';

  // Save Lead for Marketing Retargeting
  const leadPayload = {
    patientId: crownIdInput.value.trim().toUpperCase(),
    patientName: nameVal,
    patientPhone: patientPhoneInput.value.trim(),
    patientEmail: emailVal,
    crownMaterial: currentCase.materialFull,
    dentist: currentCase.dentist,
    clinic: currentCase.clinic,
    timestamp: new Date().toISOString()
  };

  // Local storage retention
  const savedLeads = JSON.parse(localStorage.getItem('hesyra_patient_leads') || '[]');
  savedLeads.push(leadPayload);
  localStorage.setItem('hesyra_patient_leads', JSON.stringify(savedLeads));

  // Forward to Google Apps Script if URL provided
  const gsheetUrl = gsheetEndpointInput.value.trim();
  if (gsheetUrl) {
    fetch(gsheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'no-cors',
      body: JSON.stringify({ action: 'capture_lead', ...leadPayload })
    }).catch(err => console.warn('GSheet lead save error:', err));
  }

  // Populate Card and Dashboard
  populateCardAndDashboard(nameVal);

  // Transition views with smooth animation
  setTimeout(() => {
    isVerifying = false;
    submitBtn.disabled = false;
    btnSpinner.classList.add('hidden');
    btnLabelText.textContent = 'Activate warranty';

    bodyEl.setAttribute('data-step', 'card');
    formContainer.classList.add('hidden');
    cardStageContainer.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Reset card flip to front
    isFlipped = false;
    cardFlipper.classList.remove('flipped');
    flipHintText.textContent = 'Tap card for case details';
  }, 1200);
}

// ========================================================
// CARD DATA BINDING
// ========================================================
function populateCardAndDashboard(patientName) {
  const id = crownIdInput.value.trim().toUpperCase();
  const c = currentCase;
  const warrantyFormatted = 'HLW ' + id.replace('-', ' ') + ' 2608';

  // Card Front
  cardProductTitle.textContent = c.material;
  cardProductMeta.textContent = `Teeth ${c.tooth} · Shade ${c.shade} · ${c.issuedYear}`;
  cardPatientDisplay.textContent = patientName.toUpperCase();
  cardIdDisplay.textContent = warrantyFormatted;
  cardExpiryDisplay.textContent = c.validThru;

  // Card Back
  backToothVal.textContent = c.tooth;
  backShadeVal.textContent = c.shade;
  backCaseVal.textContent = c.caseRef;
  backDentistVal.textContent = c.dentist;
  backIssuedVal.textContent = c.issued;

  // Dashboard Under Card
  dashMaterialFull.textContent = c.materialFull;
  dashClinicFull.textContent = c.clinic;
  dashWarrantyId.textContent = warrantyFormatted;

  progressStartDate.textContent = `Issued ${c.issued} ${c.issuedYear}`;
  progressEndDate.textContent = `Until ${c.issued} ${parseInt(c.issuedYear) + c.validYears}`;

  // Calculate Progress Percent
  const startMs = c.issuedTimestamp || Date.UTC(2026, 7, 19);
  const endMs = c.expiryTimestamp || (startMs + c.validYears * 365.25 * 24 * 3600 * 1000);
  const nowMs = Date.now();
  const pct = Math.min(100, Math.max(2, ((nowMs - startMs) / (endMs - startMs)) * 100));
  warrantyProgressBar.style.width = pct.toFixed(1) + '%';
}

// ========================================================
// 3D FLIP LOGIC
// ========================================================
function flipCard() {
  // Mobile permission check for iOS Gyroscope
  if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function' && !window._gyroAsked) {
    window._gyroAsked = true;
    window.DeviceOrientationEvent.requestPermission().catch(() => {});
  }

  isFlipped = !isFlipped;
  cardFlipper.classList.toggle('flipped', isFlipped);
  flipHintText.textContent = isFlipped ? 'Tap to see front' : 'Tap card for case details';
}

// ========================================================
// 3D MOTION PHYSICS (MOUSE & GYROSCOPE)
// ========================================================
function setup3DMotionPhysics() {
  const m = motionState;

  // Pointer Movement over card
  cardStage.addEventListener('pointermove', (e) => {
    const rect = cardStage.getBoundingClientRect();
    m.tx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    m.ty = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    m.last = performance.now();
  });

  cardStage.addEventListener('pointerleave', () => {
    m.last = 0;
  });

  // Mobile Device Orientation
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    m.tx = Math.min(1, Math.max(0, 0.5 + e.gamma / 50));
    m.ty = Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 50));
    m.last = performance.now();
  });

  // Continuous Physics Loop
  function loop(now) {
    if (!m.reducedMotion && now - m.last > 2200) {
      // Idle ambient breathing motion
      m.tx = 0.5 + Math.sin(now / 2600) * 0.32;
      m.ty = 0.35 + Math.cos(now / 3400) * 0.22;
    }

    // Smooth interpolation (spring dampening)
    m.x += (m.tx - m.x) * 0.08;
    m.y += (m.ty - m.y) * 0.08;

    if (card3D) {
      const k = m.reducedMotion ? 0 : 1;
      card3D.style.setProperty('--ry', ((m.x - 0.5) * 18 * k).toFixed(2) + 'deg');
      card3D.style.setProperty('--rx', ((0.5 - m.y) * 14 * k).toFixed(2) + 'deg');
      card3D.style.setProperty('--mx', (m.x * 100).toFixed(1) + '%');
      card3D.style.setProperty('--my', (m.y * 100).toFixed(1) + '%');
      card3D.style.setProperty('--gl', (0.35 + Math.hypot(m.x - 0.5, m.y - 0.5) * 0.9).toFixed(3));
    }

    m.rafId = requestAnimationFrame(loop);
  }

  m.rafId = requestAnimationFrame(loop);
}

// ========================================================
// PDF DOWNLOAD & PRINT
// ========================================================
function handleDownloadPdf() {
  const oldTitle = document.title;
  const id = crownIdInput.value.trim().toUpperCase() || 'ZIR-4510';
  document.title = 'Hesyra-Warranty-' + id;

  // Reset to front face for printing
  isFlipped = false;
  cardFlipper.classList.remove('flipped');

  window.print();

  setTimeout(() => {
    document.title = oldTitle;
  }, 500);
}

// ========================================================
// RESTART FLOW
// ========================================================
function resetForm() {
  bodyEl.setAttribute('data-step', 'form');
  cardStageContainer.classList.add('hidden');
  formContainer.classList.remove('hidden');

  crownIdInput.value = '';
  patientNameInput.value = '';
  patientPhoneInput.value = '';
  patientEmailInput.value = '';
  consentCheckbox.checked = false;
  updateConsentUI();
  validateCrownId();

  hasTriedSubmit = false;
  isFlipped = false;
  cardFlipper.classList.remove('flipped');
  window.scrollTo({ top: 0 });
}

// Launch
init();
