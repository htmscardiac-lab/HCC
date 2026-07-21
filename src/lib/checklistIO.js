import * as XLSX from "xlsx";
import { uid, FIELD_TYPES } from "./utils.jsx";

/**
 * Excel / CSV import + template export for checklist steps.
 *
 * Column order (row 1 must be the header row):
 *   A label · B description · C type · D required · E help
 *   F min · G max · H unit · I options · J passOptions · K datePrecision
 */

export const COLUMNS = [
  "label", "description", "type", "required", "help",
  "min", "max", "unit", "options", "passOptions", "datePrecision"
];

const VALID_TYPES = FIELD_TYPES.map(t => t.id);
const SEP = "|";

const truthy = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "" || s === "yes" || s === "y" || s === "true" || s === "1";
};

const splitList = (v) =>
  String(v ?? "").split(SEP).map(x => x.trim()).filter(Boolean);

/**
 * Parse a workbook buffer into { steps, errors, warnings }.
 * Errors block the import; warnings are informational.
 */
export function parseChecklistFile(data, filename) {
  const result = { steps: [], errors: [], warnings: [] };

  let rows;
  try {
    const wb = XLSX.read(data, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) { result.errors.push({ row: 0, msg: "The file contains no sheets." }); return result; }
    const ws = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
  } catch (e) {
    result.errors.push({ row: 0, msg: "Could not read the file. Make sure it is a valid .xlsx or .csv file." });
    return result;
  }

  if (!rows || rows.length < 2) {
    result.errors.push({ row: 0, msg: "The sheet needs a header row plus at least one step row." });
    return result;
  }

  // ── Header validation ────────────────────────────────────────────────
  const header = rows[0].map(h => String(h ?? "").trim().toLowerCase());
  const missing = [];
  const idx = {};
  COLUMNS.forEach((col, i) => {
    const found = header.indexOf(col.toLowerCase());
    if (found === -1) {
      // label and type are mandatory columns; the rest can be absent
      if (col === "label" || col === "type") missing.push(col);
      idx[col] = -1;
    } else {
      idx[col] = found;
      if (found !== i) {
        result.warnings.push({ row: 1, msg: `Column "${col}" is in position ${found + 1}, expected ${i + 1}. Reading by name.` });
      }
    }
  });

  if (missing.length) {
    result.errors.push({ row: 1, msg: `Header row is missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}` });
    return result;
  }

  const cell = (row, col) => idx[col] === -1 ? "" : String(row[idx[col]] ?? "").trim();

  // ── Row parsing ──────────────────────────────────────────────────────
  rows.slice(1).forEach((row, i) => {
    const rowNo = i + 2; // 1-based, +1 for header

    // Skip fully blank rows
    if (row.every(c => String(c ?? "").trim() === "")) return;

    const label = cell(row, "label");
    const type  = cell(row, "type").toLowerCase();

    if (!label) { result.errors.push({ row: rowNo, msg: "Missing label." }); return; }
    if (!type)  { result.errors.push({ row: rowNo, msg: `"${label}" — missing type.` }); return; }
    if (!VALID_TYPES.includes(type)) {
      result.errors.push({ row: rowNo, msg: `"${label}" — unknown type "${type}". Valid: ${VALID_TYPES.join(", ")}` });
      return;
    }

    const step = {
      id: uid(),
      label,
      description: cell(row, "description"),
      type,
      required: truthy(cell(row, "required")),
      help: cell(row, "help"),
      min: "", max: "", unit: cell(row, "unit"),
      options: [], passOptions: [], scored: false,
      datePrecision: "month",
      defaultValue: ""
    };

    // number_range — needs min or max
    if (type === "number_range") {
      const min = cell(row, "min");
      const max = cell(row, "max");
      if (min === "" && max === "") {
        result.errors.push({ row: rowNo, msg: `"${label}" — number_range needs at least a min or a max.` });
        return;
      }
      if (min !== "" && isNaN(Number(min))) {
        result.errors.push({ row: rowNo, msg: `"${label}" — min "${min}" is not a number.` }); return;
      }
      if (max !== "" && isNaN(Number(max))) {
        result.errors.push({ row: rowNo, msg: `"${label}" — max "${max}" is not a number.` }); return;
      }
      if (min !== "" && max !== "" && Number(min) > Number(max)) {
        result.errors.push({ row: rowNo, msg: `"${label}" — min (${min}) is greater than max (${max}).` }); return;
      }
      step.min = min;
      step.max = max;
    }

    // select — needs options
    if (type === "select") {
      const opts = splitList(cell(row, "options"));
      if (opts.length < 2) {
        result.errors.push({ row: rowNo, msg: `"${label}" — select needs at least two options separated by "${SEP}".` });
        return;
      }
      step.options = opts;

      const pass = splitList(cell(row, "passOptions"));
      if (pass.length) {
        const bad = pass.filter(p => !opts.includes(p));
        if (bad.length) {
          result.errors.push({ row: rowNo, msg: `"${label}" — passOptions not found in options: ${bad.join(", ")}` });
          return;
        }
        step.passOptions = pass;
        step.scored = true;
      }
    }

    // date precision
    if (type === "date") {
      const dp = cell(row, "datePrecision").toLowerCase();
      if (dp && !["month", "day"].includes(dp)) {
        result.warnings.push({ row: rowNo, msg: `"${label}" — datePrecision "${dp}" not recognised, using "month".` });
      }
      step.datePrecision = dp === "day" ? "day" : "month";
    }

    // Warn about values that will be ignored
    if (type !== "number_range" && (cell(row, "min") || cell(row, "max"))) {
      result.warnings.push({ row: rowNo, msg: `"${label}" — min/max ignored for type "${type}".` });
    }
    if (type !== "select" && cell(row, "options")) {
      result.warnings.push({ row: rowNo, msg: `"${label}" — options ignored for type "${type}".` });
    }

    result.steps.push(step);
  });

  if (result.steps.length === 0 && result.errors.length === 0) {
    result.errors.push({ row: 0, msg: "No step rows found in the sheet." });
  }

  return result;
}

