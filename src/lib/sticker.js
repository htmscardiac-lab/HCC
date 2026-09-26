/**
 * Device status stickers for HCC Outgoing.
 *
 * Builds a self-contained print document and hands it to the browser's own
 * print dialog, so it works with any printer the workstation already has —
 * label printer or ordinary office printer — with no driver or extra software.
 *
 * The label size is stored locally per workstation, because the printer in the
 * workshop is not necessarily the one at the desk.
 */

const SIZE_KEY = "htms_sticker_size";

/** Label presets, in millimetres. */
export const STICKER_SIZES = {
  "100x62": { label: "100 × 62 mm  (medium label)", w: 100, h: 62 },
  "62x40":  { label: "62 × 40 mm  (small label)",   w: 62,  h: 40 },
  "100x50": { label: "100 × 50 mm",                 w: 100, h: 50 },
  "76x51":  { label: "76 × 51 mm  (3 × 2 in)",      w: 76,  h: 51 },
  "a4":     { label: "A4 sheet  (cut after printing)", w: 210, h: 297, sheet: true },
};

export const getStickerSize = () => {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    if (v && STICKER_SIZES[v]) return v;
  } catch {}
  return "100x62";
};

export const setStickerSize = (key) => {
  try { localStorage.setItem(SIZE_KEY, key); } catch {}
};

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/** One sticker's markup. */
function stickerHtml(record, device, sheet) {
  const working = device.condition === "working";
  const mark = working ? "✓" : "✗";
  const word = working ? "WORKING" : "DEFECTIVE";
  const col  = working ? "#1a6b3c" : "#c0392b";

  const ward = record.patientType === "inpatient" && record.ward
    ? `<div class="row"><span class="k">Ward</span><span class="v">${esc(record.ward)}</span></div>` : "";

  return `
  <div class="sticker${sheet ? " on-sheet" : ""}">
    <div class="status" style="color:${col};border-color:${col}">
      <span class="mark">${mark}</span><span class="word">${word}</span>
    </div>
    <div class="who">${esc(record.patientName || "—")}</div>
    <div class="rows">
      <div class="row"><span class="k">MRN</span><span class="v mono">${esc(record.mrn || "—")}</span></div>
      ${ward}
      <div class="row"><span class="k">Contact</span><span class="v mono">${esc(record.phone || "—")}</span></div>
      <div class="row"><span class="k">Device</span><span class="v">${esc(device.deviceType || "—")}</span></div>
      <div class="row"><span class="k">HTM / SN</span><span class="v mono">${esc(device.htmSn || "—")}</span></div>
    </div>
  </div>`;
}

/**
 * Open the print dialog for one or more device stickers.
 *
 * @param record   the HCC record (patient details)
 * @param devices  array of devices to print — one sticker each
 */
export function printStickers(record, devices, sizeKey = getStickerSize()) {
  const size = STICKER_SIZES[sizeKey] || STICKER_SIZES["100x62"];
  const sheet = !!size.sheet;
  const list = (devices || []).filter(Boolean);
  if (!list.length) return;

  const page = sheet
    ? `@page { size: A4; margin: 12mm; }`
    : `@page { size: ${size.w}mm ${size.h}mm; margin: 0; }`;

  // On a label roll each sticker is its own page; on A4 they flow down the sheet.
  const box = sheet
    ? `width: 100mm; height: 58mm; margin: 0 0 6mm 0; border: 1px dashed #999;`
    : `width: ${size.w}mm; height: ${size.h}mm; page-break-after: always;`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Device sticker</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; }
  ${page}
  .sticker { ${box} padding: 3mm 4mm; display: flex; flex-direction: column; overflow: hidden; }
  .sticker:last-child { page-break-after: auto; }
  .status { text-align: center; border: 1.6mm solid; border-radius: 2mm;
            padding: 1.2mm 2mm; margin-bottom: 2.2mm; display: flex;
            align-items: center; justify-content: center; gap: 2.5mm; }
  .mark { font-size: 9mm; font-weight: 700; line-height: 1; }
  .word { font-size: 6mm; font-weight: 700; letter-spacing: .4mm; line-height: 1; }
  .who  { font-size: 4.6mm; font-weight: 700; text-align: center;
          margin-bottom: 2mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rows { display: flex; flex-direction: column; gap: 1mm; }
  .row  { display: flex; justify-content: space-between; align-items: baseline;
          gap: 3mm; border-bottom: .2mm dotted #bbb; padding-bottom: .8mm; }
  .k    { font-size: 2.9mm; text-transform: uppercase; letter-spacing: .25mm; color: #555; flex-shrink: 0; }
  .v    { font-size: 3.6mm; font-weight: 700; text-align: right;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: "Courier New", monospace; }
  @media screen { body { background:#eee; padding:10mm; } .sticker { background:#fff; margin:0 auto 6mm; box-shadow:0 1px 6px rgba(0,0,0,.2); } }
</style></head>
<body>${list.map(d => stickerHtml(record, d, sheet)).join("")}</body></html>`;

  const win = window.open("", "_blank", "width=720,height=640");
  if (!win) {
    window.alert("The browser blocked the print window. Allow pop-ups for this site and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the layout a moment to settle before the dialog opens
  setTimeout(() => { try { win.print(); } catch {} }, 350);
}
