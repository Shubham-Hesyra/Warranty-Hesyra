/**
 * Hesyra Labs — Custom QR & Packaging Label Studio Controller (v2.2.0)
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const DEFAULT_ORIGIN = 'https://warranty-hesyra.onrender.com';
  function getBaseUrl() {
    const origin = window.location.origin;
    if (!origin || origin.startsWith('file:') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return DEFAULT_ORIGIN;
    }
    return origin;
  }

  const BASE_URL = getBaseUrl();

  // Elements
  const el = {
    tabSingle: $('tab-single'),
    tabGeneral: $('tab-general'),
    tabBatch: $('tab-batch'),
    panelSingle: $('panel-single'),
    panelGeneral: $('panel-general'),
    panelBatch: $('panel-batch'),
    inputCrownId: $('input-crown-id'),
    inputMaterial: $('input-material'),
    inputDentist: $('input-dentist'),
    inputGeneralUrl: $('input-general-url'),
    inputBatchIds: $('input-batch-ids'),
    labelTargetUrl: $('label-target-url'),
    checkLogo: $('check-logo'),
    checkRounded: $('check-rounded'),
    previewBadge: $('preview-badge'),
    sticker50x30: $('sticker-preview-50x30'),
    sticker40x40: $('sticker-preview-40x40'),
    stickerCard: $('sticker-preview-card'),
    stickerQrOnly: $('sticker-preview-qr-only'),
    batchContainer: $('batch-preview-container'),
    batchGrid: $('batch-grid'),
    qrSlot50x30: $('box-qr-slot-50x30'),
    qrSlot40x40: $('box-qr-slot-40x40'),
    qrSlotCard: $('box-qr-slot-card'),
    qrSlotQrOnly: $('box-qr-slot-qr-only'),
    prevId50x30: $('prev-id-50x30'),
    prevMat50x30: $('prev-mat-50x30'),
    prevId40x40: $('prev-id-40x40'),
    prevIdCard: $('prev-id-card'),
    prevMatCard: $('prev-mat-card'),
    prevDentistCard: $('prev-dentist-card'),
    prevIdQrOnly: $('prev-id-qr-only'),
    btnPrint: $('btn-print'),
    btnDownloadPng: $('btn-download-png'),
    btnDownloadSvg: $('btn-download-svg'),
    btnTestLink: $('btn-test-link'),
    exportCanvas: $('export-canvas')
  };

  // State
  let state = {
    mode: 'single',        // 'single' | 'general' | 'batch'
    format: '50x30',       // '50x30' | '40x40' | 'card' | 'qr-only'
    color: '#052659',
    bgColor: '#ffffff',
    logo: true,
    rounded: true
  };

  function sanitizeCrownId(raw) {
    return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  }

  function getTargetUrl() {
    if (state.mode === 'general') {
      return el.inputGeneralUrl.value.trim() || `${BASE_URL}/`;
    }
    const id = sanitizeCrownId(el.inputCrownId.value) || 'ZIR-4510';
    return `${BASE_URL}/?id=${encodeURIComponent(id)}`;
  }

  function getActiveQrOptions(size = 320) {
    return {
      size: size,
      color: state.color,
      bgColor: state.bgColor,
      logo: state.logo,
      logoUrl: 'assets/logo.png',
      logoRatio: 0.22,
      moduleStyle: state.rounded ? 'rounded' : 'square',
      eyeStyle: state.rounded ? 'rounded' : 'square'
    };
  }

  function renderPreview() {
    if (!window.HesyraQR) return;

    const id = sanitizeCrownId(el.inputCrownId.value) || 'ZIR-4510';
    const material = el.inputMaterial.value.trim() || 'Custom Dental Restoration';
    const dentist = el.inputDentist.value.trim() || 'Hesyra Certified Clinic';
    const targetUrl = getTargetUrl();

    // Update link & label
    if (el.labelTargetUrl) el.labelTargetUrl.textContent = targetUrl;
    if (el.btnTestLink) el.btnTestLink.href = targetUrl;

    // Update text in previews
    if (el.prevId50x30) el.prevId50x30.textContent = id;
    if (el.prevMat50x30) el.prevMat50x30.textContent = material;
    if (el.prevId40x40) el.prevId40x40.textContent = id;
    if (el.prevIdCard) el.prevIdCard.textContent = id;
    if (el.prevMatCard) el.prevMatCard.textContent = material;
    if (el.prevDentistCard) el.prevDentistCard.textContent = dentist;
    if (el.prevIdQrOnly) el.prevIdQrOnly.textContent = state.mode === 'general' ? 'Hesyra Digital Warranty' : id;

    // Visibility of Format Previews
    const isBatch = state.mode === 'batch';
    el.batchContainer.classList.toggle('hidden', !isBatch);
    el.sticker50x30.classList.toggle('hidden', isBatch || state.format !== '50x30');
    el.sticker40x40.classList.toggle('hidden', isBatch || state.format !== '40x40');
    el.stickerCard.classList.toggle('hidden', isBatch || state.format !== 'card');
    el.stickerQrOnly.classList.toggle('hidden', isBatch || state.format !== 'qr-only');

    if (isBatch) {
      renderBatch();
      return;
    }

    // Single / General SVG generation
    const qrSvg = window.HesyraQR.createSvg(targetUrl, getActiveQrOptions(320));

    if (state.format === '50x30' && el.qrSlot50x30) {
      el.qrSlot50x30.innerHTML = qrSvg;
    } else if (state.format === '40x40' && el.qrSlot40x40) {
      el.qrSlot40x40.innerHTML = qrSvg;
    } else if (state.format === 'card' && el.qrSlotCard) {
      el.qrSlotCard.innerHTML = qrSvg;
    } else if (state.format === 'qr-only' && el.qrSlotQrOnly) {
      el.qrSlotQrOnly.innerHTML = qrSvg;
    }
  }

  function renderBatch() {
    const raw = el.inputBatchIds.value;
    const ids = raw.split(/[\n,;]+/).map(sanitizeCrownId).filter(Boolean);
    if (!ids.length) ids.push('ZIR-4510');

    el.batchGrid.innerHTML = '';
    const opts = getActiveQrOptions(240);

    ids.forEach(id => {
      const url = `${BASE_URL}/?id=${encodeURIComponent(id)}`;
      const svg = window.HesyraQR.createSvg(url, opts);

      const sticker = document.createElement('div');
      sticker.className = 'dental-sticker-50x30';
      sticker.style.width = '100%';
      sticker.innerHTML = `
        <div class="sticker-qr">${svg}</div>
        <div class="sticker-info">
          <div style="display: flex; align-items: center; gap: 6px">
            <img src="assets/logo.png" alt="" style="width: 14px; height: 14px; object-fit: contain">
            <span style="font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #021024">HESYRA LABS</span>
          </div>
          <div style="margin: 4px 0">
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; color: #5483B3; display: block">CROWN ID</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; color: #052659">${id}</span>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 3px; display: flex; justify-content: space-between; align-items: flex-end">
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 7px; font-weight: 600; text-transform: uppercase; color: #052659">Scan to activate</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 7px; color: #718096">5-Yr Digital</span>
          </div>
        </div>
      `;
      el.batchGrid.appendChild(sticker);
    });
  }

  // Switch Mode
  function setMode(mode) {
    state.mode = mode;
    el.tabSingle.setAttribute('aria-selected', mode === 'single');
    el.tabGeneral.setAttribute('aria-selected', mode === 'general');
    el.tabBatch.setAttribute('aria-selected', mode === 'batch');

    el.panelSingle.classList.toggle('hidden', mode !== 'single');
    el.panelGeneral.classList.toggle('hidden', mode !== 'general');
    el.panelBatch.classList.toggle('hidden', mode !== 'batch');

    renderPreview();
  }

  // Export handlers
  function downloadSvg() {
    const id = sanitizeCrownId(el.inputCrownId.value) || 'HESYRA';
    const targetUrl = getTargetUrl();
    const svg = window.HesyraQR.createSvg(targetUrl, getActiveQrOptions(800));
    const filename = state.mode === 'general' ? 'hesyra-warranty-qr.svg' : `hesyra-qr-${id}.svg`;
    window.HesyraQR.downloadSvg(svg, filename);
  }

  function downloadPng() {
    const id = sanitizeCrownId(el.inputCrownId.value) || 'HESYRA';
    const targetUrl = getTargetUrl();
    const canvas = el.exportCanvas;
    const filename = state.mode === 'general' ? 'hesyra-warranty-qr.png' : `hesyra-qr-${id}.png`;

    window.HesyraQR.drawToCanvas(canvas, targetUrl, getActiveQrOptions(1200))
      .then(c => {
        window.HesyraQR.downloadPng(c, filename);
      })
      .catch(err => {
        console.error('Failed to export PNG:', err);
      });
  }

  function printLabels() {
    window.print();
  }

  // Event Listeners
  el.tabSingle.addEventListener('click', () => setMode('single'));
  el.tabGeneral.addEventListener('click', () => setMode('general'));
  el.tabBatch.addEventListener('click', () => setMode('batch'));

  el.inputCrownId.addEventListener('input', () => {
    el.inputCrownId.value = sanitizeCrownId(el.inputCrownId.value);
    renderPreview();
  });
  el.inputMaterial.addEventListener('input', renderPreview);
  el.inputDentist.addEventListener('input', renderPreview);
  el.inputGeneralUrl.addEventListener('input', renderPreview);
  el.inputBatchIds.addEventListener('input', renderPreview);

  el.checkLogo.addEventListener('change', (e) => {
    state.logo = e.target.checked;
    renderPreview();
  });
  el.checkRounded.addEventListener('change', (e) => {
    state.rounded = e.target.checked;
    renderPreview();
  });

  // Format selection
  $$('.format-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.format-pill').forEach(b => b.setAttribute('aria-checked', 'false'));
      btn.setAttribute('aria-checked', 'true');
      state.format = btn.dataset.format;
      if (el.previewBadge) {
        const labels = {
          '50x30': '50 × 30 mm Standard Box Label',
          '40x40': '40 × 40 mm Square Box Label',
          'card': '85.6 × 54 mm Warranty Card',
          'qr-only': 'Standalone High-Res QR Code'
        };
        el.previewBadge.textContent = labels[state.format] || 'Packaging Label';
      }
      renderPreview();
    });
  });

  // Color selection
  $$('.color-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.color-pill').forEach(b => b.setAttribute('aria-checked', 'false'));
      btn.setAttribute('aria-checked', 'true');
      state.color = btn.dataset.color;
      renderPreview();
    });
  });

  el.btnDownloadSvg.addEventListener('click', downloadSvg);
  el.btnDownloadPng.addEventListener('click', downloadPng);
  el.btnPrint.addEventListener('click', printLabels);

  // Boot: Parse URL param ?id=...
  (function boot() {
    const params = new URLSearchParams(window.location.search);
    const idParam = sanitizeCrownId(params.get('id') || '');
    if (idParam) {
      el.inputCrownId.value = idParam;
    }
    renderPreview();
  })();
})();
