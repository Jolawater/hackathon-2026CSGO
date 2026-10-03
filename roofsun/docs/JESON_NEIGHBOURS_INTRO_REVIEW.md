# JESON：四周鄰屋與介紹首屏改版

基線：Jim's-RoofSun-HK `a05e5ad`。目標分支：**JESON**。只在獨立工作區改 `roofsun/`，保留 JESON 原有 battery-lab 等檔案。沒有推送或改動 Jim 分支。

## 已實作

| 項目 | 行為與主要檔案 |
|---|---|
| A 四周鄰屋 | `backend/screening.py`、`Screening.jsx`：1–3 棟、八方向、相對正門提示、0 層代表沒有遮擋；各立面 12 扇區取最大仰角。`RoofScene3D.jsx`：各方向的樓體、懸停文字與陰影範圍。 |
| A 舊資料 | `ownerArchive.js`、`import_owner()`、Pydantic before validator：舊 `neighbour` 轉成正南 `neighbours`，保留層數與距離。新列表存在時優先使用新列表，無效舊欄位仍報錯。 |
| A 依據 | `Evidence.jsx`、`owner_assumptions.json`：鄰屋都高一層敏感性、等高立面簡化，以及香港夏季北面日照的說明。15 層已在输入上限時不再上調。 |
| B 介紹 | `Intro.jsx`：中英文 slogan、三個跳轉／示例按鈕、三步說明、約 2.3 KB inline SVG、一次性太陽動畫。信任條限定模型 FiT 檔位至不超過 10 kW，不聲稱已驗證實際發電準確率。 |
| E 計算 | `backend/app.py`：非阻塞背景預熱三組獨立示例（開闊＝預設，不重複算兩次），連同 evaluate 結果快取並常駐三例，避免一般 LRU 淘汰；`useScreenApi.js`：同一畫面至多一個 screen 請求，後續修改只保留最新一組。 |
| E 等待與 3D | `CalculationWait.jsx`：真實經過秒數和骨架；`DeferredScene.jsx`：300 px 預載範圍；`RoofScene3D.jsx`：離屏或 document.hidden 停止 rAF，回來恢復。 |
| C 章節 | `main.jsx`、`SectionNav.jsx`：介紹→輸入→結論→排布→回本→證據；每月發電移到右欄；費用／延遲／荷載說明集中；3D 長說明折疊。手機保留開始／語言鈕並提供結果捷徑。 |
| D 美化 | `style.css`、`motion.js`、`AnimatedNumber.jsx`：統一卡片、暖色重點、章節間距、一次 reveal、數字 500 ms 過渡及圖表 600 ms 入場。reduced-motion 關閉動畫，沒有新增套件／字型。 |

原始物理與財務檔案 `backend/model.py`、`finance.py`、`decision.py`、`reliability.py`、`reference.py` 與基線相同。模型版本保留 3.1.0；以本次 Git 提交識別介面與輸入適配層的改版。

## 驗收與實測

測試環境：Windows、Python 3.12、Node 24、Playwright／Edge、本機 HTTP。這些是本機驗收結果，不代表 Cloudflare 公網延遲。

| 驗收 | 結果 |
|---|---|
| Python 後端 | 96 項通過；舊南面 horizon 精確回歸、東面峰值、最大值合併、方向／數量限制、舊匯入均涵蓋。 |
| 模型報告 | `scripts/validate.py`：16 項檢查、3 個全年參考案例、3 年氣象資料通過；`data/validation.json` 已重新產生。 |
| 瀏覽器端到端 | `npm run test:browser` 通過原功能完整回歸及 33 項改版專項檢查（見實測 JSON）。 |
| 前端 build | 通過；既有 three 大型 chunk 提示仍在，3D 延後載入。 |
| 啟動預熱 | 三例分別 3.146、2.130、5.079 秒；總計約 10.36 秒，背景執行。 |
| 快取 API | 三例 screen 實測 12、9、8 ms；各 evaluate 低於 1 秒。 |
| 示例點擊到結果 | 南面高樓 511 ms、兩邊夾巷 502 ms、開闊天台 488 ms。 |
| 桌面首屏 | 1440×900：按鈕底部 y=539、信任條底部 y=580、下一節頂部 y=833；首屏沒有 canvas。 |
| SVG | 瀏覽器序列化約 2,324 bytes，低於 8 KB。 |
| 右欄 | 再加一排與每月發電間距 18 px。 |
| 3D 離屏 | 700 ms 內新增渲染幀 0；模擬 document.hidden 亦停止。 |
| 請求合併 | 連續輸入 21000→22000→23000，實際只送 21000、23000；最大同時 screen 請求數 1。 |
| 舊資料 | 瀏覽器 2.5 層／7.5 m、v3 JSON 1.5 層／9 m 均保留並轉正南；沒有清空。 |
| 手機 | 375 px 中英無橫向溢出，簡化导航，結果進入視口時底部條隱藏。 |
| 動畫偏好 | reduced-motion 下 CSS 動畫和 smooth scroll 關閉，數字直接顯示最終值。 |
| 資源增量 | 同機基線與新版本 HTML 引用的首屏 JS/CSS，以 gzip level 9 統一比較：217,806 → 224,708 bytes，增加 **6,902 bytes**，低於 15 KB。既有字体資源相同；這是壓縮體積比較，未冒充實際公網傳輸實測。 |
| 依賴 | dependencies、devDependencies 與 a05e5ad 完全一致，沒有新中文 webfont。 |

