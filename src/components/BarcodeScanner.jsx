import React, { useState, useEffect, useRef, useCallback } from "react";
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

// How often a frame is examined. Running on every animation frame saturates the
// main thread, which is what made the preview stutter and go black.
const SCAN_INTERVAL_MS = 90;

// The part of the frame that is examined, matching the on-screen guide box.
// Searching a smaller area is dramatically faster than a full 720p frame.
const CROP_W = 0.9;
const CROP_H = 0.72;

export default function BarcodeInput({ value, onChange, placeholder, autoFocus, style }) {
  const [scanOpen, setScanOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Feature-detect the native BarcodeDetector
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  // Kept stable so the scanner never restarts its camera when the parent
  // form re-renders — that restart was the cause of the flickering preview.
  const handleDetected = useCallback((code) => {
    onChange(code);
    setScanOpen(false);
  }, [onChange]);

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
          onDetected={handleDetected}
        />
      )}
    </>
  );
}

function ScannerModal({ onClose, onDetected, supported }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const timerRef  = useRef(null);
  const canvasRef = useRef(null);
  const detectedRef = useRef(false);
  const [err, setErr]       = useState("");
  const [manual, setManual] = useState("");
  const [ready, setReady]   = useState(false);

  // The callback is read through a ref so changing it never restarts the camera
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let detector = null;
    let cancelled = false;
    let pass = 0;

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
        // A higher resolution and continuous autofocus matter a great deal for
        // dense 1D barcodes — at 720p the bars often blur into each other.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            advanced: [{ focusMode: "continuous" }],
          }
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        // Ask the camera to keep focusing; ignored silently when unsupported
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track.getCapabilities?.() || {};
          const advanced = [];
          if (caps.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
          if (caps.exposureMode?.includes("continuous")) advanced.push({ exposureMode: "continuous" });
          if (advanced.length) await track.applyConstraints({ advanced });
        } catch (e) { /* not supported on this camera */ }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        try { await video.play(); } catch (e) { /* autoplay retried below */ }
        setReady(true);

        const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const scan = async () => {
          if (cancelled || detectedRef.current) return;
          const v = videoRef.current;

          if (v && v.paused && v.srcObject) { try { await v.play(); } catch (e) {} }

          if (v && v.videoWidth > 0) {
            try {
              // Most passes look only inside the guide box, which is both faster
              // and less likely to lock on to a neighbouring label. Every fourth
              // pass sweeps the whole frame in case the code sits off-centre.
              let source = v;
              if (pass % 4 !== 3) {
                const vw = v.videoWidth, vh = v.videoHeight;
                const cw = Math.round(vw * CROP_W), ch = Math.round(vh * CROP_H);
                if (canvas.width !== cw || canvas.height !== ch) {
                  canvas.width = cw; canvas.height = ch;
                }
                ctx.drawImage(v, Math.round((vw - cw) / 2), Math.round((vh - ch) / 2),
                                 cw, ch, 0, 0, cw, ch);
                source = canvas;
              }
              pass++;

              const codes = await detector.detect(source);
              const hit = codes?.find(c => c.rawValue && c.rawValue.trim());
              if (hit) {
                detectedRef.current = true;
                onDetectedRef.current(hit.rawValue.trim());
                return;
              }
            } catch (e) { /* frame not ready — keep polling */ }
          }

          if (!cancelled && !detectedRef.current) {
            timerRef.current = setTimeout(scan, SCAN_INTERVAL_MS);
          }
        };

        timerRef.current = setTimeout(scan, SCAN_INTERVAL_MS);
      } catch (e) {
        setErr("Camera access was denied or is unavailable. Enter the code manually below.");
      }
    }

    start();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [supported]);

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
              <video ref={videoRef} playsInline muted autoPlay />
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
