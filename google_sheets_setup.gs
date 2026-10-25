/**
 * ============================================================================
 * HESYRA LABS — COMPLETE MASTER WARRANTY ENGINE (v5.0 PRODUCTION)
 * ============================================================================
 * 
 * ARCHITECTURE:
 * - Single Unified Master Sheet: "WarrantyMaster"
 * - Ops Software Integration: Dedicated columns for dispatch status, dispatch date
 *   (Warranty Start), delivery date, and auto-computed Warranty Expiry Date.
 * - Patient Self-Registration: Fills patient name, phone lock, email, registration
 *   timestamp, T&C/third-party consent, and background IP location (City, Region,
 *   Country, IP address).
 * - Anti-Fraud Authentication: Locks registered phone number to the Case ID. Mismatched
 *   phone on check-in is strictly blocked.
 * - Native Google Sheets Search & Filters: Pre-configured filter on row 1, frozen
 *   headers and frozen Case ID column for effortless searching and sorting.
 * 
 * 24-COLUMN MASTER SCHEMA:
 * [1]  Case ID                     [13] Lab Job / Serial Ref
 * [2]  Dispatch Status             [14] Ops Quality Notes
 * [3]  Dispatch Date (Start)       [15] Patient Name
 * [4]  Warranty Period (Years)     [16] Registered Phone (Locked)
 * [5]  Warranty Expiry Date (Final)[17] Registered Email
 * [6]  Delivery Date               [18] Registration Timestamp
 * [7]  Prosthesis Material         [19] Patient Address (City from IP)
 * [8]  Material Tier               [20] Patient Region / State (from IP)
 * [9]  Tooth Number(s)             [21] Patient Country (from IP)
 * [10] Shade                       [22] Patient IP Address
 * [11] Clinic Name                 [23] T&C & Consent Status
 * [12] Doctor / Dentist Name       [24] Last Check-In Timestamp
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open your Google Sheet > Extensions > Apps Script.
 * 2. Replace all existing code with this entire file and press Ctrl + S (Save).
 * 3. Run "setupMasterSheet" once from the toolbar to generate the formatted sheet,
 *    or simply deploy and make any request—the script will auto-initialize!
 * 4. Click "Deploy" > "Manage deployments" > Edit (pencil) > New version > "Deploy".
 *    (Ensure: Execute as "Me", Access: "Anyone").
 * ============================================================================
 */

var SHEET_NAME = "WarrantyMaster";

