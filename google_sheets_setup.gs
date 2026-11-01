/**
 * ============================================================================
 * HESYRA LABS — MASTER WARRANTY ENGINE (Apps Script backend, v2.0.0)
 * ============================================================================
 *
 * One sheet ("WarrantyMaster", 24 columns) is the registry. The lab / ops
 * software owns columns 1-14; patient self-registration fills columns 15-24.
 *
 * PUBLIC API (web app, "Anyone" access)
 *   GET  ?action=ping                         → health check
 *   GET  ?action=lookup&id=ZIR-4510            → public crown details only.
 *                                                Never returns patient data.
 *   POST {action:"register", id, patientName, phone, email, consentAgreed,
 *         consentVersion, location:{city,region,country,ip}}
 *   POST {action:"verify_login", id, phone}    → patient card (phone masked)
 *
 * PROTECTED API (requires the OPS_TOKEN script property)
 *   POST {action:"ops_update", token, id, dispatchStatus, dispatchDate, ...}
 *
 * Patients send POST bodies as text/plain JSON so browsers skip the CORS
 * preflight. GET "register" / "verify_login" still work for old clients.
 *
 * SECURITY MODEL
 *   - lookup never exposes name, phone, email, IP or location.
 *   - A phone number is bound to a case on first registration and cannot be
 *     changed from the web. To re-assign, clear columns 15-24 in the sheet.
 *   - Check-in is locked for 15 minutes after 5 wrong phone numbers per case.
 *   - ops_update fails closed: no OPS_TOKEN property → every call rejected.
 *   - Every patient-supplied string is written as literal text, so values like
 *     "=IMPORTXML(...)" can never run as formulas in the sheet.
 *   - Registration / ops writes run under a script lock (no double-register).
 *
 * DEPLOYMENT
 *   1. Sheet → Extensions → Apps Script → replace Code.gs with this file → Save.
 *   2. Project Settings → Script properties → add OPS_TOKEN = <long random
 *      string> (only needed if ops software calls ops_update).
 *   3. Run setupMasterSheet() once from the editor (creates headers/filters).
 *      Run seedDemoCases() only on a test sheet — it adds sample cases.
 *   4. Deploy → Manage deployments → Edit → New version → Deploy
 *      (Execute as: Me, Who has access: Anyone). The /exec URL stays the same.
 * ============================================================================
 */

var API_VERSION = "2.0.0";
var SHEET_NAME = "WarrantyMaster";
var NUM_COLS = 24;
var CONSENT_LABEL = "AGREED - v1.0 [T&C + Privacy Policy]";
var MAX_FAILED_LOGINS = 5;
var LOCKOUT_SECONDS = 15 * 60;
var DEFAULT_WARRANTY_YEARS = 5;

/**
 * Standard Hesyra laboratory warranty duration:
 * - Zirconia restorations: 7 Years
 * - Ceramic restorations (Ceramic-Hybrid, E.max, Feldspathic): 5 Years
 */
function defaultWarrantyYearsForMaterial(material) {
  var m = String(material || "").toLowerCase();
  if (m.indexOf("zirconia") !== -1 || m.indexOf("zir") !== -1) {
    return 7;
  }
  return 5;
}

// 1-based column numbers
var COL = {
  ID: 1, STATUS: 2, DISPATCH: 3, YEARS: 4, EXPIRY: 5, DELIVERY: 6,
  MATERIAL: 7, TIER: 8, TOOTH: 9, SHADE: 10, CLINIC: 11, DOCTOR: 12,
  JOB_REF: 13, NOTES: 14,
  PATIENT: 15, PHONE: 16, EMAIL: 17, REGISTERED_AT: 18, CITY: 19, REGION: 20,
  COUNTRY: 21, IP: 22, CONSENT: 23, LAST_LOGIN: 24
};

var HEADERS = [
  "Case ID", "Dispatch Status", "Dispatch Date (Warranty Start)", "Warranty Period (Years)",
  "Warranty Expiry Date (Final)", "Delivery Date", "Material", "Material Tier",
  "Tooth Number(s)", "Shade", "Clinic Name", "Doctor Name", "Lab Job Ref / Serial",
  "Ops Quality Notes",
  "Patient Name", "Registered Phone", "Registered Email", "Registration Timestamp",
  "Patient Address (City from IP)", "Patient Region / State", "Patient Country",
  "Patient IP Address", "T&C & Consent Status", "Last Check-In Date"
];

