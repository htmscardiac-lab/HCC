/**
 * Device status stickers for HCC Outgoing (40 × 12 mm).
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

/** The one label size in use: 40 × 12 mm. */
export const STICKER = { w: 40, h: 12, label: "40 × 12 mm" };

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * One 40 × 12 mm sticker: device status on the left, MRN on the right.
 *   WORKING    → white box, heavy outline, ✓
 *   DEFECTIVE  → solid black box, white text, ✗
 */
function stickerHtml(record, device) {
  const working = device.condition === "working";
  return `
  <div class="sticker">
    <div class="status ${working ? "ok" : "bad"}">
      <span class="mark">${working ? "✓" : "✗"}</span>
      <span class="word">${working ? "WORKING" : "DEFECTIVE"}</span>
    </div>
    <div class="mrn"><span class="k">MRN</span><span class="v">${esc(record.mrn || "—")}</span></div>
  </div>`;
}

/**
 * Open the print dialog for one or more device stickers (one per device).
 */
export function printStickers(record, devices) {
  const list = (devices || []).filter(Boolean);
  if (!list.length) return;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Device sticker</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; }
  @page { size: ${STICKER.w}mm ${STICKER.h}mm; margin: 0; }

  .sticker { width: ${STICKER.w}mm; height: ${STICKER.h}mm; padding: 1mm;
             display: flex; align-items: stretch; gap: 1mm;
             overflow: hidden; page-break-after: always; }
  .sticker:last-child { page-break-after: auto; }

  /* Meaning carried by shape and contrast, never colour — the printer is
     black only. */
  .status { flex: 0 0 21mm; display: flex; align-items: center; justify-content: center;
            gap: 0.8mm; border: 0.6mm solid #000; border-radius: 0.8mm; }
  .status.ok  { background: #fff; color: #000; }
  .status.bad { background: #000; color: #fff; }
  .mark { font-size: 4.2mm; font-weight: 700; line-height: 1; }
  .word { font-size: 2.6mm; font-weight: 800; letter-spacing: .1mm; line-height: 1; }
  .status.bad .word { font-size: 2.3mm; letter-spacing: 0; }
  .status.bad .mark { font-size: 3.6mm; }

  .mrn { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .k   { font-size: 1.9mm; font-weight: 700; letter-spacing: .2mm; line-height: 1.1; }
  .v   { font-size: 3.4mm; font-weight: 800; font-family: "Courier New", monospace;
         line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  @media screen {
    body { background: #ddd; padding: 8mm; }
    .sticker { background: #fff; margin: 0 auto 5mm; box-shadow: 0 1px 6px rgba(0,0,0,.3); }
  }
</style></head>
<body>${list.map(d => stickerHtml(record, d)).join("")}</body></html>`;

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
export function sendToPrinter(html) {
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