// ----------------------------------------------------------------------------
// 1. WEB APP GET ROUTER (CORS-Friendly & Zero-Server Direct)
// ----------------------------------------------------------------------------
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = (params.action || "ping").toLowerCase();
    var id = cleanId(params.id || params.caseId || "");
    var phone = cleanPhone(params.phone || "");

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrInitMasterSheet(ss);

    // 1. PING & STATUS
    if (action === "ping") {
      return jsonResponse({
        status: "active",
        message: "Hesyra Master Warranty API Online",
        sheet: sheet.getName(),
        totalCases: Math.max(0, sheet.getLastRow() - 1),
        timestamp: new Date().toISOString()
      });
    }

    // 2. FORCE SETUP / REBUILD MASTER REGISTRY
    if (action === "setup") {
      setupMasterSheet(ss);
      return jsonResponse({
        success: true,
        message: "WarrantyMaster sheet successfully initialized with 24 columns, filters, and starter cases."
      });
    }

    // 3. CASE LOOKUP (Patient Scans QR / Types ID)
    if (action === "lookup") {
      if (!id) {
        return jsonResponse({ success: false, error: "Case ID is required for lookup." });
      }

      var rowMatch = findRowByCaseId(sheet, id);
      if (!rowMatch) {
        return jsonResponse({
          success: false,
          error: "Case ID (" + id + ") not found in laboratory records. Please check the label on your box."
        });
      }

      var c = formatCrownFromRow(rowMatch.values, rowMatch.rowIndex);
      var isReg = cleanPhone(c.phone).length > 0;

      if (isReg) {
        return jsonResponse({
          success: true,
          isRegistered: true,
          caseId: c.crownId,
          patientName: c.patient,
          clinic: c.clinic,
          doctor: c.dentist,
          material: c.product,
          materialFull: c.materialFull,
          maskedPhone: maskPhoneNumber(c.phone),
          dispatchStatus: c.dispatchStatus,
          dispatchDate: c.dispatchDate,
          expiryDate: c.expiryDate,
          crown: c
        });
      } else {
        return jsonResponse({
          success: true,
          isRegistered: false,
          crown: c
        });
      }
    }

    // 4. VERIFY LOGIN / CHECK-IN (Strict Anti-Fraud Phone Authentication)
    if (action === "verify_login") {
      if (!id) {
        return jsonResponse({ success: false, error: "Case ID is required." });
      }
      if (!phone) {
        return jsonResponse({ success: false, error: "Registered phone number is required." });
      }

      var rowMatch = findRowByCaseId(sheet, id);
      if (!rowMatch) {
        return jsonResponse({ success: false, error: "Case ID not found in laboratory records." });
      }

      var c = formatCrownFromRow(rowMatch.values, rowMatch.rowIndex);
      var registeredPhone = cleanPhone(c.phone);

      if (!registeredPhone) {
        return jsonResponse({
          success: false,
          needsRegistration: true,
          error: "This case has not been registered yet. Please register your crown first."
        });
      }

      // Strict phone authentication: compare last 10 digits
      if (phonesMatch(phone, registeredPhone)) {
        // Record last check-in timestamp in Column 24
        var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd HH:mm:ss");
        sheet.getRange(rowMatch.rowIndex, 24).setValue(nowStr);
        c.lastLogin = nowStr;

        return jsonResponse({
          success: true,
          verified: true,
          message: "Authentication successful.",
          crown: c
        });
      } else {
        return jsonResponse({
          success: false,
          verified: false,
          error: "Authentication failed. The phone number is wrong. Please use the one you entered at the time of registration."
        });
      }
    }

    // 5. PATIENT REGISTRATION (Via GET to avoid mobile browser CORS / Redirect Drops)
    if (action === "register") {
      return executeRegistration(sheet, {
        id: id,
        patientName: params.patientName || "",
        phone: phone,
        email: params.email || "",
        consentAgreed: params.consentAgreed,
        city: params.city || params.locationCity || "Unknown",
        region: params.region || params.locationRegion || "Unknown",
        country: params.country || params.locationCountry || "Unknown",
        ip: params.ip || params.locationIp || "Unknown"
      });
    }

    // 6. OPS SOFTWARE / ERP UPDATE
    if (action === "ops_update" || action === "dispatch_update") {
      return executeOpsUpdate(sheet, params);
    }

    return jsonResponse({ success: false, error: "Unrecognized action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: "Server Exception: " + err.toString() });
  }
}

// ----------------------------------------------------------------------------
// 2. WEB APP POST ROUTER (JSON Webhooks & API Payloads)
// ----------------------------------------------------------------------------
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var data = JSON.parse(raw);
    var action = (data.action || "register").toLowerCase();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getOrInitMasterSheet(ss);

    if (action === "register") {
      return executeRegistration(sheet, {
        id: cleanId(data.id || data.caseId || data.crownId || ""),
        patientName: data.patientName || "",
        phone: cleanPhone(data.phone || data.patientPhone || ""),
        email: data.email || data.patientEmail || "",
        consentAgreed: data.consentAgreed,
        city: (data.location && data.location.city) || data.city || "Unknown",
        region: (data.location && data.location.region) || data.region || "Unknown",
        country: (data.location && data.location.country) || data.country || "Unknown",
        ip: (data.location && data.location.ip) || data.ip || "Unknown"
      });
    }

    if (action === "ops_update" || action === "dispatch_update") {
      return executeOpsUpdate(sheet, data);
    }

    if (action === "verify_login") {
      var id = cleanId(data.id || data.caseId || "");
      var phone = cleanPhone(data.phone || "");
      var rowMatch = findRowByCaseId(sheet, id);
      if (!rowMatch) return jsonResponse({ success: false, error: "Case ID not found." });

      var c = formatCrownFromRow(rowMatch.values, rowMatch.rowIndex);
      if (phonesMatch(phone, c.phone)) {
        var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd HH:mm:ss");
        sheet.getRange(rowMatch.rowIndex, 24).setValue(nowStr);
        c.lastLogin = nowStr;
        return jsonResponse({ success: true, verified: true, crown: c });
      } else {
        return jsonResponse({
          success: false,
          verified: false,
          error: "Authentication failed. The phone number is wrong. Please use the one you entered at the time of registration."
        });
      }
    }

    return jsonResponse({ success: false, error: "Unknown POST action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: "POST Exception: " + err.toString() });
  }
}

