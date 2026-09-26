/**
 * Device status stickers for HCC Outgoing.
 *
 * Built for a Honeywell RP-series mobile thermal printer, which prints in
 * BLACK ONLY at 203 dpi. So the design never relies on colour to carry meaning:
 *
 *   WORKING    → white label, heavy black outline, large ✓
 *   DEFECTIVE  → solid black block, reversed white text, large ✗
 *
 * That reads instantly from across the room on thermal media, and still looks
 * right on an ordinary office printer. Output goes through the browser's own
 * print dialog, so any printer installed on the workstation works with no
 * extra software.
 */

const SIZE_KEY = "htms_sticker_size";

/**
 * Label presets. `w` is the LABEL width; `print` is the printer's usable
 * print width (the RP2 can only mark 48 mm of a 57 mm roll).
 * `compact` switches to the type scale tuned for narrow labels.
 */
export const STICKER_SIZES = {
  "rp2-50x76": { label: "RP2 · 50 × 76 mm  (2 × 3 in)", w: 48, h: 76, compact: true },
  "rp2-50x50": { label: "RP2 · 50 × 50 mm",             w: 48, h: 50, compact: true },
  "rp2-50x30": { label: "RP2 · 50 × 30 mm  (short)",    w: 48, h: 30, compact: true, tiny: true },
  "rp4-100x62":{ label: "RP4 · 100 × 62 mm",            w: 100, h: 62 },
  "rp4-100x50":{ label: "RP4 · 100 × 50 mm",            w: 100, h: 50 },
  "a4":        { label: "A4 sheet  (cut after printing)", w: 100, h: 62, sheet: true },
};

export const getStickerSize = () => {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    if (v && STICKER_SIZES[v]) return v;
  } catch {}
  return "rp2-50x76";
};

export const setStickerSize = (key) => {
  try { localStorage.setItem(SIZE_KEY, key); } catch {}
};

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/** Type scale in millimetres, tuned per label width. */
function scale(size) {
  if (size.tiny)    return { mark: 6.5, word: 3.6, name: 3.2, key: 2.1, val: 2.6, gap: 0.6, pad: 2 };
  if (size.compact) return { mark: 9,   word: 4.6, name: 4.0, key: 2.5, val: 3.2, gap: 1.0, pad: 2.5 };
  return              { mark: 11,  word: 6.0, name: 5.0, key: 2.9, val: 3.8, gap: 1.2, pad: 3.5 };
}

function stickerHtml(record, device, size) {
  const working = device.condition === "working";
  const mark = working ? "✓" : "✗";
  const word = working ? "WORKING" : "DEFECTIVE";

  // On a very short label only the essentials fit.
  const rows = [
    ["MRN", record.mrn, true],
    record.patientType === "inpatient" && record.ward ? ["WARD", record.ward, false] : null,
    ["CONTACT", record.phone, true],
    size.tiny ? null : ["DEVICE", device.deviceType, false],
    size.tiny ? null : ["HTM / SN", device.htmSn, true],
  ].filter(Boolean);

  return `
  <div class="sticker">
    <div class="status ${working ? "ok" : "bad"}">
      <span class="mark">${mark}</span><span class="word">${word}</span>
    </div>
    <div class="who">${esc(record.patientName || "—")}</div>
    <div class="rows">
      ${rows.map(([k, v, mono]) => `
        <div class="row">
          <span class="k">${k}</span>
          <span class="v${mono ? " mono" : ""}">${esc(v || "—")}</span>
        </div>`).join("")}
    </div>
  </div>`;
}

/**
 * Open the print dialog for one or more device stickers.
 *
 * @param record   the HCC record (patient details)
 * @param devices  devices to print — one sticker each
 */