// ── Template download ──────────────────────────────────────────────────
const EXAMPLE_ROWS = [
  ["Visual inspection", "Examine the casing, cables, connectors, wheels and labels for cracks, burns, fraying, corrosion or missing parts. Confirm the asset tag is present and legible.", "pass_fail", "yes", "Check all sides", "", "", "", "", "", ""],
  ["Mains voltage", "Measure the supply voltage at the mains inlet using a calibrated multimeter with the device powered on and idle.", "number_range", "yes", "At inlet", "210", "230", "V", "", "", ""],
  ["Earth leakage current", "Using a safety analyser, measure earth leakage under normal condition with the device fully powered.", "number_range", "yes", "Normal condition", "0", "500", "µA", "", "", ""],
  ["Protective earth resistance", "Measure resistance between the earth pin and any exposed conductive part of the chassis.", "number_range", "yes", "", "0", "0.2", "Ω", "", "", ""],
  ["Battery backup test", "Disconnect mains power and run the device on internal battery for five minutes. Observe whether it maintains operation without alarms or shutdown.", "select", "yes", "Run 5 min on battery", "", "", "", "Good|Acceptable|Poor|Replace", "Good|Acceptable", ""],
  ["Battery runtime", "Record the total runtime achieved on a fully charged battery before the low-battery alarm sounds.", "number_range", "yes", "Full charge to alarm", "30", "240", "min", "", "", ""],
  ["Delivered tidal volume", "Connect a calibrated gas flow analyser. Set the device to deliver 500 mL and record the measured volume.", "number_range", "yes", "Set point 500 mL", "475", "525", "mL", "", "", ""],
  ["Delivered oxygen concentration", "Set FiO2 to 100% and record the concentration measured by the analyser after stabilisation.", "number_range", "yes", "Set FiO2 100%", "95", "100", "%", "", "", ""],
  ["High pressure alarm", "Trigger the high pressure alarm by occluding the patient circuit. Confirm the alarm sounds and the display indicates the correct message.", "pass_fail", "yes", "Occlude circuit", "", "", "", "", "", ""],
  ["Power failure alarm", "Remove mains power and confirm the audible power-failure alarm activates immediately.", "pass_fail", "yes", "", "", "", "", "", "", ""],
  ["Oxygen sensor status", "Check the oxygen cell reading and remaining service life reported by the device.", "select", "yes", "", "", "", "", "Within life|Near end of life|Expired|Not fitted", "Within life|Near end of life", ""],
  ["Inspiratory filter replaced", "Replace the inspiratory bacterial filter and confirm the replacement date is logged on the device.", "pass_fail_na", "yes", "N/A if not fitted", "", "", "", "", "", ""],
  ["Internal hour meter reading", "Record the total operating hours shown in the device service menu.", "number", "no", "From service menu", "", "", "hrs", "", "", ""],
  ["Software version", "Record the firmware version currently installed, as shown in the device information screen.", "text_short", "no", "", "", "", "", "", "", ""],
  ["Next calibration due", "Record the month in which the next full calibration falls due, based on the manufacturer's interval.", "date", "yes", "", "", "", "", "", "", "month"],
  ["Overall functional test", "Run the device through a full operating cycle and confirm normal operation across all supported modes.", "pass_fail", "yes", "", "", "", "", "", "", ""],
  ["Engineer remarks", "Record any observations, deviations, parts replaced, or recommendations arising from this maintenance visit.", "text_long", "no", "", "", "", "", "", "", ""],
];