// ----------------------------------------------------------------------------
// 3. CORE REGISTRATION HANDLER
// ----------------------------------------------------------------------------
function executeRegistration(sheet, data) {
  var id = cleanId(data.id);
  var patientName = (data.patientName || "").trim().toUpperCase();
  var phone = cleanPhone(data.phone);
  var email = (data.email || "").trim().toLowerCase();
  var consentAgreed = (data.consentAgreed === true || data.consentAgreed === "true");

  if (!id) {
    return jsonResponse({ success: false, error: "Case ID is required." });
  }
  if (!patientName) {
    return jsonResponse({ success: false, error: "Patient name is required." });
  }
  if (phone.length < 10) {
    return jsonResponse({ success: false, error: "A valid 10-digit mobile number is required." });
  }
  if (!consentAgreed) {
    return jsonResponse({ success: false, error: "Patient must accept terms & data sharing consent." });
  }

  var rowMatch = findRowByCaseId(sheet, id);
  if (!rowMatch) {
    return jsonResponse({
      success: false,
      error: "Case ID (" + id + ") not found in laboratory records. Please check the label on your box."
    });
  }

  var currentRow = rowMatch.values;
  var existingPhone = cleanPhone(currentRow[15]); // Column 16: Registered Phone

  // Anti-Fraud check: lock phone once registered
  if (existingPhone.length > 0) {
    return jsonResponse({
      success: false,
      alreadyRegistered: true,
      error: "This crown has already been registered with a phone number. Please use the Patient Check-In tab."
    });
  }

  var now = new Date();
  var tz = Session.getScriptTimeZone() || "GMT";
  var regTimestamp = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm:ss");
  var consentText = "AGREED - v1.0 [T&C + Privacy Policy]";

  // Write Patient Details directly into Columns 15 to 24 of the Master Row
  var rowIdx = rowMatch.rowIndex;
  sheet.getRange(rowIdx, 15).setValue(patientName);            // Col 15: Patient Name
  sheet.getRange(rowIdx, 16).setValue("'" + phone);           // Col 16: Registered Phone (stored as text)
  sheet.getRange(rowIdx, 17).setValue(email);                 // Col 17: Registered Email
  sheet.getRange(rowIdx, 18).setValue(regTimestamp);          // Col 18: Registration Date
  sheet.getRange(rowIdx, 19).setValue(data.city || "Unknown"); // Col 19: Patient Address (City from IP)
  sheet.getRange(rowIdx, 20).setValue(data.region || "Unknown"); // Col 20: Patient Region / State
  sheet.getRange(rowIdx, 21).setValue(data.country || "Unknown"); // Col 21: Patient Country
  sheet.getRange(rowIdx, 22).setValue(data.ip || "Unknown");  // Col 22: Patient IP Address
  sheet.getRange(rowIdx, 23).setValue(consentText);           // Col 23: T&C Consent Status
  sheet.getRange(rowIdx, 24).setValue(regTimestamp);          // Col 24: Last Check-In Date

  // Fetch updated row and format full crown card
  var updatedRow = sheet.getRange(rowIdx, 1, 1, 24).getValues()[0];
  var crownObj = formatCrownFromRow(updatedRow, rowIdx);

  return jsonResponse({
    success: true,
    message: "Warranty activated successfully. Details recorded in Master Registry.",
    crown: crownObj
  });
}

