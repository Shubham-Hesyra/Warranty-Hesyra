# Hesyra Labs — Digital Dental Crown Warranty

Patients scan the QR code on their crown box (`https://<site>/?id=ZIR-4510`), register the crown with their name and mobile number, and get a 3D digital warranty card they can flip, reopen later with their phone number, and save as a CR80-sized PDF.

- **Frontend:** static site — `index.html`, `app.js`, `config.js`, `assets/`. No build step.
- **Backend:** `google_sheets_setup.gs`, a Google Apps Script web app over one Google Sheet (`WarrantyMaster`).
- **Tests:** `npm test` — backend unit tests plus browser end-to-end tests of every patient journey.

## How it works

| Step | What the patient sees | API call |
|---|---|---|
| Enter / scan Crown ID | Case details from the lab (material, clinic, dentist, dispatch date) | `GET ?action=lookup&id=` — public fields only |
| Already registered? | Switched to **Patient Check-In**, shown "Registered ending in 2345" | (same lookup) |
| Register | Name, mobile, optional email → warranty card | `POST {action:"register"}` |
| Check in later | Crown ID + registered mobile → warranty card | `POST {action:"verify_login"}` |

A card stays open for 30 minutes in the same browser tab (session storage, no phone number stored). **Sign out** clears it.

### Security model
- `lookup` never returns patient name, phone, email, IP or location — only the case details printed by the lab.
- The first registration binds a phone number to the case. It cannot be changed from the web; to re-assign a crown, clear columns 15–24 of its row in the sheet.
- Check-in locks for 15 minutes after 5 wrong phone numbers for a case.
- Personal data travels in POST bodies, never in URLs.
- Every patient-typed value is stored as literal text, so input like `=IMPORTXML(...)` can never run as a formula in the sheet.
- Registration and ops writes run under a script lock, so two people can't register one crown at the same moment.
- `ops_update` requires the `OPS_TOKEN` script property and is refused when it isn't set.
- If the registry can't be reached, the patient gets a clear error and a retry. Nothing is ever "registered" only in the browser.
- The page ships a strict Content-Security-Policy (no inline scripts; network access only to Apps Script and the IP-location service).

### Known limit
Crown IDs are short (`XXX-NNNN`). Someone who guesses the ID of a dispatched, still-unregistered crown could register it first. The real patient would then see "already registered", and the lab can fix it by clearing the patient columns. Register crowns promptly at delivery (or have the clinic do it) to keep that window small.

## Sheet schema (`WarrantyMaster`, 24 columns)

| # | Field | Owner |
|---|---|---|
| 1 | Case ID (`ZIR-4510`) | Ops |
| 2 | Dispatch Status (`In Production` / `Dispatched` / `Delivered`) | Ops |
| 3 | Dispatch Date — **warranty start** | Ops |
| 4 | Warranty Period (Years) — default 5 | Ops |
| 5 | Warranty Expiry Date — auto-computed | Auto |
| 6 | Delivery Date | Ops |
| 7–14 | Material, Material Tier, Tooth Number(s), Shade, Clinic, Doctor, Lab Job Ref, Ops Notes | Ops |
| 15–17 | Patient Name, Registered Phone, Registered Email | Patient |
| 18 | Registration Timestamp | Auto |
| 19–22 | City, Region, Country, IP (from the patient's IP) | Auto |
| 23 | Consent status + timestamp | Auto |
| 24 | Last Check-In | Auto |

A crown can only be registered once column 3 (dispatch date) is filled. Setting status to `Dispatched`/`Delivered` with no date fills in today's date. Editing columns 2–4 recomputes the expiry. Empty ops fields show as "—" on the card, so nothing is ever made up.

## Deploying

### 1. Backend (Apps Script) — deploy this first
1. Open the Google Sheet → **Extensions → Apps Script**, replace the code with `google_sheets_setup.gs`, save.
2. Run `setupMasterSheet` once from the editor toolbar (creates headers, filters, column formats; it keeps existing data).
   On a **test** sheet only, you can also run `seedDemoCases` to add sample cases.
3. If ops software will call `ops_update`: **Project Settings → Script properties → Add** `OPS_TOKEN` = a long random string.
4. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.** Keep *Execute as: Me*, *Who has access: Anyone*. The `/exec` URL does not change.
5. The `onEdit` expiry calculation runs automatically as a simple trigger.

### 2. Frontend
Put the Web App URL in `config.js` (`apiUrl`), then publish the repo root as a static site (Render / Netlify / Vercel / GitHub Pages; no build command, publish directory `./`). `tests/`, `node_modules/` and `package.json` aren't needed at runtime.

### Ops software integration
```http
POST <apiUrl>
Content-Type: text/plain;charset=utf-8

{"action":"ops_update","token":"<OPS_TOKEN>","id":"ZIR-4510",
 "dispatchStatus":"Dispatched","dispatchDate":"2026-08-19","warrantyYears":5,
 "deliveryDate":"2026-08-21","material":"Zirconia Crown","tier":"Multi-Layer 3D Pro",
 "tooth":"16, 17","shade":"A2","clinic":"Smile Studio, Nagpur","doctor":"Dr A. Deshmukh",
 "jobRef":"JOB-1042","notes":"Passed QA"}
```
Every field except `token` and `id` is optional. Dates are `YYYY-MM-DD` (or `DD/MM/YYYY`). Unknown cases are created with status `In Production`. Patient columns are never touched. The response is `{success, created, crown}` or `{success:false, code, error}`.

### Error codes
`INVALID_INPUT`, `NOT_FOUND`, `NOT_DISPATCHED`, `ALREADY_REGISTERED`, `NOT_REGISTERED`, `WRONG_PHONE` (with `attemptsLeft`), `LOCKED`, `UNAUTHORIZED`, `BUSY`, `SERVER_ERROR`.

## Development & tests
```bash
npm install
npm test               # backend unit tests + end-to-end tests
npm run test:backend   # runs google_sheets_setup.gs in a Google Apps Script emulator
npm run test:e2e       # Playwright, desktop + mobile Chrome
npm run serve          # site + emulated backend at http://localhost:4173 (try ?id=ZIR-4510)
```
The end-to-end tests run the real `.gs` file behind a local `/exec` endpoint. They cover registration, check-in, lockout, outages and timeouts, data-leak checks, formula/HTML injection, session reload and sign-out, the expired-warranty state, printing, the legal modal and mobile layout. Locally they use the installed Google Chrome; CI installs Playwright's Chromium.
