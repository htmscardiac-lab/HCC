import { sendToPrinter } from "./sticker.js";
import * as R from "./roster.js";

/**
 * Print the On-Call roster in the department's familiar layout:
 *
 *   ┌──────┬─────────────── HCC Assign Engineer ───────────────────────┐
 *   │ 2026 │                                                            │
 *   ├──────┼─────┬─────┬─────┬─────┬─────┬─────┬─────┬──────┬────┬─────┤
 *   │Month │ SUN │ MON │ TUE │ WED │ THU │ FRI │ SAT │Assign│2nd │ 3rd │
 *   ├──────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼──────┼────┼─────┤
 *   │  S   │ 30  │ 31  │  1  │  2  │  3  │  4  │  5  │ ...  │    │     │
 *   │  e   │ ...                                                         │
 *
 *   grey   = working day of the period's month
 *   white  = working day of a neighbouring month
 *   orange = Friday / Saturday
 *
 * Names are the effective week-level line-up; days covered for leave are
 * listed in small type under the name they replace.
 */
export function printRoster({ label, weeks, ctx, name }) {
  const dom = R.dominantMonth(weeks);
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const rows = weeks.map((w, wi) => {
    const plan = ctx.plans[w];
    const slots = plan ? R.effectiveWeek(ctx, w).slots : [null, null, null];
    const runs = plan ? R.dayRuns(ctx, w) : [];

    const dayCells = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const k = R.addDays(w, i);
      const cls = i >= 5 ? "we" : (k.slice(0, 7) === dom.key ? "in" : "out");
      return `<td class="day ${cls}">${Number(k.slice(8))}</td>`;
    }).join("");

    const slotCells = [0, 1, 2].map(i => {
      // Days inside this week where someone else held the slot
      const cover = runs
        .filter(r => r.slots[i] && r.slots[i] !== slots[i])
        .map(r => `${esc(name(r.slots[i]))} ${R.fmtDay(r.from).slice(0, 2)}${r.to !== r.from ? "–" + R.fmtDay(r.to).slice(0, 2) : ""}`);
      return `<td class="name">${slots[i] ? esc(name(slots[i])) : ""}${
        cover.length ? `<div class="cover">${cover.join("<br>")}</div>` : ""}</td>`;
    }).join("");

    const monthCell = wi === 0
      ? `<td class="month" rowspan="${weeks.length}"><div>${esc(label)}</div></td>` : "";
    return `<tr>${monthCell}${dayCells}${slotCells}</tr>`;
  }).join("");

  const printed = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>HCC Assign Engineer — ${esc(label)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 2.5px solid #000; }
  td, th { border: 1px solid #000; text-align: center; vertical-align: middle; }
  .year  { background: #f2f2dc; font-weight: 700; font-size: 15px; width: 9%; height: 46px; }
  .title { font-size: 26px; font-weight: 400; height: 46px; }
  .head th { background: #9dc3e6; color: #1f3d99; font-size: 15px; font-weight: 700; height: 46px; }
  .head th.mh { background: #ccffff; color: #000; }
  .month { background: #ccffff; width: 9%; }
  .month div { writing-mode: vertical-rl; transform: rotate(180deg); margin: 0 auto;
               font-size: 34px; font-weight: 800; font-style: italic; letter-spacing: 1px; white-space: nowrap; }
  .day   { font-size: 15px; height: 52px; }
  .day.in  { background: #bfbfbf; }
  .day.out { background: #fff; }
  .day.we  { background: #f8cbad; }
  .name  { font-size: 15px; background: #fff; width: 13%; }
  .cover { font-size: 10.5px; color: #c55a11; margin-top: 3px; line-height: 1.3; }
  .foot  { margin-top: 8px; font-size: 10px; color: #555; display: flex; justify-content: space-between; }
</style></head><body>
<table>
  <tr><td class="year">${dom.year}</td><td class="title" colspan="10">HCC Assign Engineer</td></tr>
  <tr class="head"><th class="mh">Month</th>${DAYS.map(d => `<th>${d}</th>`).join("")}<th style="width:13%">Assign</th><th style="width:13%">2nd</th><th style="width:13%">3rd</th></tr>
  ${rows}
</table>
<div class="foot"><span>HTMS — Cardiac Lab · ${esc(R.weekLabel(weeks[0]).split(" – ")[0])} – ${esc(R.fmtDayY(R.weekEnd(weeks[weeks.length - 1])))}</span><span>Printed ${printed}</span></div>
</body></html>`;

  sendToPrinter(html);
}