// ----------------------------------------------------------------------------
// 4. OPS SOFTWARE / ERP INTEGRATION HANDLER
// ----------------------------------------------------------------------------
function executeOpsUpdate(sheet, payload) {
  var id = cleanId(payload.id || payload.caseId || "");
  if (!id) {
    return jsonResponse({ success: false, error: "Case ID is required for Ops update." });
  }

  var dispatchStatus = payload.dispatchStatus || payload.status || "Dispatched";
  var dispatchDate = payload.dispatchDate || payload.dispatchedAt || "";
  var deliveryDate = payload.deliveryDate || payload.deliveredAt || "";
  var warrantyYears = parseInt(payload.warrantyYears || 5, 10);
  if (isNaN(warrantyYears) || warrantyYears <= 0) warrantyYears = 5;

  // If dispatch date is provided, compute Warranty Expiry Date
  var expiryDate = payload.expiryDate || "";
  if (dispatchDate && !expiryDate) {
    expiryDate = computeExpiryDate(dispatchDate, warrantyYears);
  }

  var rowMatch = findRowByCaseId(sheet, id);
  var rowIdx;

  if (rowMatch) {
    // Update existing row
    rowIdx = rowMatch.rowIndex;
    if (dispatchStatus) sheet.getRange(rowIdx, 2).setValue(dispatchStatus);
    if (dispatchDate)   sheet.getRange(rowIdx, 3).setValue(dispatchDate);
    if (warrantyYears)  sheet.getRange(rowIdx, 4).setValue(warrantyYears);
    if (expiryDate)    sheet.getRange(rowIdx, 5).setValue(expiryDate);
    if (deliveryDate)  sheet.getRange(rowIdx, 6).setValue(deliveryDate);

    // Optional metadata updates from Ops
    if (payload.material)  sheet.getRange(rowIdx, 7).setValue(payload.material);
    if (payload.tier)      sheet.getRange(rowIdx, 8).setValue(payload.tier);
    if (payload.tooth)     sheet.getRange(rowIdx, 9).setValue(payload.tooth);
    if (payload.shade)     sheet.getRange(rowIdx, 10).setValue(payload.shade);
    if (payload.clinic)    sheet.getRange(rowIdx, 11).setValue(payload.clinic);
    if (payload.doctor)    sheet.getRange(rowIdx, 12).setValue(payload.doctor);
    if (payload.jobRef)    sheet.getRange(rowIdx, 13).setValue(payload.jobRef);
    if (payload.notes)     sheet.getRange(rowIdx, 14).setValue(payload.notes);
  } else {
    // Append new prosthesis row dispatched from laboratory
    var newRow = [
      id,                                                 // [1] Case ID
      dispatchStatus,                                     // [2] Dispatch Status
      dispatchDate,                                       // [3] Dispatch Date (Warranty Start)
      warrantyYears,                                      // [4] Warranty Years
      expiryDate,                                         // [5] Warranty Expiry Date
      deliveryDate,                                       // [6] Delivery Date
      payload.material || "Zirconia Crown",               // [7] Material
      payload.tier || "Multi-Layer 3D Pro",               // [8] Material Tier
      payload.tooth || "16, 17",                          // [9] Tooth Number
      payload.shade || "A2",                              // [10] Shade
      payload.clinic || "Smile Studio Dental Care",       // [11] Clinic Name
      payload.doctor || "Dr Aarav Deshmukh",              // [12] Doctor Name
      payload.jobRef || ("JOB-" + id.replace(/\D/g, "")), // [13] Job Ref
      payload.notes || "Dispatched via Ops Software",     // [14] Ops Notes
      "", "", "", "", "", "", "", "", "", ""             // [15-24] Unregistered patient slots
    ];
    sheet.appendRow(newRow);
    rowIdx = sheet.getLastRow();
  }

  var updatedRow = sheet.getRange(rowIdx, 1, 1, 24).getValues()[0];
  var crownObj = formatCrownFromRow(updatedRow, rowIdx);

  return jsonResponse({
    success: true,
    message: "Ops software successfully updated case " + id,
    crown: crownObj
  });
}

