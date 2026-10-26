// Minimal Google Apps Script emulator: runs google_sheets_setup.gs unmodified in a
// Node VM with an in-memory spreadsheet that mimics how Sheets coerces values.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'google_sheets_setup.gs');
const TZ = 'Asia/Kolkata';

function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz === 'GMT' ? 'UTC' : tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return o;
}

function formatDate(date, tz, fmt) {
  const p = zonedParts(date, tz);
  return fmt
    .replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

// Midnight (or given time) in the sheet's time zone, like a typed-in date cell.
function sheetDate(y, mo, d, h = 0, mi = 0, s = 0) {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = zonedParts(new Date(utcGuess), TZ);
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(utcGuess - (asIfUtc - utcGuess));
}

// Mirrors Sheets' auto-coercion on setValue / setValues.
function coerce(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (v.startsWith('=')) return { formula: v };
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return sheetDate(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (m) return sheetDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function readCell(v) {
  if (v === undefined || v === null) return '';
  if (v && typeof v === 'object' && 'formula' in v) return '#FORMULA_EXECUTED';
  return v;
}

class Range {
  constructor(sheet, row, col, nr, nc) {
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const line = [];
      for (let c = 0; c < this.nc; c++) line.push(readCell((this.sheet.cells[this.row - 1 + r] || [])[this.col - 1 + c]));
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    if (values.length !== this.nr || values.some((l) => l.length !== this.nc)) {
      throw new Error(`setValues dimension mismatch: range ${this.nr}x${this.nc}`);
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.write(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { this.sheet.write(this.row, this.col, v); return this; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
  getSheet() { return this.sheet; }
  createFilter() { this.sheet.filter = { remove: () => { this.sheet.filter = null; } }; return this.sheet.filter; }
}
for (const m of ['setNumberFormat', 'setBackground', 'setFontColor', 'setFontWeight', 'setFontSize', 'setHorizontalAlignment']) {
  Range.prototype[m] = function () { return this; };
}

class Sheet {
  constructor(name) { this.name = name; this.cells = []; this.filter = null; this.writes = 0; }
  write(row, col, v) {
    while (this.cells.length < row) this.cells.push([]);
    this.cells[row - 1][col - 1] = coerce(v);
    this.writes++;
  }
  getName() { return this.name; }
  getRange(row, col, nr = 1, nc = 1) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error(`Invalid range ${row},${col},${nr},${nc}`);
    return new Range(this, row, col, nr, nc);
  }
  getLastRow() {
    for (let i = this.cells.length - 1; i >= 0; i--) {
      if ((this.cells[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getMaxRows() { return Math.max(1000, this.cells.length); }
  getFilter() { return this.filter; }
  setRowHeight() {} setFrozenRows() {} setFrozenColumns() {} setColumnWidth() {}
  rows() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), 24).getValues(); }
}

function createGas() {
  const sheets = new Map();
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
    getSpreadsheetTimeZone: () => TZ
  };
  const cache = new Map();
  const props = new Map();
  const lock = { available: true, held: false };
  const logs = [];

  const ctx = {
    Date, // share the host realm so `instanceof Date` works on mock cell values
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    Session: { getScriptTimeZone: () => TZ },
    Utilities: { formatDate },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => ({ content, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; },
        put: (k, v, ttl) => cache.set(k, { v: String(v), exp: Date.now() + ttl * 1000 }),
        remove: (k) => cache.delete(k)
      })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null) }) },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (!lock.available || lock.held) return false; lock.held = true; return true; },
        releaseLock: () => { lock.held = false; }
      })
    },
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), ctx, { filename: 'google_sheets_setup.gs' });

  const api = {
    ctx, ss, cache, props, lock, logs,
    sheet: () => ss.getSheetByName('WarrantyMaster'),
    get(params) { return JSON.parse(ctx.doGet({ parameter: params }).getContent()); },
    post(body) {
      const contents = typeof body === 'string' ? body : JSON.stringify(body);
      return JSON.parse(ctx.doPost({ postData: { contents } }).getContent());
    },
    /** Replaces the registry with header + given 24-col rows (strings coerced like typed input). */
    load(rows) {
      sheets.clear();
      cache.clear();
      ctx.setupMasterSheet(ss);
      const sh = api.sheet();
      rows.forEach((r, i) => {
        const full = r.concat(Array(24 - r.length).fill(''));
        full.forEach((v, c) => sh.write(i + 2, c + 1, v));
      });
      return sh;
    },
    row(id) {
      return api.sheet().rows().find((r) => String(r[0]).toUpperCase() === id) || null;
    }
  };
  return api;
}

module.exports = { createGas, formatDate, sheetDate, TZ };