export function printStickers(record, devices, sizeKey = getStickerSize()) {
  const size = STICKER_SIZES[sizeKey] || STICKER_SIZES["rp2-50x76"];
  const list = (devices || []).filter(Boolean);
  if (!list.length) return;

  const t = scale(size);
  const sheet = !!size.sheet;

  const page = sheet
    ? `@page { size: A4; margin: 10mm; }`
    : `@page { size: ${size.w}mm ${size.h}mm; margin: 0; }`;

  const box = sheet
    ? `width: ${size.w}mm; height: ${size.h}mm; margin: 0 auto 5mm; border: 0.3mm dashed #888;`
    : `width: ${size.w}mm; height: ${size.h}mm; page-break-after: always;`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Device sticker</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; }
  ${page}

  .sticker { ${box} padding: ${t.pad}mm; display: flex; flex-direction: column; overflow: hidden; }
  .sticker:last-child { page-break-after: auto; }

  /* Status block — meaning carried by shape and contrast, never by colour,
     because the RP-series prints in black only. */
  .status { display: flex; align-items: center; justify-content: center;
            gap: ${t.pad}mm; padding: ${t.gap}mm ${t.pad}mm;
            margin-bottom: ${t.gap * 1.6}mm; }
  .status.ok  { border: 1.2mm solid #000; background: #fff; color: #000; }
  .status.bad { border: 1.2mm solid #000; background: #000; color: #fff; }
  .mark { font-size: ${t.mark}mm; font-weight: 700; line-height: 1; }
  .word { font-size: ${t.word}mm; font-weight: 700; letter-spacing: .3mm; line-height: 1; }

  .who { font-size: ${t.name}mm; font-weight: 700; text-align: center;
         margin-bottom: ${t.gap * 1.4}mm; white-space: nowrap;
         overflow: hidden; text-overflow: ellipsis; }

  .rows { display: flex; flex-direction: column; gap: ${t.gap}mm; }
  .row  { display: flex; justify-content: space-between; align-items: baseline;
          gap: 2mm; border-bottom: 0.25mm solid #000; padding-bottom: ${t.gap * 0.7}mm; }
  .k    { font-size: ${t.key}mm; font-weight: 700; letter-spacing: .2mm;
          flex-shrink: 0; }
  .v    { font-size: ${t.val}mm; font-weight: 700; text-align: right;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: "Courier New", monospace; }

  @media screen {
    body { background: #ddd; padding: 8mm; }
    .sticker { background: #fff; margin: 0 auto 5mm; box-shadow: 0 1px 6px rgba(0,0,0,.3); }
  }
</style></head>
<body>${list.map(d => stickerHtml(record, d, size)).join("")}</body></html>`;

  sendToPrinter(html);
}

/**
 * Hand a document to the printer from a phone.
 *
 * Printing happens through a hidden iframe rather than a pop-up window:
 * mobile browsers block pop-ups aggressively, while an iframe always belongs
 * to the page the user just tapped in. On Android the print dialog lists the
 * RP2 once "Print Service by Honeywell" is installed and the printer paired.
 *
 * If a browser refuses to print the frame, the sticker is opened as a normal
 * page instead so it can be printed from the browser menu.
 */
function sendToPrinter(html) {
  let frame = null;
  const cleanUp = () => {
    setTimeout(() => { try { frame && frame.remove(); } catch {} }, 1500);
  };

  try {
    frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    // Kept in the layout but invisible — display:none stops some browsers printing it
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";
    document.body.appendChild(frame);

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const go = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        cleanUp();
      } catch {
        cleanUp();
        openFallback(html);
      }
    };

    // Give the label CSS a moment to lay out before the dialog opens
    if (doc.readyState === "complete") setTimeout(go, 250);
    else frame.onload = () => setTimeout(go, 250);
  } catch {
    cleanUp();
    openFallback(html);
  }
}

/** Last resort: show the sticker as its own page to print from the menu. */
function openFallback(html) {
  try {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    window.alert("Could not open the print view. Check that the browser allows pop-ups for this site.");
  }
}
