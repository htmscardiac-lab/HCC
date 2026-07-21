export const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f0f4f2; --surface: #ffffff; --surface2: #f7f9f8; --surface3: #eef3f0;
    --border: #d0ddd5; --border2: #b5cab9;
    --green: #1a6b3c; --green2: #145530; --green3: #0f3d22;
    --green-lt: #e8f4ed; --green-mid: #c3dfc9;
    --gold: #b8860b; --gold-lt: #fdf6e3; --gold-mid: #f5d88a;
    --red: #c0392b; --red-lt: #fdf0ee;
    --orange: #d35400; --orange-lt: #fef5ec;
    --blue: #1a4f8a; --blue-lt: #e8f0fa;
    --purple: #6a0d83; --purple-lt: #f5eaf8;
    --text: #1a2b1e; --text2: #3d5c43; --text3: #7a9680;
    --mono: 'IBM Plex Mono', monospace; --sans: 'Tajawal', sans-serif;
    --radius: 6px; --radius2: 10px;
    --shadow: 0 1px 4px rgba(26,107,60,0.08), 0 4px 16px rgba(26,107,60,0.05);
    --shadow2: 0 2px 8px rgba(26,107,60,0.12), 0 8px 32px rgba(26,107,60,0.08);
  }
  body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; }
  input, select, textarea {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--text); font-family: var(--sans); font-size: 14px; padding: 8px 12px;
    width: 100%; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  textarea { resize: vertical; min-height: 90px; line-height: 1.55; }
  input:focus, select:focus, textarea:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(26,107,60,.12); }
  select option { background: var(--surface); }
  button { font-family: var(--sans); cursor: pointer; border: none; border-radius: var(--radius); font-size: 13px; font-weight: 600; padding: 8px 16px; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
  .btn-primary { background: var(--green); color: #fff; box-shadow: 0 2px 4px rgba(26,107,60,.25); }
  .btn-primary:hover { background: var(--green2); }
  .btn-gold { background: var(--gold); color: #fff; }
  .btn-gold:hover { background: #9a700a; }
  .btn-blue { background: var(--blue); color: #fff; }
  .btn-blue:hover { background: #143f6f; }
  .btn-ghost { background: var(--surface); color: var(--text2); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--surface3); }
  .btn-danger { background: var(--red-lt); color: var(--red); border: 1px solid #f0c0bb; }
  .btn-danger:hover { background: #fbe0dc; }
  .btn-outline { background: var(--green-lt); color: var(--green); border: 1px solid var(--green-mid); }
  .btn-outline:hover { background: var(--green-mid); }
  .btn-sm { padding: 5px 11px; font-size: 12px; }
  .btn-lg { padding: 11px 22px; font-size: 15px; }
  label { display: block; font-size: 12px; font-weight: 700; color: var(--text2); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .05em; }
  .field { margin-bottom: 14px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 20px; }
  .badge-green  { background: var(--green-lt); color: var(--green); border: 1px solid var(--green-mid); }
  .badge-gold   { background: var(--gold-lt);  color: var(--gold);  border: 1px solid var(--gold-mid); }
  .badge-red    { background: var(--red-lt);   color: var(--red);   border: 1px solid #f0c0bb; }
  .badge-blue   { background: var(--blue-lt);  color: var(--blue);  border: 1px solid #c0d4f0; }
  .badge-gray   { background: var(--surface3); color: var(--text3); border: 1px solid var(--border); }
  .badge-orange { background: var(--orange-lt); color: var(--orange); border: 1px solid #f5c6a0; }
  .badge-purple { background: var(--purple-lt); color: var(--purple); border: 1px solid #d9b3e6; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius2); padding: 16px; margin-bottom: 10px; box-shadow: var(--shadow); transition: border-color .15s; }
  .card:hover { border-color: var(--border2); }
  .card-overdue { border-color: #f5c6a0 !important; background: #fffaf6 !important; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
  .checkbox-custom { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text2); user-select: none; font-weight: 500; }
  .checkbox-custom input[type=checkbox] { width: 15px; height: 15px; accent-color: var(--green); cursor: pointer; flex-shrink: 0; }
  .tab-bar { display: flex; border-bottom: 2px solid var(--border); overflow-x: auto; }
  .tab-btn { background: transparent; color: var(--text3); border-radius: 0; border-bottom: 3px solid transparent; padding: 11px 18px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 7px; margin-bottom: -2px; white-space: nowrap; }
  .tab-btn:hover { color: var(--text); background: var(--surface3); }
  .tab-btn.active { color: var(--green); border-bottom-color: var(--green); background: var(--green-lt); }
  .count-dot { background: var(--surface3); border: 1px solid var(--border); border-radius: 20px; font-size: 10px; padding: 1px 7px; font-family: var(--mono); color: var(--text3); font-weight: 600; }
  .tab-btn.active .count-dot { background: var(--green-lt); color: var(--green); border-color: var(--green-mid); }
  .search-wrap { position: relative; }
  .search-wrap input { padding-left: 34px; }
  .search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text3); pointer-events: none; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(10,30,15,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); animation: fadeIn .15s; padding: 16px; }
  .modal { background: var(--surface); border: 1px solid var(--border2); border-radius: 12px; width: min(680px,95vw); max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow2); animation: slideUp .2s; }
  .modal-wide { width: min(920px,96vw); }
  .modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: var(--surface); z-index: 2; }
  .modal-body { padding: 20px; }
  .modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; position: sticky; bottom: 0; background: var(--surface); }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .6 } }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
  .alert { padding: 10px 14px; border-radius: var(--radius); font-size: 13px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .alert-error   { background: var(--red-lt); color: var(--red); border: 1px solid #f0c0bb; }
  .alert-success { background: var(--green-lt); color: var(--green); border: 1px solid var(--green-mid); }
  .alert-warn    { background: var(--orange-lt); color: var(--orange); border: 1px solid #f5c6a0; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius2); padding: 14px 18px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
  .stat-card::before { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--sbar,#1a6b3c); }
  .stat-value { font-family: var(--mono); font-size: 30px; font-weight: 600; line-height: 1; }
  .stat-label { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
  .device-row { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; transition: border-color .15s; }
  .device-row:hover { border-color: var(--border2); }
  .info-pill { background: var(--surface3); border: 1px solid var(--border); border-radius: 4px; padding: 2px 9px; font-size: 12px; color: var(--text3); font-weight: 500; display: inline-flex; align-items: center; gap: 5px; }
  .overdue-banner { background: var(--orange-lt); border: 1px solid #f5c6a0; border-radius: 6px; padding: 7px 12px; font-size: 12px; color: var(--orange); font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; animation: pulse 2s infinite; }

  /* ── Module launcher ─────────────────────────────────────────── */
  .module-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 26px 22px; cursor: pointer; transition: all .2s; box-shadow: var(--shadow); position: relative; overflow: hidden; text-align: center; }
  .module-card:hover { transform: translateY(-4px); box-shadow: var(--shadow2); border-color: var(--border2); }
  .module-card::before { content:''; position: absolute; top:0; left:0; right:0; height:5px; background: var(--mcolor,#1a6b3c); }
  .module-icon { width: 62px; height: 62px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }

  /* ── Checklist runner ────────────────────────────────────────── */
  .progress-track { height: 6px; background: var(--surface3); border-radius: 20px; overflow: hidden; }
  .progress-fill  { height: 100%; background: var(--green); border-radius: 20px; transition: width .3s ease; }
  .step-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; box-shadow: var(--shadow); }
  .pf-btn { flex: 1; padding: 16px; border-radius: 10px; border: 2px solid var(--border); background: var(--surface); font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all .15s; }
  .pf-btn:hover { border-color: var(--border2); }
  .pf-pass.active { background: var(--green-lt); border-color: var(--green); color: var(--green); }
  .pf-fail.active { background: var(--red-lt);   border-color: var(--red);   color: var(--red); }
  .pf-na.active   { background: var(--surface3); border-color: var(--text3); color: var(--text3); }

  /* ── Checklist builder ───────────────────────────────────────── */
  .builder-item { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
  .type-chip { padding: 3px 9px; border-radius: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: .02em; }

  /* ── Barcode scanner ─────────────────────────────────────────── */
  .scanner-box { position: relative; width: 100%; max-width: 460px; margin: 0 auto; border-radius: 10px; overflow: hidden; background: #000; aspect-ratio: 4/3; }
  .scanner-box video { width: 100%; height: 100%; object-fit: cover; }
  .scan-frame { position: absolute; inset: 18% 8%; border: 2px solid rgba(255,255,255,.85); border-radius: 8px; box-shadow: 0 0 0 9999px rgba(0,0,0,.42); }
  .scan-line { position: absolute; left: 8%; right: 8%; height: 2px; background: #3fb950; box-shadow: 0 0 8px #3fb950; animation: scanmove 2s ease-in-out infinite; }
  @keyframes scanmove { 0%,100% { top: 20% } 50% { top: 78% } }

  .parts-table { width: 100%; border-collapse: collapse; }
  .parts-table th { background: var(--green3); color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 8px 10px; text-align: left; }
  .parts-table td { border-bottom: 1px solid var(--border); padding: 6px; }
  .parts-table input { padding: 6px 9px; font-size: 13px; }

  @media (max-width: 700px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    .modal { width: 100%; max-height: 94vh; }
  }
`;