var ERR = {
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  NOT_DISPATCHED: "NOT_DISPATCHED",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  NOT_REGISTERED: "NOT_REGISTERED",
  WRONG_PHONE: "WRONG_PHONE",
  LOCKED: "LOCKED",
  UNAUTHORIZED: "UNAUTHORIZED",
  BUSY: "BUSY",
  UNKNOWN_ACTION: "UNKNOWN_ACTION",
  SERVER_ERROR: "SERVER_ERROR"
};

// ----------------------------------------------------------------------------
// 1. ROUTERS
// ----------------------------------------------------------------------------
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return route((params.action || "ping").toString().toLowerCase(), params);
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonResponse(fail(ERR.INVALID_INPUT, "Request body must be JSON."));
  }
  if (!data || typeof data !== "object") data = {};
  return route((data.action || "").toString().toLowerCase(), data);
}

function route(action, data) {
  try {
    if (action === "ping") {
      return jsonResponse({ success: true, status: "active", version: API_VERSION });
    }
    if (action === "lookup") return jsonResponse(handleLookup(data));
    if (action === "register") return jsonResponse(handleRegister(data));
    if (action === "verify_login") return jsonResponse(handleVerifyLogin(data));
    if (action === "ops_update" || action === "dispatch_update") {
      return jsonResponse(handleOpsUpdate(data));
    }
    if (action === "setup") {
      return jsonResponse(fail(ERR.UNAUTHORIZED, "Setup must be run from the Apps Script editor."));
    }
    return jsonResponse(fail(ERR.UNKNOWN_ACTION, "Unrecognized action."));
  } catch (err) {
    console.error("Warranty API error [" + action + "]: " + (err && err.stack || err));
    return jsonResponse(fail(ERR.SERVER_ERROR, "Something went wrong on our side. Please try again in a minute."));
  }
}

// ----------------------------------------------------------------------------
// 2. HANDLERS
// ----------------------------------------------------------------------------
function handleLookup(data) {
  var id = cleanId(data.id || data.caseId);
  if (!isValidCaseId(id)) {
    return fail(ERR.INVALID_INPUT, "Crown IDs look like ZIR-4510. Please check the label on your box.");
  }

  var sheet = getMasterSheet();
  var match = findRowByCaseId(sheet, id);
  if (!match) {
    return fail(ERR.NOT_FOUND, "We couldn't find crown " + id + " in our laboratory records. Please check the label on your box.");
  }

  var crown = readCrown(match.values);
  if (!crown.dispatchDate) {
    return fail(ERR.NOT_DISPATCHED, "This crown hasn't been released by the laboratory yet. Your warranty can be activated once it has been dispatched to your clinic.");
  }

  if (cleanPhone(match.values[COL.PHONE - 1])) {
    return {
      success: true,
      isRegistered: true,
      crownId: crown.crownId,
      product: crown.product,
      maskedPhone: maskPhoneNumber(match.values[COL.PHONE - 1])
    };
  }

  return { success: true, isRegistered: false, crown: publicCrown(crown) };
}

