const { test } = require('node:test');
const assert = require('node:assert/strict');
const HesyraQR = require('../assets/hesyra-qr.js');

test('HesyraQR generates valid standalone SVG markup', () => {
  const url = 'https://warranty-hesyra.onrender.com/?id=ZIR-4510';
  const svg = HesyraQR.createSvg(url, { size: 400 });

  assert.ok(svg.startsWith('<svg'), 'Starts with <svg tag');
  assert.ok(svg.endsWith('</svg>'), 'Ends with </svg> tag');
  assert.ok(svg.includes('role="img"'), 'Includes accessible role="img"');
  assert.ok(svg.includes('aria-label="QR Code for ' + url + '"'), 'Includes accessible aria-label');
  assert.ok(svg.includes('id="hesyra-center-badge"'), 'Includes Hesyra center badge');
  assert.ok(svg.includes('assets/logo.png'), 'References logo image');
});

test('HesyraQR supports square module and custom color styling', () => {
  const url = 'https://warranty-hesyra.onrender.com/?id=CER-8942';
  const svg = HesyraQR.createSvg(url, {
    size: 500,
    color: '#021024',
    bgColor: '#ffffff',
    moduleStyle: 'square',
    eyeStyle: 'square',
    logo: false
  });

  assert.ok(svg.includes('fill="#021024"'), 'Uses custom dark color');
  assert.ok(!svg.includes('id="hesyra-center-badge"'), 'Omits center badge when logo is false');
  assert.ok(svg.includes('<rect'), 'Renders square rect modules');
});

test('HesyraQR encodes general website URL without query params', () => {
  const url = 'https://warranty-hesyra.onrender.com/';
  const svg = HesyraQR.createSvg(url);
  assert.ok(svg.includes('aria-label="QR Code for ' + url + '"'));
});