// ----------------------------------------------------------------------------
// 5. MASTER SHEET INITIALIZER & BUILDER
// ----------------------------------------------------------------------------
function setupMasterSheet(targetSpreadsheet) {
  var ss = targetSpreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME, 0);
  }

  // Remove existing filter if present
  var existingFilter = sheet.getFilter();
  if (existingFilter) {
    existingFilter.remove();
  }

  // Define 24-Column Headers
  var headers = [
    // --- OPS & LABORATORY PRODUCTION (Columns 1-14) ---
    "Case ID",
    "Dispatch Status",
    "Dispatch Date (Warranty Start)",
    "Warranty Period (Years)",
    "Warranty Expiry Date (Final)",
    "Delivery Date",
    "Material",
    "Material Tier",
    "Tooth Number(s)",
    "Shade",
    "Clinic Name",
    "Doctor Name",
    "Lab Job Ref / Serial",
    "Ops Quality Notes",

    // --- PATIENT SELF-REGISTRATION & GEOLOCATION (Columns 15-24) ---
    "Patient Name",
    "Registered Phone",
    "Registered Email",
    "Registration Timestamp",
    "Patient Address (City from IP)",
    "Patient Region / State",
    "Patient Country",
    "Patient IP Address",
    "T&C & Consent Status",
    "Last Check-In Date"
  ];

  // Set Row 1 Headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Style Ops Headers (Columns 1-14: Dark Navy #052659)
  var opsHeaderRange = sheet.getRange(1, 1, 1, 14);
  opsHeaderRange.setBackground("#052659");
  opsHeaderRange.setFontColor("#FFFFFF");
  opsHeaderRange.setFontWeight("bold");
  opsHeaderRange.setFontSize(10);
  opsHeaderRange.setHorizontalAlignment("center");

  // Style Patient Headers (Columns 15-24: Emerald Teal #0D5C75)
  var patientHeaderRange = sheet.getRange(1, 15, 1, 10);
  patientHeaderRange.setBackground("#0D5C75");
  patientHeaderRange.setFontColor("#FFFFFF");
  patientHeaderRange.setFontWeight("bold");
  patientHeaderRange.setFontSize(10);
  patientHeaderRange.setHorizontalAlignment("center");

  sheet.setRowHeight(1, 38);

  // Freeze Header Row & Case ID Column
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Pre-populate Standard Starter Cases if Sheet is brand new
  if (sheet.getLastRow() <= 1) {
    var starterRows = [
      [
        "ZIR-4510",
        "Dispatched",
        "2026-08-19",
        5,
        "2031-08-19",
        "2026-08-21",
        "Zirconia Crown",
        "Multi-Layer 3D Pro",
        "16, 17",
        "A2",
        "Smile Studio Dental Care, Nagpur",
        "Dr Aarav Deshmukh",
        "JOB-1042",
        "Batch-A8 · Precision Sintered · Passed QA",
        "", "", "", "", "", "", "", "", "", ""
      ],
      [
        "CER-8942",
        "Delivered",
        "2026-10-15",
        5,
        "2031-10-15",
        "2026-10-17",
        "Ceramic Crown",
        "Ceramic-Hybrid Prime",
        "19 (Molar)",
        "B1",
        "Apex Dental Care, Mumbai",
        "Dr Sarah Jenkins",
        "JOB-1088",
        "Glazed Finish · Delivered to Clinic",
        "JANE DOE",
        "'9822012345",
        "jane.doe@example.com",
        "2026-10-15 11:30:00",
        "Mumbai",
        "Maharashtra",
        "India",
        "203.0.113.19",
        "AGREED - v1.0 [T&C + Privacy Policy]",
        "2026-10-25 14:10:00"
      ],
      [
        "EMX-1001",
        "Dispatched",
        "2026-10-01",
        5,
        "2031-10-01",
        "2026-10-03",
        "E.max Crown",
        "Lithium Disilicate",
        "8 (Central Incisor)",
        "BL2",
        "Prime Aesthetics Lab, Delhi",
        "Dr Arthur Miller",
        "JOB-1102",
        "High Translucency · Dispatched via Express",
        "", "", "", "", "", "", "", "", "", ""
      ],
      [
        "CER-1001",
        "In Production",
        "",
        5,
        "",
        "",
        "Ceramic Crown",
        "Ceramic-Hybrid Prime",
        "14 (Premolar)",
        "A1",
        "Summit Dental Group, Bangalore",
        "Dr Lisa Ray",
        "JOB-1090",
        "Milling stage · Awaiting final firing",
        "", "", "", "", "", "", "", "", "", ""
      ]
    ];

    sheet.getRange(2, 1, starterRows.length, 24).setValues(starterRows);
  }

  // Create Native Filter on Entire Data Range
  var maxRows = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(1, 1, maxRows, 24).createFilter();

  // Set Column Formats & Alignments
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat("@").setHorizontalAlignment("center");  // Case ID
  sheet.getRange(2, 2, maxRows - 1, 1).setHorizontalAlignment("center");                        // Status
  sheet.getRange(2, 3, maxRows - 1, 4).setHorizontalAlignment("center");                        // Dates
  sheet.getRange(2, 16, maxRows - 1, 1).setNumberFormat("@").setHorizontalAlignment("center"); // Phone text
  sheet.getRange(2, 18, maxRows - 1, 1).setHorizontalAlignment("center");                       // Reg Timestamp
  sheet.getRange(2, 22, maxRows - 1, 1).setHorizontalAlignment("center");                       // IP
  sheet.getRange(2, 24, maxRows - 1, 1).setHorizontalAlignment("center");                       // Last Check-In

  // Set Proportional Column Widths
  var widths = [
    110, // 1. Case ID
    130, // 2. Dispatch Status
    150, // 3. Dispatch Date
    120, // 4. Warranty Years
    150, // 5. Warranty Expiry
    130, // 6. Delivery Date
    140, // 7. Material
    150, // 8. Material Tier
    120, // 9. Tooth Number
    80,  // 10. Shade
    210, // 11. Clinic Name
    160, // 12. Doctor Name
    140, // 13. Lab Job Ref
    220, // 14. Ops Notes
    160, // 15. Patient Name
    140, // 16. Registered Phone
    190, // 17. Registered Email
    160, // 18. Reg Timestamp
    130, // 19. City
    130, // 20. Region
    110, // 21. Country
    130, // 22. IP Address
    220, // 23. Consent Status
    160  // 24. Last Check-In
  ];

  for (var c = 0; c < widths.length; c++) {
    sheet.setColumnWidth(c + 1, widths[c]);
  }
}