function handleRegister(data) {
  var id = cleanId(data.id || data.caseId || data.crownId);
  var patientName = cleanText(data.patientName, 80).replace(/\s+/g, " ").toUpperCase();
  var phone = cleanPhone(data.phone || data.patientPhone);
  var email = cleanText(data.email || data.patientEmail, 120).toLowerCase();
  var consentAgreed = data.consentAgreed === true || data.consentAgreed === "true";
  var loc = (data.location && typeof data.location === "object") ? data.location : data;

  if (!isValidCaseId(id)) return fail(ERR.INVALID_INPUT, "A valid Crown ID is required.");
  if (patientName.length < 2) return fail(ERR.INVALID_INPUT, "Please enter your full name.");
  if (!isValidPhone(phone)) return fail(ERR.INVALID_INPUT, "Please enter a valid mobile number (10 digits).");
  if (email && !isValidEmail(email)) return fail(ERR.INVALID_INPUT, "Please enter a valid email address, or leave it blank.");
  if (!consentAgreed) return fail(ERR.INVALID_INPUT, "You need to accept the Warranty Terms and Privacy Policy.");

  return withLock(function () {
    var sheet = getMasterSheet();
    var match = findRowByCaseId(sheet, id);
    if (!match) {
      return fail(ERR.NOT_FOUND, "We couldn't find crown " + id + " in our laboratory records.");
    }
    var crown = readCrown(match.values);
    if (!crown.dispatchDate) {
      return fail(ERR.NOT_DISPATCHED, "This crown hasn't been released by the laboratory yet.");
    }
    if (cleanPhone(match.values[COL.PHONE - 1])) {
      return {
        success: false,
        code: ERR.ALREADY_REGISTERED,
        alreadyRegistered: true,
        maskedPhone: maskPhoneNumber(match.values[COL.PHONE - 1]),
        error: "This crown is already registered. Please use Patient Check-In with the phone number you registered."
      };
    }

    var now = nowStamp();
    var patientCells = [
      asText(patientName),
      asText(phone),
      asText(email),
      now,
      asText(cleanText(loc.city || loc.locationCity, 80) || "Unknown"),
      asText(cleanText(loc.region || loc.locationRegion, 80) || "Unknown"),
      asText(cleanText(loc.country || loc.locationCountry, 80) || "Unknown"),
      asText(cleanText(loc.ip || loc.locationIp, 64) || "Unknown"),
      CONSENT_LABEL + " @ " + now,
      now
    ];
    sheet.getRange(match.rowIndex, COL.PATIENT, 1, patientCells.length).setValues([patientCells]);

    var updated = sheet.getRange(match.rowIndex, 1, 1, NUM_COLS).getValues()[0];
    return {
      success: true,
      message: "Warranty activated.",
      crown: patientCrown(readCrown(updated), updated)
    };
  });
}

function handleVerifyLogin(data) {
  var id = cleanId(data.id || data.caseId);
  var phone = cleanPhone(data.phone);
  if (!isValidCaseId(id)) return fail(ERR.INVALID_INPUT, "A valid Crown ID is required.");
  if (!isValidPhone(phone)) return fail(ERR.INVALID_INPUT, "Please enter the mobile number you registered with.");

  var cache = CacheService.getScriptCache();
  var failKey = "login_fail_" + id;
  var failures = parseInt(cache.get(failKey) || "0", 10);
  if (failures >= MAX_FAILED_LOGINS) {
    return fail(ERR.LOCKED, "Too many incorrect attempts. For your security, check-in for this crown is paused for 15 minutes.");
  }

  var sheet = getMasterSheet();
  var match = findRowByCaseId(sheet, id);
  if (!match) return fail(ERR.NOT_FOUND, "We couldn't find crown " + id + " in our laboratory records.");

  var registeredPhone = cleanPhone(match.values[COL.PHONE - 1]);
  if (!registeredPhone) {
    return {
      success: false,
      code: ERR.NOT_REGISTERED,
      needsRegistration: true,
      error: "This crown hasn't been registered yet. Please register it first."
    };
  }

  if (!phonesMatch(phone, registeredPhone)) {
    failures += 1;
    cache.put(failKey, String(failures), LOCKOUT_SECONDS);
    var left = MAX_FAILED_LOGINS - failures;
    return {
      success: false,
      code: left > 0 ? ERR.WRONG_PHONE : ERR.LOCKED,
      verified: false,
      attemptsLeft: Math.max(0, left),
      error: left > 0
        ? "That phone number doesn't match our records. Use the number you entered when you registered."
        : "Too many incorrect attempts. For your security, check-in for this crown is paused for 15 minutes."
    };
  }

  cache.remove(failKey);
  var now = nowStamp();
  sheet.getRange(match.rowIndex, COL.LAST_LOGIN).setValue(now);
  match.values[COL.LAST_LOGIN - 1] = now;

  return { success: true, verified: true, crown: patientCrown(readCrown(match.values), match.values) };
}

