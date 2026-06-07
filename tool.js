/*
 * 存檔管理小工具 (SaveData Manager) — 簡易版
 * 由書籤注入目標網頁，給「不懂程式」的使用者管理該網站的存檔(localStorage)。
 * 只提供四個動作：備份、還原、匯出（換電腦）、匯入。不顯示原始資料內容。
 * 以 Shadow DOM 隔離 UI，避免與目標網頁的樣式衝突。
 */
(function () {
  'use strict';

  var VERSION = '1.2.0';

  if (window.__SDM__) { window.__SDM__.open(); return; }

  // 載入本檔的 script 網址（書籤注入時設的 src），用來回推教學首頁的位置。
  var SCRIPT_URL = (document.currentScript && document.currentScript.src) || '';
  var HOME_URL = '';
  try { if (SCRIPT_URL) HOME_URL = new URL('.', SCRIPT_URL).href; } catch (e) {}

  try { console.log('%c存檔管理工具 v' + VERSION, 'color:#38bdf8;font-weight:bold'); } catch (e) {}

  var DB_NAME = 'SaveDataManager';
  var STORE = 'backups';
  var ORIGIN = location.origin;

  /* ---------- 存檔(localStorage) ---------- */

  function snapshot() {
    var o = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      o[k] = localStorage.getItem(k);
    }
    return o;
  }

  function applyData(data) {
    localStorage.clear();
    Object.keys(data).forEach(function (k) { localStorage.setItem(k, data[k]); });
  }

  function dataCount(data) { return Object.keys(data).length; }

  /* ---------- 備份儲存(IndexedDB) ---------- */

  function openDB() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var st = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          st.createIndex('origin', 'origin', { unique: false });
        }
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function addBackup(rec) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var r = db.transaction(STORE, 'readwrite').objectStore(STORE).add(rec);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  // 以原本的 id 覆蓋整筆備份（用來把某一份更新成目前的存檔）。
  function putBackup(rec) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function listBackups() {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).index('origin').getAll(ORIGIN);
        req.onsuccess = function () {
          res((req.result || []).sort(function (a, b) { return b.createdAt - a.createdAt; }));
        };
        req.onerror = function () { rej(req.error); };
      });
    });
  }

  function deleteBackup(id) {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        var r = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
        r.onsuccess = function () { res(); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  // 在做覆蓋性動作前，自動把目前存檔備份起來，方便還原。
  function autoBackup() {
    var data = snapshot();
    if (!dataCount(data)) return Promise.resolve();
    return addBackup({ name: '自動備份（操作前）', origin: ORIGIN, createdAt: Date.now(), data: data, auto: true });
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
  // 把多筆備份打包成可攜檔案。
  function exportBackupsPayload(backups) {
    return JSON.stringify({
      type: 'savedata-manager-backups', version: 1, origin: ORIGIN,
      exportedAt: new Date().toISOString(), count: backups.length,
      backups: backups.map(function (b) {
        return { name: b.name, createdAt: b.createdAt, data: b.data, auto: !!b.auto };
      })
    }, null, 2);
  }
  // 解析匯入檔，回傳備份陣列。
  function parseBackups(text) {
    var obj = JSON.parse(text);
    if (obj && obj.type === 'savedata-manager-backups' && Array.isArray(obj.backups)) return obj.backups;
    throw new Error('檔案格式不對');
  }

  /* ---------- UI ---------- */

  var host = document.createElement('div');
  host.id = '__sdm_host__';
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
    '.tabs{display:flex;background:#1e293b;border-bottom:1px solid #334155;}' +
    '.tab{flex:1;padding:13px 6px;text-align:center;cursor:pointer;font-size:.92rem;font-weight:700;color:#94a3b8;border-bottom:2px solid transparent;}' +
    '.tab:hover{color:#cbd5e1;}' +
    '.tab.on{color:#38bdf8;border-bottom-color:#38bdf8;background:#0f172a;}' +
    '.body{flex:1;overflow-y:auto;padding:18px;}' +
    '.sec{display:none;}' +
    '.sec.on{display:block;}' +
    '.grp-title{font-size:.8rem;color:#64748b;font-weight:700;letter-spacing:.04em;margin:0 0 10px;text-transform:uppercase;}' +
    '.hint{font-size:.82rem;color:#94a3b8;line-height:1.7;margin:0 0 16px;background:#1e293b;border-radius:10px;padding:12px 14px;}' +
    '.big{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:none;border-radius:12px;padding:15px 16px;' +
      'font-size:1rem;font-weight:700;cursor:pointer;margin-bottom:10px;color:#fff;transition:filter .12s;}' +
    '.big:hover{filter:brightness(1.1);}' +
    '.big .ic{font-size:1.5rem;line-height:1;}' +
    '.big .sub{display:block;font-size:.76rem;font-weight:400;opacity:.85;margin-top:2px;}' +
    '.big.green{background:#16a34a;}' +
    '.big.blue{background:#0284c7;}' +
    '.big.slate{background:#334155;}' +
    '.namebox{display:flex;gap:8px;margin-bottom:10px;}' +
    '.namebox input{flex:1;background:#0b1120;color:#e2e8f0;border:1px solid #334155;border-radius:10px;padding:11px 12px;font-size:.9rem;}' +
    '.divider{height:1px;background:#334155;margin:22px 0;}' +
    '.bk{display:flex;align-items:center;gap:10px;border:1px solid #334155;border-radius:12px;padding:12px 14px;margin-bottom:10px;background:#1e293b;}' +
    '.bk .info{flex:1;min-width:0;}' +
    '.bk .bn{font-weight:700;font-size:.95rem;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.bk .bm{font-size:.74rem;color:#94a3b8;margin-top:3px;}' +
    '.bk button{border:none;border-radius:8px;padding:9px 12px;font-size:.84rem;font-weight:700;cursor:pointer;}' +
    '.autobox{margin-top:18px;border:1px solid #334155;border-radius:12px;background:#161f30;overflow:hidden;}' +
    '.autobox>summary{cursor:pointer;padding:12px 14px;font-size:.86rem;font-weight:700;color:#94a3b8;list-style:none;user-select:none;display:flex;align-items:center;gap:8px;}' +
    '.autobox>summary::-webkit-details-marker{display:none;}' +
    '.autobox>summary::before{content:"▸";color:#64748b;}' +
    '.autobox[open]>summary::before{content:"▾";}' +
    '.autobox .inner{padding:0 12px 12px;}' +
    '.autobox .ahint{font-size:.75rem;color:#64748b;margin:0 0 10px;line-height:1.6;}' +
    '.clearauto{margin-left:auto;background:#273449;color:#fca5a5;border:1px solid #3f2a30;border-radius:7px;padding:5px 10px;font-size:.76rem;font-weight:700;cursor:pointer;}' +
    '.clearauto:hover{background:#7f1d1d;color:#fff;border-color:#7f1d1d;}' +
    '.bk .restore{background:#0284c7;color:#fff;}' +          /* 還原＝藍色 */
    '.bk .overwrite{background:#16a34a;color:#fff;}' +        /* 備份至此＝綠色，與「立即備份」同色 */
    '.bk .restore:hover,.bk .overwrite:hover{filter:brightness(1.1);}' +
    '.bk .del{background:#273449;color:#fca5a5;font-size:1rem;padding:9px 11px;}' +
    '.bk .del:hover{background:#7f1d1d;color:#fff;}' +
    '.empty{text-align:center;color:#64748b;padding:26px 10px;font-size:.88rem;line-height:1.7;}' +
    '.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;font-weight:700;' +
      'padding:11px 18px;border-radius:10px;z-index:3;opacity:0;transition:opacity .2s;font-size:.88rem;max-width:90%;text-align:center;}' +
    '.toast.show{opacity:1;}' +
    '.toast.err{background:#ef4444;}' +
    '</style>' +
    '<div class="overlay" data-close></div>' +
    '<div class="panel">' +
      '<div class="hd">' +
        '<div class="ttl">💾 存檔管理<span class="ver"></span><span class="org"></span></div>' +
        '<a class="home" target="_blank" rel="noopener" title="開啟說明 / 首頁">🏠 首頁</a>' +
        '<button class="x" data-close title="關閉">✕</button>' +
      '</div>' +
      '<div class="tabs">' +
        '<div class="tab on" data-tab="backup">💾 備份</div>' +
        '<div class="tab" data-tab="io">🔄 匯出 / 匯入</div>' +
      '</div>' +
      '<div class="body">' +

        '<div class="sec on" data-sec="backup">' +
          '<div class="grp-title">備份目前存檔</div>' +
          '<div class="namebox">' +
            '<input type="text" id="bkName" placeholder="取個名字（選填，例如：通關前）">' +
          '</div>' +
          '<button class="big green" id="doBackup"><span class="ic">💾</span><span>立即備份<span class="sub">把現在的存檔存起來，之後可以還原</span></span></button>' +
          '<div class="divider"></div>' +
          '<div class="grp-title">我的備份</div>' +
          '<div id="bkList"></div>' +
          '<details class="autobox" id="autoWrap" style="display:none">' +
            '<summary>🛟 自動備份 <span id="autoCount" style="color:#64748b;font-weight:400"></span>' +
              '<button id="clearAuto" class="clearauto">🗑 清空</button>' +
            '</summary>' +
            '<div class="inner">' +
              '<p class="ahint">還原 / 匯入前系統自動存的存檔，萬一要回復可以用，不會跟著匯出。</p>' +
              '<div id="autoList"></div>' +
            '</div>' +
          '</details>' +
        '</div>' +

        '<div class="sec" data-sec="io">' +
          '<div class="hint">把這台電腦的<b>所有備份</b>打包成一個檔案帶走；到另一台電腦匯入後，備份清單就會一起出現。要套用某一份，再到「💾 備份」分頁按「還原」。</div>' +
          '<button class="big blue" id="doExport"><span class="ic">📤</span><span>匯出所有備份<span class="sub">下載成一個檔案，帶到別台電腦</span></span></button>' +
          '<button class="big slate" id="doImport"><span class="ic">📥</span><span>從檔案匯入<span class="sub">讀取備份檔，加進備份清單</span></span></button>' +
          '<input type="file" id="fileInput" accept=".json,application/json" style="display:none">' +
        '</div>' +

      '</div>' +
    '</div>' +
    '<div class="toast" id="toast"></div>';

  var $ = function (s) { return root.querySelector(s); };
  $('.ver').textContent = 'v' + VERSION;
  $('.org').textContent = ORIGIN.replace(/^https?:\/\//, '');

  // 首頁連結：用 script 來源回推；取不到就把按鈕藏起來。
  var homeLink = $('.home');
  if (HOME_URL) homeLink.href = HOME_URL;
  else homeLink.style.display = 'none';

  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    if (toastTimer) clearTimeout(toastTimer);   // 清掉前一次的計時器，避免連點時提早關閉/閃爍
    // 只移除 show 觸發淡出；保留 err 顏色，避免淡出途中變回綠色
    toastTimer = setTimeout(function () { t.classList.remove('show'); toastTimer = null; }, 2000);
  }

  // 改完存檔後重新整理頁面，目標網頁才會重新讀取新的存檔。
  function finishAndReload(msg) {
    toast(msg);
    setTimeout(function () { location.reload(); }, 700);
  }

  root.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', close); });

  /* ---- 分頁切換 ---- */
  root.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      root.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('on'); });
      root.querySelectorAll('.sec').forEach(function (s) { s.classList.remove('on'); });
      tab.classList.add('on');
      $('[data-sec="' + tab.dataset.tab + '"]').classList.add('on');
    });
  });

  /* ---- 備份 ---- */
  $('#doBackup').addEventListener('click', function () {
    var data = snapshot();
    if (!dataCount(data)) { toast('目前沒有存檔可以備份', true); return; }
    var name = $('#bkName').value.trim() || ('備份 ' + fmtTime(Date.now()));
    addBackup({ name: name, origin: ORIGIN, createdAt: Date.now(), data: data })
      .then(function () { $('#bkName').value = ''; renderBackups(); toast('✓ 已備份：' + name); })
      .catch(function (e) { toast('備份失敗：' + (e && e.message || e), true); });
  });

  /* ---- 清空自動備份 ---- */
  $('#clearAuto').addEventListener('click', function (ev) {
    ev.preventDefault();      // 避免點按鈕時觸發 <details> 的展開/收合
    ev.stopPropagation();
    listBackups().then(function (rows) {
      var autos = rows.filter(function (r) { return r.auto; });
      if (!autos.length) { toast('沒有自動備份可清空', true); return; }
      if (!confirm('要清空全部 ' + autos.length + ' 筆自動備份嗎？\n（不影響你手動建立的備份）')) return;
      Promise.all(autos.map(function (r) { return deleteBackup(r.id); }))
        .then(function () { renderBackups(); toast('✓ 已清空自動備份'); })
        .catch(function (e) { toast('清空失敗：' + (e && e.message || e), true); });
    });
  });

  /* ---- 匯出（只帶手動備份，不含自動備份） ---- */
  $('#doExport').addEventListener('click', function () {
    listBackups().then(function (rows) {
      var manual = rows.filter(function (r) { return !r.auto; });
      if (!manual.length) { toast('還沒有任何備份，請先到「備份」分頁建立', true); return; }
      var name = ORIGIN.replace(/^https?:\/\//, '').replace(/[^\w.-]/g, '_');
      download('存檔備份_' + name + '_' + fmtTime(Date.now()).replace(/[\/: ]/g, '') + '.json', exportBackupsPayload(manual));
      toast('✓ 已下載 ' + manual.length + ' 筆備份');
    });
  });

  /* ---- 匯入（加進備份清單） ---- */
  $('#doImport').addEventListener('click', function () { $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var backups;
      try { backups = parseBackups(reader.result); }
      catch (err) { toast('匯入失敗：' + err.message, true); e.target.value = ''; return; }
      e.target.value = '';
      if (!backups.length) { toast('檔案裡沒有備份', true); return; }
      // 以「名稱＋時間」比對，跳過清單裡已存在的備份，避免重複。
      listBackups().then(function (existing) {
        var seen = {};
        existing.forEach(function (b) { seen[b.name + '|' + b.createdAt] = true; });
        var toAdd = backups.filter(function (b) { return !seen[(b.name || '') + '|' + b.createdAt]; });
        if (!toAdd.length) { toast('這些備份已經都在清單裡了'); return; }
        var chain = Promise.resolve();
        toAdd.forEach(function (b) {
          chain = chain.then(function () {
            return addBackup({ name: b.name || '匯入的存檔', origin: ORIGIN, createdAt: b.createdAt || Date.now(), data: b.data || {} });
          });
        });
        chain.then(function () {
          renderBackups();
          $('.tab[data-tab="backup"]').click();
          toast('✓ 已匯入 ' + toAdd.length + ' 筆備份到清單');
        }).catch(function (err) { toast('匯入失敗：' + (err && err.message || err), true); });
      });
    };
    reader.readAsText(f);
  });

  /* ---- 備份清單 ---- */
  function makeCard(r) {
    var card = document.createElement('div');
    card.className = 'bk';

    var info = document.createElement('div');
    info.className = 'info';
    var bn = document.createElement('div');
    bn.className = 'bn';
    bn.textContent = r.name || '(未命名)';
    var bm = document.createElement('div');
    bm.className = 'bm';
    bm.textContent = fmtTime(r.createdAt) + ' · ' + dataCount(r.data || {}) + ' 項';
    info.appendChild(bn); info.appendChild(bm);

    var restore = document.createElement('button');
    restore.className = 'restore'; restore.textContent = '還原';
    restore.addEventListener('click', function () {
      if (!confirm('要還原「' + (r.name || '此備份') + '」嗎？\n目前的存檔會被它取代。\n（系統會自動先幫你備份目前的存檔）\n\n完成後會「重新整理頁面」，網站才會讀到還原的存檔。')) return;
      autoBackup().then(function () {
        applyData(r.data || {});
        finishAndReload('✓ 已還原，正在重新整理…');
      });
    });

    var del = document.createElement('button');
    del.className = 'del'; del.textContent = '🗑'; del.title = '刪除這個備份';
    del.addEventListener('click', function () {
      if (!confirm('刪除備份「' + (r.name || '') + '」？')) return;
      deleteBackup(r.id).then(function () { renderBackups(); toast('已刪除備份'); });
    });

    card.appendChild(info);
    // 自動備份不提供覆蓋（它本來就是系統暫存用）。
    if (!r.auto) {
      var overwrite = document.createElement('button');
      overwrite.className = 'overwrite'; overwrite.textContent = '備份至此';
      overwrite.title = '把目前的存檔備份到這一格（取代原內容）';
      overwrite.addEventListener('click', function () {
        var data = snapshot();
        if (!dataCount(data)) { toast('目前沒有存檔可以覆蓋', true); return; }
        if (!confirm('要把「目前的存檔」備份到「' + (r.name || '此備份') + '」這一格嗎？\n這份備份原本的內容會被取代，無法復原。')) return;
        putBackup({ id: r.id, name: r.name, origin: ORIGIN, createdAt: Date.now(), data: data })
          .then(function () { renderBackups(); toast('✓ 已備份至此：' + (r.name || '此備份')); })
          .catch(function (e) { toast('備份失敗：' + (e && e.message || e), true); });
      });
      card.appendChild(overwrite);
    }
    card.appendChild(restore); card.appendChild(del);
    return card;
  }

  function renderBackups() {
    var list = $('#bkList');
    list.innerHTML = '<div class="empty">讀取中…</div>';
    listBackups().then(function (rows) {
      var manual = rows.filter(function (r) { return !r.auto; });
      var autos = rows.filter(function (r) { return r.auto; });

      list.innerHTML = '';
      if (!manual.length) {
        list.innerHTML = '<div class="empty">還沒有任何備份。<br>按上面的「💾 立即備份」就會出現在這裡。</div>';
      } else {
        manual.forEach(function (r) { list.appendChild(makeCard(r)); });
      }

      var wrap = $('#autoWrap'), autoList = $('#autoList');
      if (autos.length) {
        wrap.style.display = '';
        $('#autoCount').textContent = '（' + autos.length + '）';
        autoList.innerHTML = '';
        autos.forEach(function (r) { autoList.appendChild(makeCard(r)); });
      } else {
        wrap.style.display = 'none';
      }
    }).catch(function (e) {
      list.innerHTML = '<div class="empty">讀取失敗：' + (e && e.message || e) + '</div>';
    });
  }

  /* ---- 對外控制 ---- */
  function open() { host.style.display = ''; renderBackups(); }
  function close() { host.style.display = 'none'; }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && host.style.display !== 'none') close();
  });

  window.__SDM__ = { open: open, close: close };

  renderBackups();
})();
