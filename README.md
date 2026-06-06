<div align="center">

# 💾 存檔管理小工具

**書籤式存檔管理工具** — 在任何網站備份 / 還原 `localStorage`，並可跨裝置匯出匯入。<br>
純前端執行，**不上傳任何資料、無後端**。

<br>

[![前往線上頁面](https://img.shields.io/badge/🔗%20前往線上頁面-pp771007.github.io%2Fsavedata--manager-38bdf8?style=for-the-badge)](https://pp771007.github.io/savedata-manager/)

![version](https://img.shields.io/badge/version-1.0.0-22c55e?style=flat-square)
![tech](https://img.shields.io/badge/Vanilla_JS-無框架-f7df1e?style=flat-square)
![storage](https://img.shields.io/badge/IndexedDB%20%2B%20localStorage-儲存-0284c7?style=flat-square)
![privacy](https://img.shields.io/badge/隱私-不上傳資料-16a34a?style=flat-square)

</div>

---

## ✨ 功能

工具面板分成兩個分頁：

| 分頁 | 功能 |
|------|------|
| 💾 **備份** | 把目前存檔存成具名快照（存在 IndexedDB），可存多份；一鍵**還原**任一份（還原後自動重新整理頁面，存檔才生效）。 |
| 🔄 **匯出 / 匯入** | 把這台電腦的**所有手動備份**打包成一個 JSON 檔下載，帶到另一台電腦匯入，備份清單就一起出現 —— 用於**跨裝置**。 |

> 🛟 **自動保護**：還原 / 匯入前會自動先備份目前存檔，收在獨立的「自動備份」區，可一鍵清空，且**不會跟著匯出**。

工具不顯示原始資料內容，介面對非技術使用者友善。

## 🚀 立即使用

👉 **開啟 [線上頁面](https://pp771007.github.io/savedata-manager/)，把書籤拖到瀏覽器書籤列即可。**

之後在任何網站點一下書籤，右側就會滑出管理視窗。

## 📂 檔案結構

| 檔案 | 說明 |
|------|------|
| `index.html` | GitHub Pages 首頁：安裝書籤（拖曳 / 複製）＋ 新手教學 |
| `tool.js` | 真正的管理工具，由書籤動態載入並注入目標網頁 |
| `README.md` | 本說明 |

書籤採「載入器（loader）」模式：書籤本身只是一小段程式碼，點擊時即時從本站抓取最新的 `tool.js`，所以**工具更新後不需要重裝書籤**。`index.html` 會依目前網址自動產生指向正確 `tool.js` 的書籤，部署到任何網域都不用改網址。

## 🛠️ 本機測試

書籤需要從 `http(s)` 載入 `tool.js`，用簡單的本機伺服器測試：

```bash
python -m http.server 8000
```

開啟 `http://localhost:8000/`，安裝書籤後，到任一網站點擊即可。

## 📦 部署到 GitHub Pages

到 repo 的 **Settings → Pages**，把 Source 設為 `main` 分支、根目錄 `/`，幾分鐘後即可透過 `https://<帳號>.github.io/<repo>/` 開啟。

## ⚠️ 注意事項

- 部分網站有嚴格的 **內容安全政策（CSP）**，可能阻擋外部腳本載入，書籤在這類網站上會失效（會跳出提示）。
- IndexedDB 備份只存在**本機**；換裝置請用「匯出所有備份」帶走檔案，再到另一台「從檔案匯入」，然後按「還原」套用。
- 匯出**只包含手動建立的備份**，自動備份不會被帶走。
- `localStorage`、IndexedDB 都是**依網站來源（origin）區隔**的，工具只會處理你目前所在網站的資料。
- 匯入只接受本工具的備份檔（`type: savedata-manager-backups`）。

## 🏷️ 版本

版本號定義在 `tool.js` 最上方的 `VERSION` 常數，會顯示在面板標題、並輸出到瀏覽器 Console（方便回報問題時告知版本）。更新功能時請一併調整，建議採[語意化版本](https://semver.org/lang/zh-TW/)。

- **v1.0.0** — 首個版本：備份 / 還原、匯出 / 匯入所有備份、自動備份保護、分頁介面。

<div align="center">
<sub>純在你的瀏覽器運作 · 不收集、不上傳任何資料</sub>
</div>