`npm run test:browser` 執行原功能回歸 `scripts/browser-test.mjs` 和改版專項 `scripts/overhaul-test.mjs`。後者把實測 JSON 和截圖寫到 `ROOFSUN_TEST_OUTPUT`，實際速度每次可能略有差異。

```powershell
$env:PYTHONUTF8='1'
python -m pytest tests -q -p no:cacheprovider
npm run build
# 先另開終端啟動 uvicorn，等待 /api/health 的 warmup.status 為 ready
$env:ROOFSUN_TEST_URL='http://127.0.0.1:8000'
$env:ROOFSUN_BROWSER_CHANNEL='msedge' # 也可使用已安裝的 Playwright Chromium
$env:ROOFSUN_TEST_OUTPUT="$env:TEMP/roofsun-review"
npm run test:browser
```

`.gitattributes` 固定 NASA 氣象 CSV 為 LF，並把混合換行的原始 HKO 檔案標為不轉換，避免 Windows 自動換行破壞 SHA-256；沒有改氣象數值。

## 未能重現的指定數字

**[模擬]「東面 2 層、6 m 應減少 15–20%」沒有在指定基線重現。**

固定 `SevenInputs()` 映射出的預設條件和 2 排／15°／180° 配置，開闊天台 **6,659.9 kWh**；東面 2 層、6 m 為 **5,903.5 kWh**，減少 **11.3575%**。把原南面天際線旋轉到東面，使用原模型計算，亦得到相同結果。`tests/test_neighbours.py` 對此作回歸，並不是把 15–20% 說成已通過。

因此頁面沒有照抄「東西約為南面七成」為通則。這個比例會隨設定改變，保留高度、距離、方向的條件式說明。尚需隊友提供產生 17.3% 的完整輸入與版本才可追查差異；本次沒有為湊百分比修改物理參數。

## 限制與交付邊界

- 鄰屋仍是等高、120° 立面近似，最多三棟；3D 方塊為示意。陰影高亮來自模型樣本，不拿陰影貼圖當發電依據。
- 仍使用原模型天空可視因子的方向簡化，北面散射光影響未做實樓驗證。
- 三個啟動示例連同 evaluate 常駐；其他輸入的 lru_cache 有容量上限，長時間試算後可能被淘汰。預熱不代表所有自訂輸入永遠即時。
- 只提交程式及本機預覽，不更新隊友的 trycloudflare 部署，也沒有改成深圳／倫敦模型。
- 沒有新增真實用戶記錄、實樓發電量、模型準確率或回報保證。

## 三分鐘展示建議

1. 0:00–0:25：首屏說明幫村屋屋主在找安裝商前判斷報價與回本。
2. 0:25–1:05：套用開闊天台，再選兩邊夾巷；看結論與最高可接受報價如何改變。
3. 1:05–1:45：查看東西鄰屋與冬至播放，加一排對比發電、成本、遮擋、回本。
4. 1:45–2:20：现金流圖指出回本和 2033 年底 FiT 結束；解釋停用情景为何之後持平。
5. 2:20–3:00：打開假設／證據，區分氣象觀測、模型模擬、未驗證事項，展示可重現的匯出。

## 提交與回滾

基線匯入 `e1087a1`；A `82ad8de`；B `186be03`；E `1d818db`；C/D 與整合驗收為最後一個獨立提交。回滾先 revert 最後的 C/D 提交，再依需要按 E→B→A 逆序處理；不 force push，也不在 Jim 分支操作。C/D 的整合測試使用 A/B/E，所以跨項回滾後應重跑測試。