// ----------------------------------------------------------------------------
// 6. ON-EDIT TRIGGER: AUTO-CALCULATE EXPIRY ON DIRECT SHEET EDITS
// ----------------------------------------------------------------------------
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    var row = range.getRow();
    var col = range.getColumn();
    if (row <= 1) return; // Ignore header

    // If Dispatch Date (Col 3) or Warranty Years (Col 4) is modified
    if (col === 3 || col === 4) {
      var dispatchVal = sheet.getRange(row, 3).getValue();
      var yearsVal = parseInt(sheet.getRange(row, 4).getValue() || 5, 10);
      if (dispatchVal) {
        var expStr = computeExpiryDate(dispatchVal, yearsVal);
        sheet.getRange(row, 5).setValue(expStr);
      }
    }

    // If Dispatch Status (Col 2) is changed to "Dispatched" and Dispatch Date (Col 3) is empty
    if (col === 2) {
      var statusVal = range.getValue().toString().trim();
      var currentDispatchDate = sheet.getRange(row, 3).getValue();
      if (/dispatched/i.test(statusVal) && !currentDispatchDate) {
        var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd");
        sheet.getRange(row, 3).setValue(todayStr);
        var years = parseInt(sheet.getRange(row, 4).getValue() || 5, 10);
        sheet.getRange(row, 5).setValue(computeExpiryDate(todayStr, years));
      }
    }
  } catch (err) {
    // Gracefully ignore sheet edit errors
  }
}

