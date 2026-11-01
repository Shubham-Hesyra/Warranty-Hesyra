const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HesyraQR = require('../assets/hesyra-qr.js');

test('HesyraQR generates valid standalone SVG markup', () => {
  const url = 'https://warranty-hesyra.onrender.com/';
  const svg = HesyraQR.createSvg(url, { size: 400 });

  assert.ok(svg.startsWith('<svg'), 'Starts with <svg tag');
  assert.ok(svg.endsWith('</svg>'), 'Ends with </svg> tag');
  assert.ok(svg.includes('role="img"'), 'Includes accessible role="img"');
  assert.ok(svg.includes('aria-label="QR Code for ' + url + '"'), 'Includes accessible aria-label');
  assert.ok(svg.includes('id="hesyra-center-badge"'), 'Includes Hesyra center badge');
});

test('Master QR assets for 60x40mm thermal rolls exist and are valid', () => {
  const assetsDir = path.join(__dirname, '..', 'assets');
  const navySvg = path.join(assetsDir, 'hesyra-warranty-qr.svg');
  const navyPng = path.join(assetsDir, 'hesyra-warranty-qr.png');
  const thermalSvg = path.join(assetsDir, 'hesyra-warranty-qr-thermal.svg');
  const thermalPng = path.join(assetsDir, 'hesyra-warranty-qr-thermal.png');

  assert.ok(fs.existsSync(navySvg), 'hesyra-warranty-qr.svg exists');
  assert.ok(fs.existsSync(navyPng), 'hesyra-warranty-qr.png exists');
  assert.ok(fs.existsSync(thermalSvg), 'hesyra-warranty-qr-thermal.svg exists');
  assert.ok(fs.existsSync(thermalPng), 'hesyra-warranty-qr-thermal.png exists');

  assert.ok(fs.statSync(navyPng).size > 50000, 'navy PNG is high resolution');
  assert.ok(fs.statSync(thermalPng).size > 50000, 'thermal PNG is high resolution');

  const thermalSvgContent = fs.readFileSync(thermalSvg, 'utf8');
  assert.ok(thermalSvgContent.includes('fill="#000000"'), 'Thermal SVG is pure monochrome black');
  assert.ok(thermalSvgContent.includes('data:image/png;base64,'), 'Embedded logo is self-contained base64');
});
