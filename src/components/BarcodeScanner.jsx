import React, { useState, useEffect, useRef } from "react";
import { Ic, D, Modal } from "../lib/utils.jsx";

/**
 * Barcode input with three capture paths:
 *  1. Manual typing
 *  2. USB laser scanner (acts as a keyboard — types then sends Enter)
 *  3. Phone/tablet camera via BarcodeDetector API (Code 128, Code 39, EAN, etc.)
 *
 * The vertical-line (1D linear) symbologies requested are all covered:
 *   code_128, code_39, code_93, codabar, ean_13, ean_8, itf, upc_a, upc_e
 */

const LINEAR_FORMATS = [
  "code_128", "code_39", "code_93", "codabar",
  "ean_13", "ean_8", "itf", "upc_a", "upc_e"
];

export default function BarcodeInput({ value, onChange, placeholder, autoFocus, style }) {
  const [scanOpen, setScanOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Feature-detect the native BarcodeDetector
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  return (
    <>
      <div style={{ display: "flex", gap: 6, ...style }}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "Scan or type…"}
          autoFocus={autoFocus}
          style={{ flex: 1, fontFamily: "var(--mono)" }}
          // USB scanners send Enter after the code — swallow it so no form submits
          onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
        />
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setScanOpen(true)}
          title="Scan barcode with camera"
          style={{ flexShrink: 0, padding: "8px 11px" }}
        >
          <Ic d={D.barcode} size={15} />
        </button>
      </div>

      {scanOpen && (
        <ScannerModal
          supported={supported}
          onClose={() => setScanOpen(false)}
          onDetected={code => { onChange(code); setScanOpen(false); }}
        />
      )}
    </>
  );
}

function ScannerModal({ onClose, onDetected, supported }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const [err, setErr]       = useState("");
  const [manual, setManual] = useState("");
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    let detector = null;
    let cancelled = false;

    async function start() {
      if (!supported) {
        setErr("This browser does not support camera barcode detection. Use a USB scanner or type the code manually below.");
        return;
      }
      try {
        detector = new window.BarcodeDetector({ formats: LINEAR_FORMATS });
      } catch (e) {
        setErr("Barcode detector could not be initialised. Enter the code manually below.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              onDetected(codes[0].rawValue.trim());
              return;
            }
          } catch (e) { /* frame not ready — keep polling */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setErr("Camera access was denied or is unavailable. Enter the code manually below.");
      }
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [supported, onDetected]);

  return (
    <Modal
      title="Scan Barcode"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => { if (manual.trim()) onDetected(manual.trim()); }}
          >
            <Ic d={D.check} size={13} stroke="#fff" /> Use Typed Code
          </button>
        </>
      }
    >
      {err
        ? <div className="alert alert-warn"><Ic d={D.warn} size={14} />{err}</div>
        : (
          <>
            <div className="scanner-box">
              <video ref={videoRef} playsInline muted />
              <div className="scan-frame" />
              <div className="scan-line" />
            </div>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text3)", margin: "12px 0 4px", fontWeight: 500 }}>
              {ready
                ? "Hold the barcode inside the frame — it will be captured automatically"
                : "Starting camera…"}
            </p>
          </>
        )
      }

      <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 16 }}>
        <label>Or type / scan with a USB scanner</label>
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="HTM or Serial Number"
          autoFocus
          style={{ fontFamily: "var(--mono)" }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (manual.trim()) onDetected(manual.trim());
            }
          }}
        />
        <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
          A USB laser scanner types the code here and presses Enter automatically.
        </p>
      </div>
    </Modal>
  );
}