// ----------------------------------------------------------------------------
// 7. HELPER UTILITIES
// ----------------------------------------------------------------------------
function getOrInitMasterSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    setupMasterSheet(ss);
    sheet = ss.getSheetByName(SHEET_NAME);
  }
  return sheet;
}

function findRowByCaseId(sheet, searchId) {
  var normSearch = cleanId(searchId);
  if (!normSearch) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var data = sheet.getRange(1, 1, lastRow, 24).getValues();
  for (var i = 1; i < data.length; i++) {
    var rowId = cleanId(data[i][0]);
    if (rowId === normSearch) {
      return { rowIndex: i + 1, values: data[i] };
    }
  }
  return null;
}

function computeExpiryDate(dispatchDateInput, years) {
  try {
    var d;
    if (dispatchDateInput instanceof Date) {
      d = new Date(dispatchDateInput.getTime());
    } else {
      var s = dispatchDateInput.toString().trim();
      d = new Date(s);
      if (isNaN(d.getTime())) {
        var parts = s.split(/[-/]/);
        if (parts.length === 3) {
          d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
      }
    }

    if (!isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + (years || 5));
      return Utilities.formatDate(d, "GMT", "yyyy-MM-dd");
    }
  } catch (e) {}

  // Fallback text calculation
  var str = dispatchDateInput.toString();
  var match = str.match(/(\d{4})/);
  if (match) {
    var y = parseInt(match[1], 10) + (years || 5);
    return str.replace(match[1], y.toString());
  }
  return "";
}