function handleOpsUpdate(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty("OPS_TOKEN");
  if (!expected || !safeEquals(String(payload.token || ""), expected)) {
    return fail(ERR.UNAUTHORIZED, "Ops token missing or invalid.");
  }

  var id = cleanId(payload.id || payload.caseId);
  if (!isValidCaseId(id)) return fail(ERR.INVALID_INPUT, "Case ID must look like ZIR-4510.");

  var tz = sheetTimeZone();
  var dispatchDate = payload.dispatchDate || payload.dispatchedAt ? normalizeDate(payload.dispatchDate || payload.dispatchedAt, tz) : "";
  var deliveryDate = payload.deliveryDate || payload.deliveredAt ? normalizeDate(payload.deliveryDate || payload.deliveredAt, tz) : "";
  if ((payload.dispatchDate || payload.dispatchedAt) && !dispatchDate) {
    return fail(ERR.INVALID_INPUT, "dispatchDate must be YYYY-MM-DD.");
  }
  if ((payload.deliveryDate || payload.deliveredAt) && !deliveryDate) {
    return fail(ERR.INVALID_INPUT, "deliveryDate must be YYYY-MM-DD.");
  }
  var yearsGiven = payload.warrantyYears !== undefined && payload.warrantyYears !== "";
  var years = yearsGiven ? parseInt(payload.warrantyYears, 10) : NaN;
  if (yearsGiven && (isNaN(years) || years < 1 || years > 30)) {
    return fail(ERR.INVALID_INPUT, "warrantyYears must be a whole number between 1 and 30.");
  }
  var status = cleanText(payload.dispatchStatus || payload.status, 40);

  var fields = {};
  fields[COL.MATERIAL] = payload.material;
  fields[COL.TIER] = payload.tier;
  fields[COL.TOOTH] = payload.tooth;
  fields[COL.SHADE] = payload.shade;
  fields[COL.CLINIC] = payload.clinic;
  fields[COL.DOCTOR] = payload.doctor;
  fields[COL.JOB_REF] = payload.jobRef;
  fields[COL.NOTES] = payload.notes;

  return withLock(function () {
    var sheet = getMasterSheet();
    var match = findRowByCaseId(sheet, id);
    var row;
    if (match) {
      row = match.values.slice();
    } else {
      row = [];
      for (var i = 0; i < NUM_COLS; i++) row.push("");
      row[COL.ID - 1] = asText(id);
      row[COL.STATUS - 1] = "In Production";
      row[COL.YEARS - 1] = defaultWarrantyYearsForMaterial(payload.material);
    }

    if (status) row[COL.STATUS - 1] = status;
    if (dispatchDate) row[COL.DISPATCH - 1] = dispatchDate;
    if (yearsGiven) row[COL.YEARS - 1] = years;
    else if (payload.material) row[COL.YEARS - 1] = defaultWarrantyYearsForMaterial(row[COL.MATERIAL - 1]);
    if (deliveryDate) row[COL.DELIVERY - 1] = deliveryDate;
    for (var col in fields) {
      if (fields[col] !== undefined && fields[col] !== null && fields[col] !== "") {
        row[col - 1] = asText(cleanText(fields[col], 200));
      }
    }

    var effectiveDispatch = normalizeDate(row[COL.DISPATCH - 1], tz);
    if (/dispatched|delivered/i.test(String(row[COL.STATUS - 1])) && !effectiveDispatch) {
      effectiveDispatch = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
      row[COL.DISPATCH - 1] = effectiveDispatch;
    }
    if (payload.expiryDate) {
      var explicitExpiry = normalizeDate(payload.expiryDate, tz);
      if (!explicitExpiry) return fail(ERR.INVALID_INPUT, "expiryDate must be YYYY-MM-DD.");
      row[COL.EXPIRY - 1] = explicitExpiry;
    } else if (effectiveDispatch) {
      row[COL.EXPIRY - 1] = computeExpiryDate(effectiveDispatch, parseInt(row[COL.YEARS - 1], 10) || defaultWarrantyYearsForMaterial(row[COL.MATERIAL - 1]));
    }

    row = row.map(formulaSafe);
    var opsCells = row.slice(0, COL.NOTES);
    var rowIndex;
    if (match) {
      rowIndex = match.rowIndex;
      sheet.getRange(rowIndex, 1, 1, opsCells.length).setValues([opsCells]);
    } else {
      rowIndex = sheet.getLastRow() + 1;
      sheet.getRange(rowIndex, 1, 1, NUM_COLS).setValues([row]);
    }

    var updated = sheet.getRange(rowIndex, 1, 1, NUM_COLS).getValues()[0];
    return {
      success: true,
      created: !match,
      message: (match ? "Updated " : "Created ") + "case " + id,
      crown: publicCrown(readCrown(updated)),
      isRegistered: !!cleanPhone(updated[COL.PHONE - 1])
    };
  });
}

