import * as XLSX from "xlsx";
import { fmt } from "./utils.jsx";

/**
 * Full-record Excel export for PPM and CM.
 *
 * Everything the record holds is written out — not just a pass/fail summary —
 * so a work order can be reviewed or archived offline without the app. Uses the
 * xlsx library already bundled for checklist import/export.
 */

const nm = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Resolve a single checklist answer into a readable value + pass/fail note. */
function answerCell(step, ans) {
  if (!ans) return { value: "", result: "" };
  const s = step;
  if (s.type === "pass_fail" || s.type === "pass_fail_na") {
    const v = ans.value === "pass" ? "Pass" : ans.value === "fail" ? "Fail" : "N/A";
    return { value: v, result: v };
  }
  if (s.type === "number_range") {
    const v = Number(ans.value);
    const lo = s.min === "" ? -Infinity : Number(s.min);
    const hi = s.max === "" ?  Infinity : Number(s.max);
    const inRange = !isNaN(v) && v >= lo && v <= hi;
    return {
      value: String(ans.value ?? "") + (s.unit ? " " + s.unit : ""),
      result: inRange ? "Pass" : "Fail",
    };
  }
  if (s.type === "select" && s.scored) {
    return {
      value: String(ans.value ?? ""),
      result: (s.passOptions || []).includes(ans.value) ? "Pass" : "Fail",
    };
  }
  if (s.type === "date" && (s.datePrecision || "month") === "month" && ans.value) {
    const [yy, mm] = String(ans.value).split("-");
    return { value: mm ? `${nm[Number(mm) - 1]} ${yy}` : String(ans.value), result: "" };
  }
  return { value: String(ans.value ?? "") + (s.unit ? " " + s.unit : ""), result: "" };
}

function autoWidth(rows) {
  const widths = [];
  rows.forEach(r => r.forEach((c, i) => {
    const len = String(c ?? "").length;
    widths[i] = Math.max(widths[i] || 10, Math.min(60, len + 2));
  }));
  return widths.map(w => ({ wch: w }));
}

function download(wb, filename) {
  XLSX.writeFile(wb, filename);
}

const safe = (s) => String(s || "record").replace(/[^\w.-]+/g, "_").slice(0, 60);

// ── PPM ─────────────────────────────────────────────────────────────────

/** One PPM record as a detailed sheet: device block + full checklist table. */
export function exportPPMRecord(r) {
  const cl = r.checklist || {};
  const steps = cl.stepsSnapshot || [];
  const rows = [
    ["PPM Record"],
    [],
    ["HTM / SN", r.htmSn],
    ["Device Type", r.deviceType],
    ["Model", r.model || ""],
    ["Location", r.location || ""],
    ["Overall Result", r.status === "pass" ? "PASS" : "FAIL"],
    ["Performed By", r.performedBy],
    ["Date", fmt(r.performedAt)],
    ["Passed", cl.summary?.passed ?? ""],
    ["Failed", cl.summary?.failed ?? ""],
    ["N/A", cl.summary?.na ?? ""],
    [],
    ["#", "Checklist Item", "Value", "Result", "Note"],
  ];
  steps.forEach((s, i) => {
    const a = cl.answers?.[s.id];
    const { value, result } = answerCell(s, a);
    rows.push([i + 1, s.label, value, result, a?.note || ""]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidth(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PPM");
  download(wb, `PPM_${safe(r.htmSn)}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/** Many PPM records: one summary row each, plus every checklist answer flattened. */
export function exportPPMList(records, label = "PPM") {
  const summary = [[
    "HTM/SN", "Device Type", "Model", "Location", "Result",
    "Passed", "Failed", "N/A", "Performed By", "Date", "Stage",
  ]];
  const detail = [["HTM/SN", "Checklist Item", "Value", "Result", "Note"]];

  records.forEach(r => {
    const cl = r.checklist || {};
    summary.push([
      r.htmSn, r.deviceType, r.model || "", r.location || "",
      r.status === "pass" ? "PASS" : "FAIL",
      cl.summary?.passed ?? "", cl.summary?.failed ?? "", cl.summary?.na ?? "",
      r.performedBy, fmt(r.performedAt),
      r.cmmsStatus === "closed" ? "History" : "Awaiting CMMS",
    ]);
    (cl.stepsSnapshot || []).forEach(s => {
      const { value, result } = answerCell(s, cl.answers?.[s.id]);
      detail.push([r.htmSn, s.label, value, result, cl.answers?.[s.id]?.note || ""]);
    });
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary); ws1["!cols"] = autoWidth(summary);
  const ws2 = XLSX.utils.aoa_to_sheet(detail);  ws2["!cols"] = autoWidth(detail);
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");
  XLSX.utils.book_append_sheet(wb, ws2, "Checklist Detail");
  download(wb, `${safe(label)}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── CM ──────────────────────────────────────────────────────────────────

/** One CM work order as a detailed sheet: device block + problems + parts. */
export function exportCMRecord(r) {
  const rows = [
    ["CM Work Order"],
    [],
    ["HTM No / SN", r.htmSn],
    ["Device Type", r.deviceType || ""],
    ["Model", r.model || ""],
    ["Manufacturer", r.manufacturer || ""],
    ["Location", r.location || ""],
    ["Action Taken", r.actionTaken || ""],
    ["Performed By", r.performedBy],
    ["Date", fmt(r.performedAt)],
    [],
    ["Problem Reported by User"],
    [r.reportedProblem || ""],
    [],
    ["Problem Found by Engineer"],
    [r.foundProblem || ""],
    [],
    ["Inspection & Repair Details"],
    [r.inspectionDetails || ""],
  ];
  if ((r.parts || []).length) {
    rows.push([], ["Spare Parts Used"], ["Part Number", "Description", "Qty"]);
    r.parts.forEach(p => rows.push([p.partNo, p.description, p.qty]));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 50 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Work Order");
  download(wb, `CM_${safe(r.htmSn)}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/** Many CM work orders: one full row each (all fields), plus a parts sheet. */
export function exportCMList(records, label = "CM_WorkOrders") {
  const main = [[
    "HTM No", "Device Type", "Model", "Manufacturer", "Location",
    "Reported Problem", "Found Problem", "Inspection Details", "Action Taken",
    "Parts", "Performed By", "Date", "Stage",
  ]];
  const parts = [["HTM No", "Part Number", "Description", "Qty"]];

  records.forEach(r => {
    main.push([
      r.htmSn, r.deviceType || "", r.model || "", r.manufacturer || "", r.location || "",
      r.reportedProblem || "", r.foundProblem || "", r.inspectionDetails || "",
      r.actionTaken || "",
      (r.parts || []).map(p => `${p.partNo} x${p.qty}`).join(" | "),
      r.performedBy, fmt(r.performedAt),
      r.cmmsStatus === "closed" ? "History" : "Awaiting CMMS",
    ]);
    (r.parts || []).forEach(p => parts.push([r.htmSn, p.partNo, p.description, p.qty]));
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(main);  ws1["!cols"] = autoWidth(main);
  XLSX.utils.book_append_sheet(wb, ws1, "Work Orders");
  if (parts.length > 1) {
    const ws2 = XLSX.utils.aoa_to_sheet(parts); ws2["!cols"] = autoWidth(parts);
    XLSX.utils.book_append_sheet(wb, ws2, "Parts");
  }
  download(wb, `${safe(label)}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