function formatCrownFromRow(r, rowIdx) {
  var id = (r[0] || "").toString().trim().toUpperCase();
  var status = (r[1] || "Dispatched").toString().trim();
  var rawDispatch = r[2];
  var years = parseInt(r[3] || 5, 10);
  var rawExpiry = r[4];
  var rawDelivery = r[5];

  var mat = (r[6] || "Zirconia Crown").toString().trim();
  var tier = (r[7] || "Multi-Layer 3D Pro").toString().trim();
  var tooth = (r[8] || "16, 17").toString().trim();
  var shade = (r[9] || "A2").toString().trim();
  var clinic = (r[10] || "Smile Studio Dental Care, Nagpur").toString().trim();
  var doctor = (r[11] || "Dr Aarav Deshmukh").toString().trim();
  var serial = (r[12] || ("JOB-" + id.replace(/\D/g, ""))).toString().trim();
  var opsNotes = (r[13] || "").toString().trim();

  var patient = (r[14] || "").toString().trim().toUpperCase();
  var phone = cleanPhone(r[15]);
  var email = (r[16] || "").toString().trim();
  var regAt = (r[17] || "").toString().trim();
  var city = (r[18] || "").toString().trim();
  var region = (r[19] || "").toString().trim();
  var country = (r[20] || "").toString().trim();
  var ip = (r[21] || "").toString().trim();
  var consent = (r[22] || "").toString().trim();
  var lastLogin = (r[23] || "").toString().trim();

  // Normalize Dispatch Date (Warranty Start)
  var dispatchStr = "";
  if (rawDispatch instanceof Date) {
    dispatchStr = Utilities.formatDate(rawDispatch, "GMT", "yyyy-MM-dd");
  } else if (rawDispatch) {
    dispatchStr = rawDispatch.toString().trim();
  }

  // Normalize Expiry Date (Final Warranty Date)
  var expiryStr = "";
  if (rawExpiry instanceof Date) {
    expiryStr = Utilities.formatDate(rawExpiry, "GMT", "yyyy-MM-dd");
  } else if (rawExpiry) {
    expiryStr = rawExpiry.toString().trim();
  } else if (dispatchStr) {
    expiryStr = computeExpiryDate(dispatchStr, years);
  }

  // Normalize Delivery Date
  var deliveryStr = "";
  if (rawDelivery instanceof Date) {
    deliveryStr = Utilities.formatDate(rawDelivery, "GMT", "yyyy-MM-dd");
  } else if (rawDelivery) {
    deliveryStr = rawDelivery.toString().trim();
  }

  // Formatted human-readable dates for card front & back
  var issuedDisplay = "Pending Dispatch";
  var issuedFull = "Pending Lab Dispatch";
  var issuedYear = new Date().getFullYear().toString();
  var validThru = "Pending";
  var validUntil = "Pending Dispatch";

  if (dispatchStr) {
    var dMatch = dispatchStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dMatch) {
      var dYear = dMatch[1];
      var dMonth = parseInt(dMatch[2], 10);
      var dDay = parseInt(dMatch[3], 10);
      var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var mName = monthNames[dMonth - 1] || "Aug";

      issuedDisplay = dDay + " " + mName + " " + dYear.slice(-2);
      issuedFull = dDay + " " + mName + " " + dYear;
      issuedYear = dYear;
    } else {
      issuedDisplay = dispatchStr;
      issuedFull = dispatchStr;
    }
  }

  if (expiryStr) {
    var eMatch = expiryStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (eMatch) {
      var eYear = eMatch[1];
      var eMonth = parseInt(eMatch[2], 10);
      var eDay = parseInt(eMatch[3], 10);
      var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var mName = monthNames[eMonth - 1] || "Aug";

      validThru = (eMonth < 10 ? "0" + eMonth : eMonth) + " / " + eYear.slice(-2);
      validUntil = eDay + " " + mName + " " + eYear;
    } else {
      validThru = expiryStr;
      validUntil = expiryStr;
    }
  }

  var code = id.replace(/[^A-Z0-9]/g, "");
  var warrantyCode = "HLW " + (code.slice(0, 3) || "ZIR") + " " + (code.slice(3) || "4510") + " " + issuedYear.slice(-2) + "08";

  return {
    crownId: id,
    dispatchStatus: status,
    dispatchDate: dispatchStr,
    deliveryDate: deliveryStr,
    warrantyYears: years,
    expiryDate: expiryStr,
    product: mat,
    tier: tier,
    materialFull: mat + (tier ? " · " + tier : ""),
    tooth: tooth,
    shade: shade,
    clinic: clinic,
    dentist: doctor,
    caseRef: serial.startsWith("JOB-") ? serial : "JOB-" + serial,
    opsNotes: opsNotes,
    patient: patient || "UNREGISTERED PROSTHESIS",
    phone: phone,
    email: email,
    registeredAt: regAt,
    locationCity: city,
    locationRegion: region,
    locationCountry: country,
    locationIp: ip,
    consentAgreed: consent,
    lastLogin: lastLogin,
    issued: issuedDisplay,
    issuedFull: issuedFull,
    issuedYear: issuedYear,
    validThru: validThru,
    validUntil: validUntil,
    warrantyId: warrantyCode
  };
}

function cleanId(val) {
  return (val || "").toString().trim().toUpperCase();
}

function cleanPhone(val) {
  return (val || "").toString().replace(/\D/g, "");
}

function phonesMatch(p1, p2) {
  var s1 = cleanPhone(p1);
  var s2 = cleanPhone(p2);
  if (!s1 || !s2) return false;
  var sub1 = s1.length >= 10 ? s1.slice(-10) : s1;
  var sub2 = s2.length >= 10 ? s2.slice(-10) : s2;
  return sub1 === sub2;
}

function maskPhoneNumber(val) {
  var c = cleanPhone(val);
  if (!c) return "";
  var last4 = c.slice(-4);
  return "ending in ••••• " + last4;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