// ----------------------------------------------------------------------------
// 3. CROWN VIEWS (what each caller is allowed to see)
// ----------------------------------------------------------------------------
function readCrown(r) {
  var tz = sheetTimeZone();
  var id = cleanId(r[COL.ID - 1]);
  var product = str(r[COL.MATERIAL - 1]);
  var years = parseInt(r[COL.YEARS - 1], 10);
  if (isNaN(years) || years <= 0) years = defaultWarrantyYearsForMaterial(product);
  var dispatchDate = normalizeDate(r[COL.DISPATCH - 1], tz);
  var expiryDate = normalizeDate(r[COL.EXPIRY - 1], tz) || (dispatchDate ? computeExpiryDate(dispatchDate, years) : "");
  var tier = str(r[COL.TIER - 1]);

  return {
    crownId: id,
    warrantyId: buildWarrantyId(id, dispatchDate),
    dispatchStatus: str(r[COL.STATUS - 1]),
    dispatchDate: dispatchDate,
    deliveryDate: normalizeDate(r[COL.DELIVERY - 1], tz),
    warrantyYears: years,
    expiryDate: expiryDate,
    product: product,
    tier: tier,
    materialFull: [product, tier].filter(function (x) { return x; }).join(" · "),
    tooth: str(r[COL.TOOTH - 1]),
    shade: str(r[COL.SHADE - 1]),
    clinic: str(r[COL.CLINIC - 1]),
    dentist: str(r[COL.DOCTOR - 1]),
    caseRef: str(r[COL.JOB_REF - 1])
  };
}

function publicCrown(c) {
  return {
    crownId: c.crownId, warrantyId: c.warrantyId, dispatchStatus: c.dispatchStatus,
    dispatchDate: c.dispatchDate, deliveryDate: c.deliveryDate, warrantyYears: c.warrantyYears,
    expiryDate: c.expiryDate, product: c.product, tier: c.tier, materialFull: c.materialFull,
    tooth: c.tooth, shade: c.shade, clinic: c.clinic, dentist: c.dentist, caseRef: c.caseRef
  };
}

function patientCrown(c, r) {
  var out = publicCrown(c);
  out.patient = str(r[COL.PATIENT - 1]).toUpperCase();
  out.maskedPhone = maskPhoneNumber(r[COL.PHONE - 1]);
  out.registeredAt = str(r[COL.REGISTERED_AT - 1] instanceof Date
    ? Utilities.formatDate(r[COL.REGISTERED_AT - 1], sheetTimeZone(), "yyyy-MM-dd HH:mm:ss")
    : r[COL.REGISTERED_AT - 1]);
  return out;
}

function buildWarrantyId(id, dispatchDate) {
  var code = id.replace(/[^A-Z0-9]/g, "");
  if (!code) return "";
  var stamp = dispatchDate ? dispatchDate.slice(2, 4) + dispatchDate.slice(5, 7) : "";
  return ["HLW", code.slice(0, 3), code.slice(3), stamp].filter(function (x) { return x; }).join(" ");
}

// ----------------------------------------------------------------------------
// 4. SHEET SETUP (run from the editor)
// ----------------------------------------------------------------------------
function setupMasterSheet(targetSpreadsheet) {
  var ss = targetSpreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);

  var existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();

  sheet.getRange(1, 1, 1, NUM_COLS).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, 14).setBackground("#052659").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.getRange(1, 15, 1, 10).setBackground("#0D5C75").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var maxRows = Math.max(sheet.getMaxRows ? sheet.getMaxRows() : sheet.getLastRow(), 2);
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), NUM_COLS).createFilter();
  // Case IDs and phones must stay text (leading zeros, no number coercion).
  sheet.getRange(2, COL.ID, maxRows - 1, 1).setNumberFormat("@");
  sheet.getRange(2, COL.PHONE, maxRows - 1, 1).setNumberFormat("@");
  sheet.getRange(2, COL.DISPATCH, maxRows - 1, 4).setNumberFormat("yyyy-mm-dd");

  var widths = [110, 130, 150, 120, 150, 130, 140, 150, 120, 80, 210, 160, 140, 220, 160, 140, 190, 160, 130, 130, 110, 130, 260, 160];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);
  return sheet;
}

