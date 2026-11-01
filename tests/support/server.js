// Local test server: serves the static site and emulates the Apps Script web
// app at /exec by running google_sheets_setup.gs in the GAS emulator.
//   /config.js          → test config pointing apiUrl at /exec
//   /__test/reset        → reload fixture registry
//   /__test/row?id=X     → dump one registry row (for assertions)
//   /__test/log          → every API request received (for assertions)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./gas');
const { fixtureRows } = require('./fixtures');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };

let gas;
let requests = [];
function reset() {
  gas = createGas();
  gas.load(fixtureRows());
  gas.props.set('OPS_TOKEN', 'test-ops-token-123');
  requests = [];
}
reset();

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/exec') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const params = Object.fromEntries(url.searchParams);
      requests.push({ method: req.method, params, body, contentType: req.headers['content-type'] || '' });
      const out = req.method === 'POST'
        ? gas.ctx.doPost({ postData: { contents: body } })
        : gas.ctx.doGet({ parameter: params });
      send(res, 200, out.getContent());
    });
    return;
  }
  if (url.pathname === '/config.js') {
    return send(res, 200, `window.HESYRA_CONFIG = Object.freeze({ apiUrl: '/exec', requestTimeoutMs: ${Number(url.searchParams.get('timeout')) || 4000}, geoLookup: true, sessionMinutes: 30 });`, TYPES['.js']);
  }
  if (url.pathname === '/__test/reset') { reset(); return send(res, 200, { ok: true }); }
  if (url.pathname === '/__test/row') {
    const row = gas.row(String(url.searchParams.get('id') || '').toUpperCase());
    return send(res, 200, { row: row && row.map((v) => (v instanceof Date ? v.toISOString() : v)) });
  }
  if (url.pathname === '/__test/log') return send(res, 200, { requests });

  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || /(^|[\\/])(tests|node_modules|\.git)([\\/]|$)/.test(path.relative(ROOT, file))) {
    return send(res, 404, 'Not found', 'text/plain');
  }
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Test server on http://localhost:${PORT}`));
