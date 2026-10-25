# Hesyra Labs — Digital Dental Crown Warranty Engine

A high-performance, zero-server digital warranty certification platform for custom dental prostheses (Zirconia, Ceramic, and Lithium Disilicate). Built for Hesyra Labs with an interactive 3D metallic certificate card, native Google Sheets master registry, anti-fraud phone verification, and ops software synchronization.

---

## 🌟 Key Features

1. **3D Gyroscopic Warranty Card**:
   - Realistic 3D card physics responding to cursor movement and device orientation (gyroscope on mobile).
   - Flip-to-back interaction revealing FDI teeth numbers, VITA shade, laboratory serial/job reference, prescribing dentist, and dispatch date.
   - High-precision PDF export formatted to standard CR80 ID-card dimensions (85.6mm × 54mm) for printing or patient archiving.

2. **Single Master Sheet Architecture (`WarrantyMaster`)**:
   - Consolidates production, lab logistics, dispatch, warranty expiration, patient registration, and IP geolocation into a single unified 24-column sheet.
   - Pre-configured native Google Sheets filter view across all 24 columns with frozen row 1 and frozen Column 1 (Case ID) for rapid sorting, search, and lab triage.

3. **Operations Software / ERP Integration**:
   - Direct columns for `Dispatch Status`, `Dispatch Date` (official Warranty Start), `Delivery Date`, and auto-computed `Warranty Expiry Date`.
   - Built-in REST/Webhook endpoint (`?action=ops_update`) allowing external lab management software (Magic Touch, Labstar, EasyRx, custom ERPs) to programmatically update dispatch states and calculate expiry dates.
   - Google Sheets `onEdit` auto-calculation: directly editing dispatch dates or periods in the sheet automatically computes the warranty expiry date.

4. **Patient Authentication & Anti-Fraud Security**:
   - Strict phone-number binding: once registered, a Case ID cannot be re-registered with another number.
   - Patient Check-In requires matching the registered phone number (last 10 digits).
   - Automatic tab selection: scanning or entering an ID instantly routes to **Patient Check-In** (if already registered) or **Register Crown** (if new).

5. **Compliant Clickwrap Legal Consent**:
   - Seamless, big-tech clickwrap agreement beneath the activation button.
   - Embedded corporate legal modal with segmented tabs for **Warranty Terms** (coverage, exclusions, claim protocols) and **Privacy Policy** (compliant with DPDP Act 2023, GDPR, and healthcare data confidentiality standards).

---

## 📋 24-Column Master Sheet Schema

| Col # | Field Name | Category | Description |
|---|---|---|---|
| **1** | `Case ID` | Ops | Unique Crown ID / QR Code Key (e.g. `ZIR-4510`) |
| **2** | `Dispatch Status` | Ops | Operational state (`Dispatched`, `Delivered`, `In Production`) |
| **3** | `Dispatch Date` | Ops | **Official Warranty Start Date** (`YYYY-MM-DD`) |
| **4** | `Warranty Period (Years)` | Ops | Duration in years (`5`, `10`, etc.) |
| **5** | `Warranty Expiry Date` | Computed | **Final Warranty Date** (`Dispatch Date + Years`) |
| **6** | `Delivery Date` | Ops | Clinic delivery date |
| **7** | `Material` | Ops | Prosthesis material (`Zirconia Crown`, `Ceramic Crown`) |
| **8** | `Material Tier` | Ops | Grade (`Multi-Layer 3D Pro`, `Ceramic-Hybrid Prime`) |
| **9** | `Tooth Number(s)` | Ops | FDI / Universal notation (`16, 17`, `19`) |
| **10** | `Shade` | Ops | VITA classical shade (`A2`, `B1`, `BL2`) |
| **11** | `Clinic Name` | Ops | Destination dental clinic |
| **12** | `Doctor Name` | Ops | Prescribing clinician |
| **13** | `Lab Job Ref / Serial` | Ops | Laboratory manufacturing serial |
| **14** | `Ops Quality Notes` | Ops | Quality control inspection / lot notes |
| **15** | `Patient Name` | Patient | Full name captured at registration |
| **16** | `Registered Phone` | Patient | Mobile number locked to case for verification |
| **17** | `Registered Email` | Patient | Optional patient email |
| **18** | `Registration Timestamp` | Auto | Date & time of registration |
| **19** | `Patient City` | Auto | City resolved from client IP |
| **20** | `Patient Region / State` | Auto | State resolved from client IP |
| **21** | `Patient Country` | Auto | Country resolved from client IP |
| **22** | `Patient IP Address` | Auto | Client public IP logged for audit trail |
| **23** | `T&C Consent Status` | Auto | `AGREED - v1.0 [T&C + Privacy Policy]` |
| **24** | `Last Check-In Date` | Auto | Timestamp of last successful login |

---

## 🚀 Deployment Guide

### A. Deploy Frontend (GitHub Pages / Render / Vercel / Netlify)
1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: complete production-ready warranty engine"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. **GitHub Pages**:
   - Go to your repository settings > **Pages**.
   - Source: `Deploy from a branch` > select `main` / `root`.
3. **Render / Vercel / Netlify**:
   - Connect repository as a Static Site.
   - Publish directory: `./` (root).
   - No build command required.

### B. Deploy Google Apps Script (Backend Database API)
1. In your Google Sheet, click **Extensions > Apps Script**.
2. Replace all code with the contents of `google_sheets_setup.gs`.
3. Press **Ctrl + S** to save.
4. Click **Deploy > Manage deployments**.
5. Click the **pencil icon (Edit)** next to your active deployment.
6. Under **Version**, select **New version**.
7. Ensure **Execute as: "Me"** and **Who has access: "Anyone"**.
8. Click **Deploy**.
9. If creating a new deployment, copy the Web App URL (ends in `/exec`) and update `GSHEET_URL` in `index.html`.