/** Test sheets only: adds sample cases if the registry is empty or missing sample case. */
function seedDemoCases() {
  var sheet = getMasterSheet();
  if (sheet.getLastRow() > 1) {
    var match = findRowByCaseId(sheet, "CER-8942");
    if (!match) {
      var sampleRegistered = [
        "CER-8942", "Delivered", "2026-08-19", 5, "2031-08-19", "2026-08-21",
        "Ceramic Crown", "Ceramic-Hybrid Prime", "36", "B1",
        "Apex Dental Care, Mumbai", "Dr Sarah Jenkins", "JOB-1088", "Passed QA",
        "JANE DOE", "'9822012345", "jane.doe@example.com", "2026-08-25 10:00:00",
        "Mumbai", "Maharashtra", "India", "203.0.113.19",
        "AGREED - v1.0 [T&C + Privacy Policy] @ 2026-08-25 10:00:00", "2026-08-25 10:00:00"
      ];
      sheet.appendRow(sampleRegistered);
      return "Added sample registered case CER-8942 (Phone: 9822012345) to existing registry.";
    }
    return "Registry already has data — nothing seeded.";
  }
  var blank = ["", "", "", "", "", "", "", "", "", ""];
  var rows = [
    ["ZIR-4510", "Dispatched", "2026-08-19", 7, "2033-08-19", "2026-08-21", "Zirconia Crown", "Multi-Layer 3D Pro", "16, 17", "A2", "Smile Studio Dental Care, Nagpur", "Dr Aarav Deshmukh", "JOB-1042", "Batch-A8 · Passed QA"].concat(blank),
    ["CER-8942", "Delivered", "2026-08-19", 5, "2031-08-19", "2026-08-21", "Ceramic Crown", "Ceramic-Hybrid Prime", "36", "B1", "Apex Dental Care, Mumbai", "Dr Sarah Jenkins", "JOB-1088", "Passed QA",
      "JANE DOE", "'9822012345", "jane.doe@example.com", "2026-08-25 10:00:00", "Mumbai", "Maharashtra", "India", "203.0.113.19", "AGREED - v1.0 [T&C + Privacy Policy] @ 2026-08-25 10:00:00", "2026-08-25 10:00:00"],
    ["EMX-1001", "Dispatched", "2026-10-01", 5, "2031-10-01", "2026-10-03", "E.max Crown", "Lithium Disilicate", "11", "BL2", "Prime Aesthetics, Delhi", "Dr Arthur Miller", "JOB-1102", ""].concat(blank),
    ["CER-1001", "In Production", "", 5, "", "", "Ceramic Crown", "Ceramic-Hybrid Prime", "14", "A1", "Summit Dental Group, Bangalore", "Dr Lisa Ray", "JOB-1090", "Milling"].concat(blank)
  ];
  sheet.getRange(2, 1, rows.length, NUM_COLS).setValues(rows);
  return "Seeded " + rows.length + " demo cases (including registered sample CER-8942 / 9822012345).";
}

