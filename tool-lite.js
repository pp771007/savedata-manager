/*
 * 存檔快速搬移（SaveData Lite）— 精簡版
 * 由書籤注入目標網頁，把目前網站的存檔(localStorage)「整包匯出」成檔案 / 文字字串，
 * 或把匯出的檔案 / 字串「直接覆蓋」回來（覆蓋後自動重新整理）。
 * 不存任何備份、不用 IndexedDB；只做匯出與匯入兩件事。
 * 以 Shadow DOM 隔離 UI，避免與目標網頁的樣式衝突。
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';

  if (window.__SDL__) { window.__SDL__.open(); return; }

  // 載入本檔的 script 網址（書籤注入時設的 src），用來回推教學首頁的位置。
  var SCRIPT_URL = (document.currentScript && document.currentScript.src) || '';
  var HOME_URL = '';
  try { if (SCRIPT_URL) HOME_URL = new URL('.', SCRIPT_URL).href; } catch (e) {}

  try { console.log('%c存檔快速搬移 v' + VERSION, 'color:#38bdf8;font-weight:bold'); } catch (e) {}

  var ORIGIN = location.origin;
  var DUMP_TYPE = 'savedata-lite-dump';

  /* ---------- 存檔(localStorage) ---------- */

  function snapshot() {
    var o = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  }

  function dataCount(data) { return Object.keys(data).length; }

  // 整包覆蓋：清掉現有 localStorage，再寫入匯入的內容（匯入後狀態＝匯出當下）。
  // 寫入可能撞配額，中途失敗就回滾到動手前，再把錯誤往上丟給呼叫端報訊息。
  function overwriteData(data) {
    var prev = snapshot();
    Object.keys(prev).forEach(function (k) { localStorage.removeItem(k); });
    try {
      Object.keys(data).forEach(function (k) { localStorage.setItem(k, data[k]); });
    } catch (e) {
      // 回滾：清掉剛寫進去的，把原本的寫回（原本就塞得下，必定成功）。
      for (var i = localStorage.length - 1; i >= 0; i--) { localStorage.removeItem(localStorage.key(i)); }
      Object.keys(prev).forEach(function (k) { localStorage.setItem(k, prev[k]); });
      throw e;
    }
  }

  /* ---------- 小工具 ---------- */

  function fmtTime(ts) {
    var d = new Date(ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  // UTF-8 字串 ↔ base64：讓存檔可用一段文字搬運（複製 / 貼上）。
  function toB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function fromB64(b64) { return decodeURIComponent(escape(atob((b64 || '').replace(/\s+/g, '')))); }

  function exportPayload(data) {
    return JSON.stringify({
      type: DUMP_TYPE, version: 1, origin: ORIGIN,
      exportedAt: new Date().toISOString(), count: dataCount(data), data: data
    }, null, 2);
  }
  // 解析匯入內容，回傳存檔物件。
  function parseDump(text) {
    var obj = JSON.parse(text);
    if (obj && obj.type === DUMP_TYPE && obj.data && typeof obj.data === 'object') return obj.data;
    throw new Error('檔案格式不對');
  }

  function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError'
        || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || e.code === 22 || e.code === 1014;
  }

  /* ---------- UI ---------- */

  var host = document.createElement('div');
  host.id = '__sdl_host__';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  (document.body || document.documentElement).appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  root.innerHTML =
    '<style>' +
    ':host{all:initial;}' +
    '*{box-sizing:border-box;font-family:"Segoe UI","Microsoft JhengHei",system-ui,sans-serif;}' +
    '.overlay{position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:1;}' +
    '.panel{position:fixed;top:0;right:0;height:100vh;width:400px;max-width:100vw;background:#0f172a;color:#e2e8f0;' +
      'z-index:2;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.5);border-left:1px solid #334155;}' +
    '.hd{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid #334155;background:#1e293b;}' +
    '.hd .ttl{font-weight:800;font-size:1.1rem;flex:1;}' +
    '.hd .ver{font-size:.7rem;color:#64748b;font-weight:600;margin-left:6px;}' +
    '.hd .org{font-size:.72rem;color:#94a3b8;font-weight:400;display:block;margin-top:2px;word-break:break-all;}' +
    '.hd .home{display:inline-flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;' +
      'background:#273449;border:1px solid #334155;color:#cbd5e1;border-radius:8px;cursor:pointer;height:36px;padding:0 11px;font-size:.82rem;font-weight:700;}' +
    '.hd .home:hover{background:#334155;color:#fff;}' +
    '.x{background:#273449;border:1px solid #334155;color:#e2e8f0;border-radius:8px;cursor:pointer;width:36px;height:36px;font-size:1.15rem;}' +
    '.x:hover{background:#334155;}' +
    '.body{flex:1;overflow-y:auto;padding:18px;}' +
    '.grp-title{font-size:.8rem;color:#64748b;font-weight:700;letter-spacing:.04em;margin:0 0 10px;text-transform:uppercase;}' +
    '.hint{font-size:.82rem;color:#94a3b8;line-height:1.7;margin:0 0 16px;background:#1e293b;border-radius:10px;padding:12px 14px;}' +
    '.hint.warn{color:#fcd34d;background:#2a2410;border:1px solid #3f3a1a;}' +
    '.big{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:none;border-radius:12px;padding:15px 16px;' +
      'font-size:1rem;font-weight:700;cursor:pointer;margin-bottom:10px;color:#fff;transition:filter .12s;}' +
    '.big:hover{filter:brightness(1.1);}' +
    '.big .ic{font-size:1.5rem;line-height:1;}' +
    '.big .sub{display:block;font-size:.76rem;font-weight:400;opacity:.85;margin-top:2px;}' +
    '.big.green{background:#16a34a;}' +
    '.big.blue{background:#0284c7;}' +
    '.big.slate{background:#334155;}' +
    '.divider{height:1px;background:#334155;margin:22px 0;}' +
    '.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;font-weight:700;' +
      'padding:11px 18px;border-radius:10px;z-index:3;opacity:0;transition:opacity .2s;font-size:.88rem;max-width:90%;text-align:center;}' +
    '.toast.show{opacity:1;}' +
    '.toast.err{background:#ef4444;}' +
    '</style>' +
    '<div class="overlay" data-close></div>' +
    '<div class="panel">' +
      '<div class="hd">' +
        '<div class="ttl">📦 存檔快速搬移<span class="ver"></span><span class="org"></span></div>' +
        '<a class="home" target="_blank" rel="noopener" title="開啟說明 / 首頁">🏠 首頁</a>' +
        '<button class="x" data-close title="關閉">✕</button>' +
      '</div>' +
      '<div class="body">' +
        '<div class="grp-title">匯出（把這個網站的存檔帶走）</div>' +
        '<div class="hint">把目前網站的<b>整包存檔</b>打包帶到別台電腦：可下載成檔案，或複製成一段文字。</div>' +
        '<button class="big blue" id="doExport"><span class="ic">📤</span><span>匯出成檔案<span class="sub">下載成一個檔案，帶到別台電腦</span></span></button>' +
        '<button class="big blue" id="doCopy"><span class="ic">📋</span><span>複製成文字字串<span class="sub">變成一段文字，貼到雲端筆記 / 通訊軟體帶走</span></span></button>' +
        '<input type="file" id="fileInput" accept=".json,application/json" style="display:none">' +

        '<div class="divider"></div>' +

        '<div class="grp-title">匯入（直接覆蓋目前存檔）</div>' +
        '<div class="hint warn">⚠️ 匯入會用帶進來的存檔<b>整包覆蓋</b>目前網站的存檔（原本的會被取代），完成後<b>自動重新整理頁面</b>。</div>' +
        '<button class="big green" id="doImport"><span class="ic">📥</span><span>從檔案匯入<span class="sub">讀取存檔檔案，覆蓋目前存檔</span></span></button>' +
        '<button class="big slate" id="doPasteImport"><span class="ic">📝</span><span>貼上字串匯入<span class="sub">把另一台複製的文字貼進來覆蓋</span></span></button>' +
        '<textarea id="ioText" placeholder="把存檔字串貼在這裡（貼上後會自動匯入）" style="display:none;width:100%;height:90px;margin-top:10px;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:8px;font-size:.78rem;font-family:monospace;resize:vertical;"></textarea>' +
      '</div>' +
    '</div>' +
    '<div class="toast" id="toast"></div>';

  var $ = function (s) { return root.querySelector(s); };
  $('.ver').textContent = 'v' + VERSION;
  $('.org').textContent = ORIGIN.replace(/^https?:\/\//, '');

  var homeLink = $('.home');
  if (HOME_URL) homeLink.href = HOME_URL;
  else homeLink.style.display = 'none';

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); toastTimer = null; }, 2000);
  }

  // 改完存檔後重新整理頁面，目標網頁才會重新讀取新的存檔。
  function finishAndReload(msg) {
    toast(msg);
    setTimeout(function () { location.reload(); }, 700);
  }

  function close() { host.style.display = 'none'; }
  root.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', close); });

  /* ---- 匯出成檔案 ---- */
  $('#doExport').addEventListener('click', function () {
    var data = snapshot();
    if (!dataCount(data)) { toast('目前這個網站沒有存檔可以匯出', true); return; }
    var name = ORIGIN.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_');
    download('存檔_' + name + '_' + fmtTime(Date.now()).replace(/[\/: ]/g, '') + '.json', exportPayload(data));
    toast('✓ 已下載存檔（' + dataCount(data) + ' 項）');
  });

  /* ---- 複製成文字字串 ---- */
  $('#doCopy').addEventListener('click', function () {
    var data = snapshot();
    if (!dataCount(data)) { toast('目前這個網站沒有存檔可以匯出', true); return; }
    var s = toB64(exportPayload(data));
    var ta = $('#ioText');
    ta.style.display = 'block'; ta.value = s; ta.focus(); ta.select();
    var ok = function () { toast('✓ 已複製存檔字串到剪貼簿（' + dataCount(data) + ' 項）'); };
    var manualHint = function () { toast('✓ 已產生字串（已選取，請按 Ctrl+C 手動複製）'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(ok, manualHint);
    } else { manualHint(); }
  });

  /* ---- 匯入共用：直接覆蓋、重新整理 ---- */
  function doOverwrite(data) {
    if (!confirm('要用匯入的存檔覆蓋「目前網站」的存檔嗎？\n（' + dataCount(data) + ' 項，目前的存檔會被取代、無法復原）\n\n完成後會「重新整理頁面」。')) return;
    try {
      overwriteData(data);
    } catch (e) {
      if (isQuotaError(e)) toast('這份存檔太大，超過瀏覽器容量上限，已取消', true);
      else toast('匯入失敗：' + (e && e.message || e), true);
      return;
    }
    finishAndReload('✓ 已覆蓋，正在重新整理…');
  }

  /* ---- 從檔案匯入 ---- */
  $('#doImport').addEventListener('click', function () { $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', function (e) {
    // 先抓住 input 元素；reader.onload 是非同步觸發，屆時 e.target 可能已變 null。
    var input = e.target;
    var f = input.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = parseDump(reader.result); }
      catch (err) { toast('匯入失敗：' + err.message, true); input.value = ''; return; }
      input.value = '';
      doOverwrite(data);
    };
    reader.readAsText(f);
  });

  /* ---- 貼上字串匯入 ---- */
  $('#doPasteImport').addEventListener('click', function () {
    var ta = $('#ioText');
    ta.style.display = 'block'; ta.value = ''; ta.focus();
    toast('把另一台複製的字串貼到下方框框（貼上後會自動匯入）');
  });
  function importFromText(text) {
    var data;
    try { data = parseDump(fromB64(text)); }
    catch (err) { toast('字串無法解析，請確認有完整貼上', true); return; }
    var ta = $('#ioText'); ta.value = ''; ta.style.display = 'none';
    doOverwrite(data);
  }
  $('#ioText').addEventListener('paste', function () {
    var ta = this;
    setTimeout(function () { if (ta.value.trim()) importFromText(ta.value); }, 0);
  });

  /* ---- 對外控制 ---- */
  function open() { host.style.display = ''; }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && host.style.display !== 'none') close();
  });

  window.__SDL__ = { open: open, close: close };
})();