const REFERENCE_ROWS = [
  ["Column", "Required", "Applies to", "Notes"],
  ["label", "Yes", "All types", "Short heading the engineer sees"],
  ["description", "No", "All types", "Full explanation shown under the heading"],
  ["type", "Yes", "All types", "One of the eight values listed below"],
  ["required", "No", "All types", "yes or no — defaults to yes"],
  ["help", "No", "All types", "Short hint shown near the input"],
  ["min", "Conditional", "number_range", "Lowest acceptable value"],
  ["max", "Conditional", "number_range", "Highest acceptable value"],
  ["unit", "No", "number, number_range", "e.g. V, mmHg, °C, µA"],
  ["options", "Conditional", "select", "At least two, separated by |"],
  ["passOptions", "No", "select", "Which options count as a pass, separated by |"],
  ["datePrecision", "No", "date", "month or day — defaults to month"],
  ["", "", "", ""],
  ["Type value", "Field", "Auto-scored", "Notes"],
  ["pass_fail", "Pass / Fail", "Yes", "Two buttons"],
  ["pass_fail_na", "Pass / Fail / N/A", "Yes", "Three buttons; N/A is not counted"],
  ["number_range", "Number with range", "Yes", "Outside min–max fails automatically"],
  ["select", "Dropdown choice", "Only if passOptions given", "Otherwise recorded but not scored"],
  ["number", "Number", "No", "Numeric keypad on mobile"],
  ["text_short", "Short text", "No", "Single line"],
  ["text_long", "Long text", "No", "Multi-line box"],
  ["date", "Date", "No", "Month/year or full date"],
  ["", "", "", ""],
  ["Scoring rule", "", "", "Any failed step marks the device Defective. All passes mark it Working."],
];

export function downloadTemplate(withExample = true) {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — the sheet the user fills in
  const rows = [COLUMNS];
  if (withExample) rows.push(...EXAMPLE_ROWS);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 30 }, { wch: 60 }, { wch: 15 }, { wch: 10 }, { wch: 22 },
    { wch: 8 },  { wch: 8 },  { wch: 8 },  { wch: 38 }, { wch: 26 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Checklist");

  // Sheet 2 — reference
  const ref = XLSX.utils.aoa_to_sheet(REFERENCE_ROWS);
  ref["!cols"] = [{ wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 62 }];
  XLSX.utils.book_append_sheet(wb, ref, "Reference");

  XLSX.writeFile(wb, withExample
    ? "HTMS_Checklist_Template_with_example.xlsx"
    : "HTMS_Checklist_Template_blank.xlsx");
}

/** Export an existing template's steps back to Excel */
export function exportTemplateToExcel(tpl) {
  const rows = [COLUMNS];
  (tpl.steps || []).forEach(s => {
    rows.push([
      s.label || "",
      s.description || "",
      s.type || "",
      s.required === false ? "no" : "yes",
      s.help || "",
      s.min ?? "",
      s.max ?? "",
      s.unit || "",
      (s.options || []).join(SEP),
      s.scored ? (s.passOptions || []).join(SEP) : "",
      s.type === "date" ? (s.datePrecision || "month") : ""
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 30 }, { wch: 60 }, { wch: 15 }, { wch: 10 }, { wch: 22 },
    { wch: 8 },  { wch: 8 },  { wch: 8 },  { wch: 38 }, { wch: 26 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Checklist");
  const safe = (tpl.name || "checklist").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  XLSX.writeFile(wb, `${safe}.xlsx`);
}