// ----------------------------------------------------------------------------
// 5. ON-EDIT TRIGGER: keep expiry in sync with manual sheet edits
// ----------------------------------------------------------------------------
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    var tz = sheetTimeZone();

    var firstRow = Math.max(range.getRow(), 2);
    var lastRow = range.getRow() + range.getNumRows() - 1;
    var firstCol = range.getColumn();
    var lastCol = firstCol + range.getNumColumns() - 1;
    if (lastRow < 2 || lastCol < COL.STATUS || firstCol > COL.YEARS) return;

    for (var row = firstRow; row <= lastRow; row++) {
      var vals = sheet.getRange(row, 1, 1, Math.max(COL.MATERIAL, lastCol)).getValues()[0];
      var status = vals[COL.STATUS - 1];
      var dispatch = normalizeDate(vals[COL.DISPATCH - 1], tz);
      var yearsCell = vals[COL.YEARS - 1];
      var material = String(vals[COL.MATERIAL - 1] || "");
      var years = parseInt(yearsCell, 10);
      if (isNaN(years) || years <= 0) {
        years = defaultWarrantyYearsForMaterial(material);
        sheet.getRange(row, COL.YEARS).setValue(years);
      }
      if (!dispatch && /dispatched|delivered/i.test(String(status))) {
        dispatch = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
        sheet.getRange(row, COL.DISPATCH).setValue(dispatch);
      }
      if (dispatch) sheet.getRange(row, COL.EXPIRY).setValue(computeExpiryDate(dispatch, years));
    }
  } catch (err) {
    console.error("onEdit error: " + err);
  }
}

// ----------------------------------------------------------------------------
// 6. HELPERS
// ----------------------------------------------------------------------------
function getMasterSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || setupMasterSheet(ss);
}

function sheetTimeZone() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "Asia/Kolkata";
  } catch (e) {
    return Session.getScriptTimeZone() || "Asia/Kolkata";
  }
}

function nowStamp() {
  return Utilities.formatDate(new Date(), sheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function findRowByCaseId(sheet, searchId) {
  var target = cleanId(searchId);
  var lastRow = sheet.getLastRow();
  if (!target || lastRow < 2) return null;
  var ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (cleanId(ids[i][0]) === target) {
      var rowIndex = i + 2;
      return { rowIndex: rowIndex, values: sheet.getRange(rowIndex, 1, 1, NUM_COLS).getValues()[0] };
    }
  }
  return null;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return fail(ERR.BUSY, "The registry is busy. Please try again in a few seconds.");
  }
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Returns "yyyy-MM-dd" for a sheet Date, ISO string, or dd/mm/yyyy string; "" if unparseable. */
function normalizeDate(value, tz) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : Utilities.formatDate(value, tz || sheetTimeZone(), "yyyy-MM-dd");
  }
  var s = value.toString().trim();
  var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
  var y, mo, d;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // Indian dd/mm/yyyy
    if (!m) return "";
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  var check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return "";
  return y + "-" + pad2(mo) + "-" + pad2(d);
}

/** Adds whole years to a yyyy-MM-dd date. 29 Feb rolls back to 28 Feb in non-leap years. */
function computeExpiryDate(isoDate, years) {
  var iso = normalizeDate(isoDate, sheetTimeZone());
  if (!iso) return "";
  var y = +iso.slice(0, 4) + (years || DEFAULT_WARRANTY_YEARS);
  var mo = +iso.slice(5, 7);
  var d = +iso.slice(8, 10);
  var daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return y + "-" + pad2(mo) + "-" + pad2(Math.min(d, daysInMonth));
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function str(v) { return (v === null || v === undefined) ? "" : v.toString().trim(); }

function cleanId(val) {
  return str(val).toUpperCase().replace(/\s+/g, "");
}

function isValidCaseId(id) {
  return /^[A-Z]{3}-\d{4}$/.test(id);
}

function cleanPhone(val) {
  return str(val).replace(/\D/g, "");
}

function isValidPhone(digits) {
  return digits.length >= 10 && digits.length <= 15;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Strips control characters and caps length. */
function cleanText(val, maxLen) {
  return str(val).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLen || 200);
}

/** Forces a value to be stored as literal text (never a formula or number). */
function asText(val) {
  var s = str(val);
  return s ? "'" + s : "";
}

/** Text read back from the sheet loses its "'" prefix; re-guard it before writing it again. */
function formulaSafe(val) {
  return (typeof val === "string" && /^[=+\-@]/.test(val)) ? "'" + val : val;
}

function phonesMatch(p1, p2) {
  var a = cleanPhone(p1), b = cleanPhone(p2);
  if (a.length < 10 || b.length < 10) return false;
  return a.slice(-10) === b.slice(-10);
}

function maskPhoneNumber(val) {
  var c = cleanPhone(val);
  return c ? "ending in " + c.slice(-4) : "";
}

function safeEquals(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function fail(code, message) {
  return { success: false, code: code, error: message };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
