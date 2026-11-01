/**
 * Hesyra Labs — Custom Branded QR Code Engine (v2.2.0)
 *
 * Generates ISO/IEC 18004 compliant QR codes with Level 'H' (High 30%) error correction,
 * Hesyra brand navy palette (#052659), custom-styled finder eyes, rounded data modules,
 * and an embedded Hesyra Labs center insignia.
 *
 * Zero external network calls. Standalone & works in both Browser and Node.
 */
(function (global) {
  'use strict';

  const DEFAULT_OPTIONS = {
    size: 400,
    margin: 3,
    color: '#052659',
    bgColor: '#ffffff',
    logo: true,
    logoUrl: 'assets/logo.png',
    logoRatio: 0.22,
    moduleStyle: 'rounded', // 'rounded' | 'square'
    eyeStyle: 'rounded'     // 'rounded' | 'square'
  };

  function getQrEngine() {
    if (typeof qrcode === 'function') return qrcode;
    if (typeof require === 'function') {
      try { return require('./qrcode.js'); } catch (e) { /* ignore */ }
    }
    throw new Error('QR code generator library (qrcode.js) is not loaded.');
  }

  /**
   * Generates a Hesyra-branded SVG string.
   */
  function createSvg(text, opts = {}) {
    const o = Object.assign({}, DEFAULT_OPTIONS, opts);
    const qrcodeFn = getQrEngine();

    // Type 0 = auto-select smallest valid version (1-40), Level H = 30% error correction
    const qr = qrcodeFn(0, 'H');
    qr.addData(text);
    qr.make();

    const count = qr.getModuleCount();
    const totalModules = count + o.margin * 2;
    const moduleSize = o.size / totalModules;
    const marginPx = o.margin * moduleSize;

    const centerMod = (count - 1) / 2;
    const centerRadiusMod = (count * o.logoRatio) / 2;

    function isFinder(r, c) {
      if (r < 7 && c < 7) return true;
      if (r < 7 && c >= count - 7) return true;
      if (r >= count - 7 && c < 7) return true;
      return false;
    }

    function isCenter(r, c) {
      if (!o.logo) return false;
      const dr = r - centerMod;
      const dc = c - centerMod;
      return (dr * dr + dc * dc) <= (centerRadiusMod * centerRadiusMod * 1.15);
    }

    const svg = [];
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${o.size} ${o.size}" width="${o.size}" height="${o.size}" role="img" aria-label="QR Code for ${escapeXml(text)}">`);
    
    // Background
    if (o.bgColor && o.bgColor !== 'transparent') {
      svg.push(`<rect width="100%" height="100%" fill="${o.bgColor}"/>`);
    }

    // 3 Finder Eyes (Top-Left, Top-Right, Bottom-Left)
    const eyes = [
      { r: 0, c: 0 },
      { r: 0, c: count - 7 },
      { r: count - 7, c: 0 }
    ];

    eyes.forEach(eye => {
      const ex = marginPx + eye.c * moduleSize;
      const ey = marginPx + eye.r * moduleSize;
      const outerSize = 7 * moduleSize;
      const innerSize = 3 * moduleSize;

      if (o.eyeStyle === 'rounded') {
        const outerRx = moduleSize * 1.8;
        const innerRx = moduleSize * 1.0;
        // Outer dark ring
        svg.push(`<rect x="${ex.toFixed(2)}" y="${ey.toFixed(2)}" width="${outerSize.toFixed(2)}" height="${outerSize.toFixed(2)}" rx="${outerRx.toFixed(2)}" fill="${o.color}"/>`);
        // Inner background spacer
        svg.push(`<rect x="${(ex + moduleSize).toFixed(2)}" y="${(ey + moduleSize).toFixed(2)}" width="${(5 * moduleSize).toFixed(2)}" height="${(5 * moduleSize).toFixed(2)}" rx="${(outerRx * 0.7).toFixed(2)}" fill="${o.bgColor || '#ffffff'}"/>`);
        // Inner dark dot
        svg.push(`<rect x="${(ex + 2 * moduleSize).toFixed(2)}" y="${(ey + 2 * moduleSize).toFixed(2)}" width="${innerSize.toFixed(2)}" height="${innerSize.toFixed(2)}" rx="${innerRx.toFixed(2)}" fill="${o.color}"/>`);
      } else {
        svg.push(`<rect x="${ex.toFixed(2)}" y="${ey.toFixed(2)}" width="${outerSize.toFixed(2)}" height="${outerSize.toFixed(2)}" fill="${o.color}"/>`);
        svg.push(`<rect x="${(ex + moduleSize).toFixed(2)}" y="${(ey + moduleSize).toFixed(2)}" width="${(5 * moduleSize).toFixed(2)}" height="${(5 * moduleSize).toFixed(2)}" fill="${o.bgColor || '#ffffff'}"/>`);
        svg.push(`<rect x="${(ex + 2 * moduleSize).toFixed(2)}" y="${(ey + 2 * moduleSize).toFixed(2)}" width="${innerSize.toFixed(2)}" height="${innerSize.toFixed(2)}" fill="${o.color}"/>`);
      }
    });

    // Body Modules
    const modRadius = moduleSize * 0.40;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!qr.isDark(r, c)) continue;
        if (isFinder(r, c)) continue;
        if (isCenter(r, c)) continue;

        const mx = marginPx + c * moduleSize;
        const my = marginPx + r * moduleSize;

        if (o.moduleStyle === 'rounded') {
          svg.push(`<circle cx="${(mx + moduleSize / 2).toFixed(2)}" cy="${(my + moduleSize / 2).toFixed(2)}" r="${modRadius.toFixed(2)}" fill="${o.color}"/>`);
        } else {
          svg.push(`<rect x="${mx.toFixed(2)}" y="${my.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" fill="${o.color}"/>`);
        }
      }
    }

    // Center Logo Badge
    if (o.logo) {
      const badgeSize = o.size * o.logoRatio;
      const bx = (o.size - badgeSize) / 2;
      const by = (o.size - badgeSize) / 2;
      const brx = badgeSize * 0.28;

      svg.push(`<g id="hesyra-center-badge">`);
      svg.push(`<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${badgeSize.toFixed(2)}" height="${badgeSize.toFixed(2)}" rx="${brx.toFixed(2)}" fill="#ffffff" stroke="#C1E8FF" stroke-width="2"/>`);
      const imgPadding = badgeSize * 0.14;
      const imgSize = badgeSize - imgPadding * 2;
      svg.push(`<image href="${escapeXml(o.logoUrl)}" x="${(bx + imgPadding).toFixed(2)}" y="${(by + imgPadding).toFixed(2)}" width="${imgSize.toFixed(2)}" height="${imgSize.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`);
      svg.push(`</g>`);
    }

    svg.push(`</svg>`);
    return svg.join('');
  }

  /**
   * Helper to draw rounded rectangle on Canvas 2D Context.
   */
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Renders the branded QR code to an HTML Canvas (e.g. for high-res PNG export).
   */
  function drawToCanvas(canvas, text, opts = {}) {
    return new Promise((resolve, reject) => {
      const o = Object.assign({}, DEFAULT_OPTIONS, opts);
      const qrcodeFn = getQrEngine();

      const qr = qrcodeFn(0, 'H');
      qr.addData(text);
      qr.make();

      const count = qr.getModuleCount();
      const totalModules = count + o.margin * 2;
      const moduleSize = o.size / totalModules;
      const marginPx = o.margin * moduleSize;

      canvas.width = o.size;
      canvas.height = o.size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

      // Background
      if (o.bgColor && o.bgColor !== 'transparent') {
        ctx.fillStyle = o.bgColor;
        ctx.fillRect(0, 0, o.size, o.size);
      } else {
        ctx.clearRect(0, 0, o.size, o.size);
      }

      const centerMod = (count - 1) / 2;
      const centerRadiusMod = (count * o.logoRatio) / 2;

      function isFinder(r, c) {
        if (r < 7 && c < 7) return true;
        if (r < 7 && c >= count - 7) return true;
        if (r >= count - 7 && c < 7) return true;
        return false;
      }

      function isCenter(r, c) {
        if (!o.logo) return false;
        const dr = r - centerMod;
        const dc = c - centerMod;
        return (dr * dr + dc * dc) <= (centerRadiusMod * centerRadiusMod * 1.15);
      }

      // Draw 3 Finder Eyes
      const eyes = [
        { r: 0, c: 0 },
        { r: 0, c: count - 7 },
        { r: count - 7, c: 0 }
      ];

      eyes.forEach(eye => {
        const ex = marginPx + eye.c * moduleSize;
        const ey = marginPx + eye.r * moduleSize;
        const outerSize = 7 * moduleSize;
        const innerSize = 3 * moduleSize;

        if (o.eyeStyle === 'rounded') {
          const outerRx = moduleSize * 1.8;
          const innerRx = moduleSize * 1.0;
          ctx.fillStyle = o.color;
          roundRect(ctx, ex, ey, outerSize, outerSize, outerRx);
          ctx.fill();

          ctx.fillStyle = o.bgColor || '#ffffff';
          roundRect(ctx, ex + moduleSize, ey + moduleSize, 5 * moduleSize, 5 * moduleSize, outerRx * 0.7);
          ctx.fill();

          ctx.fillStyle = o.color;
          roundRect(ctx, ex + 2 * moduleSize, ey + 2 * moduleSize, innerSize, innerSize, innerRx);
          ctx.fill();
        } else {
          ctx.fillStyle = o.color;
          ctx.fillRect(ex, ey, outerSize, outerSize);
          ctx.fillStyle = o.bgColor || '#ffffff';
          ctx.fillRect(ex + moduleSize, ey + moduleSize, 5 * moduleSize, 5 * moduleSize);
          ctx.fillStyle = o.color;
          ctx.fillRect(ex + 2 * moduleSize, ey + 2 * moduleSize, innerSize, innerSize);
        }
      });

      // Draw Body Modules
      const modRadius = moduleSize * 0.40;
      ctx.fillStyle = o.color;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (!qr.isDark(r, c)) continue;
          if (isFinder(r, c)) continue;
          if (isCenter(r, c)) continue;

          const mx = marginPx + c * moduleSize;
          const my = marginPx + r * moduleSize;

          if (o.moduleStyle === 'rounded') {
            ctx.beginPath();
            ctx.arc(mx + moduleSize / 2, my + moduleSize / 2, modRadius, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(mx, my, moduleSize, moduleSize);
          }
        }
      }

      // Draw Center Logo Badge
      if (!o.logo) {
        return resolve(canvas);
      }

      const badgeSize = o.size * o.logoRatio;
      const bx = (o.size - badgeSize) / 2;
      const by = (o.size - badgeSize) / 2;
      const brx = badgeSize * 0.28;

      // Protective white badge
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#C1E8FF';
      ctx.lineWidth = Math.max(2, o.size * 0.005);
      roundRect(ctx, bx, by, badgeSize, badgeSize, brx);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Render Logo Image
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.onload = function () {
        const imgPadding = badgeSize * 0.14;
        const imgSize = badgeSize - imgPadding * 2;
        ctx.drawImage(logoImg, bx + imgPadding, by + imgPadding, imgSize, imgSize);
        resolve(canvas);
      };
      logoImg.onerror = function () {
        // If image fails to load, badge is still intact
        resolve(canvas);
      };
      logoImg.src = o.logoUrl;
    });
  }

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function downloadSvg(svgString, filename = 'hesyra-qr.svg') {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  function downloadPng(canvas, filename = 'hesyra-qr.png') {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 150);
  }

  const HesyraQR = {
    DEFAULT_OPTIONS,
    createSvg,
    drawToCanvas,
    downloadSvg,
    downloadPng
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HesyraQR;
  } else {
    global.HesyraQR = HesyraQR;
  }
})(typeof window !== 'undefined' ? window : this);

