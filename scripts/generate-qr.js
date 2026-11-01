const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const qrcode = require('../assets/qrcode.js');

const TARGET_URL = 'https://warranty-hesyra.onrender.com/';
const LOGO_BUF = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.png'));
const LOGO_B64 = 'data:image/png;base64,' + LOGO_BUF.toString('base64');

function createSvg(text, options = {}) {
  const {
    size = 1200,
    margin = 3,
    color = '#052659',
    bgColor = '#ffffff',
    logo = true,
    logoRatio = 0.22,
    moduleStyle = 'rounded'
  } = options;

  const qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const totalModules = count + margin * 2;
  const moduleSize = size / totalModules;
  const marginPx = margin * moduleSize;

  const centerMod = (count - 1) / 2;
  const centerRadiusMod = (count * logoRatio) / 2;

  function isFinder(r, c) {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= count - 7) return true;
    if (r >= count - 7 && c < 7) return true;
    return false;
  }

  function isCenter(r, c) {
    if (!logo) return false;
    const dr = r - centerMod;
    const dc = c - centerMod;
    return (dr * dr + dc * dc) <= (centerRadiusMod * centerRadiusMod * 1.15);
  }

  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Hesyra Labs Dental Warranty QR Code">`);
  
  if (bgColor && bgColor !== 'transparent') {
    svg.push(`<rect width="100%" height="100%" fill="${bgColor}"/>`);
  }

  // 3 Custom Finder Eyes
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
    const outerRx = moduleSize * 1.8;
    const innerRx = moduleSize * 1.0;

    svg.push(`<rect x="${ex.toFixed(2)}" y="${ey.toFixed(2)}" width="${outerSize.toFixed(2)}" height="${outerSize.toFixed(2)}" rx="${outerRx.toFixed(2)}" fill="${color}"/>`);
    svg.push(`<rect x="${(ex + moduleSize).toFixed(2)}" y="${(ey + moduleSize).toFixed(2)}" width="${(5 * moduleSize).toFixed(2)}" height="${(5 * moduleSize).toFixed(2)}" rx="${(outerRx * 0.7).toFixed(2)}" fill="${bgColor || '#ffffff'}"/>`);
    svg.push(`<rect x="${(ex + 2 * moduleSize).toFixed(2)}" y="${(ey + 2 * moduleSize).toFixed(2)}" width="${innerSize.toFixed(2)}" height="${innerSize.toFixed(2)}" rx="${innerRx.toFixed(2)}" fill="${color}"/>`);
  });

  // Body Data Modules
  const modRadius = moduleSize * 0.40;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      if (isFinder(r, c)) continue;
      if (isCenter(r, c)) continue;

      const mx = marginPx + c * moduleSize;
      const my = marginPx + r * moduleSize;

      if (moduleStyle === 'rounded') {
        svg.push(`<circle cx="${(mx + moduleSize / 2).toFixed(2)}" cy="${(my + moduleSize / 2).toFixed(2)}" r="${modRadius.toFixed(2)}" fill="${color}"/>`);
      } else {
        svg.push(`<rect x="${mx.toFixed(2)}" y="${my.toFixed(2)}" width="${moduleSize.toFixed(2)}" height="${moduleSize.toFixed(2)}" fill="${color}"/>`);
      }
    }
  }

  // Center Logo Badge
  if (logo) {
    const badgeSize = size * logoRatio;
    const bx = (size - badgeSize) / 2;
    const by = (size - badgeSize) / 2;
    const brx = badgeSize * 0.28;

    svg.push(`<g id="hesyra-center-badge">`);
    svg.push(`<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${badgeSize.toFixed(2)}" height="${badgeSize.toFixed(2)}" rx="${brx.toFixed(2)}" fill="#ffffff" stroke="${color === '#000000' ? '#000000' : '#C1E8FF'}" stroke-width="${Math.max(2, size * 0.005).toFixed(2)}"/>`);
    const imgPadding = badgeSize * 0.14;
    const imgSize = badgeSize - imgPadding * 2;
    svg.push(`<image href="${LOGO_B64}" x="${(bx + imgPadding).toFixed(2)}" y="${(by + imgPadding).toFixed(2)}" width="${imgSize.toFixed(2)}" height="${imgSize.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`);
    svg.push(`</g>`);
  }

  svg.push(`</svg>`);
  return svg.join('');
}

async function renderPngFromSvg(svgContent, outputPath, pixelSize = 2400) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({
    viewport: { width: pixelSize, height: pixelSize },
    deviceScaleFactor: 1
  });

  const html = `<!DOCTYPE html><html><head><style>body { margin: 0; padding: 0; background: transparent; overflow: hidden; }</style></head><body>${svgContent}</body></html>`;
  await page.setContent(html);
  await page.screenshot({ path: outputPath, omitBackground: false });
  await browser.close();
  console.log(`Rendered PNG (${pixelSize}x${pixelSize}): ${outputPath}`);
}

async function main() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const artifactDir = 'C:\\Users\\admin\\.gemini\\antigravity\\brain\\5a105e8d-85d8-4ca6-83fe-2b761915eedc';

  // 1. Signature Navy Variant (#052659)
  const navySvg = createSvg(TARGET_URL, { color: '#052659', size: 1200, moduleStyle: 'rounded' });
  const navySvgPath = path.join(assetsDir, 'hesyra-warranty-qr.svg');
  fs.writeFileSync(navySvgPath, navySvg, 'utf8');
  console.log('Saved:', navySvgPath);

  const navyPngPath = path.join(assetsDir, 'hesyra-warranty-qr.png');
  await renderPngFromSvg(navySvg, navyPngPath, 2400);

  // 2. Monochrome Thermal Printer Variant (Pure Black #000000 for 60:40mm thermal rolls)
  const thermalSvg = createSvg(TARGET_URL, { color: '#000000', size: 1200, moduleStyle: 'rounded' });
  const thermalSvgPath = path.join(assetsDir, 'hesyra-warranty-qr-thermal.svg');
  fs.writeFileSync(thermalSvgPath, thermalSvg, 'utf8');
  console.log('Saved:', thermalSvgPath);

  const thermalPngPath = path.join(assetsDir, 'hesyra-warranty-qr-thermal.png');
  await renderPngFromSvg(thermalSvg, thermalPngPath, 2400);

  // Copy to Artifact Directory for user instant download & view
  if (fs.existsSync(artifactDir)) {
    fs.copyFileSync(navyPngPath, path.join(artifactDir, 'hesyra-warranty-qr.png'));
    fs.copyFileSync(navySvgPath, path.join(artifactDir, 'hesyra-warranty-qr.svg'));
    fs.copyFileSync(thermalPngPath, path.join(artifactDir, 'hesyra-warranty-qr-thermal.png'));
    fs.copyFileSync(thermalSvgPath, path.join(artifactDir, 'hesyra-warranty-qr-thermal.svg'));
    console.log('Copied assets to conversation artifact directory');
  }

  console.log('All QR code master assets generated successfully!');
}

main().catch(err => {
  console.error('QR generation failed:', err);
  process.exit(1);
});
