# 契約修訂提案：Arcana 登入與 token 輪替（1.0.0 草案，尚未實作）

- 提案方：Claude（ManaBrew 衍生專案）
- 審查：Codex（gpt-6.1-sol，唯讀審查 Arcana 原始碼後同意方向並補充細節）
- 對象：`/home/likuanxun/MTG/docs/arcana-manabrew-api-contract.md` v0.1.0
- 狀態：使用者已決定 §11 事項，已轉交 Codex 修訂契約；雙方確認前都不實作
- 版本：認證屬破壞性變更，依契約 §6 升 major，標為 `1.0.0 草案／尚未實作`。版本號不代表已部署。

## 1. 為什麼要改

1. **v0.1 沒處理 ManaBrew 帳號從哪來。** 使用者決定朋友最終以 Arcana 帳密登入 ManaBrew，但 Hub 目前只有 GitHub、Discord、email 三種登入。
2. **24 小時 token、過期重新連結，會讓背景同步每天中斷。**

## 2. 決定採用的方向

以 **OAuth 2.0 Authorization Code + PKCE（S256）** 取代一次性連結碼，一次授權同時完成「登入 ManaBrew」與「授權 Hub 讀取資料」。

- Hub 是 confidential client，第一版只支援 `client_secret_basic`。
- token 為 opaque，並採 refresh rotation。
- Arcana 是 OAuth 發行端，也是唯一的資源驗證端。
- Hub 帳號與 session 仍由 Hub 自己管理。
- 不宣稱支援 OIDC。
- 連結碼與 `/link/exchange` 直接移除，`DELETE /link` 由 `/oauth/revoke` 取代。v0.1 尚未實作，沒有相容負擔。

## 3. 流程

1. 使用者在 ManaBrew 按「用 Arcana 登入」。Hub 產生以下三項後，302 導向 Arcana `GET /oauth/authorize`：
   - `state`：高熵、單次使用、綁定發起的瀏覽器。
   - PKCE verifier 與 S256 challenge。
   - 固定的 `redirect_uri`。
2. Arcana 驗證 client、`redirect_uri` 完全比對、scope 白名單。
   - client 或 `redirect_uri` 無效時，在 Arcana 本地報錯，不重導。
   - 使用者未登入時，先走 Arcana 登入；授權請求存在服務端，登入後恢復，不接受任意 `next` URL。
   - 已登入則顯示同意頁。
3. 同意頁只在 GET 顯示。使用者同意或拒絕都以 `POST /oauth/authorize` 送出，並套用：
   - CSRF 與 Origin 檢查；
   - 綁定當前使用者，以及服務端保存的原始請求（不信任表單重送的 scope 或 `redirect_uri`）；
   - `frame-ancestors 'none'`、`X-Frame-Options: DENY`、`Cache-Control: no-store`、`Referrer-Policy: no-referrer`。
4. Arcana 302 回 Hub callback，帶 `code`、`state`、`iss`。拒絕時帶 `error=access_denied`。
   - `code` 60 秒、單次使用。
   - `code` 綁定 client、完整 `redirect_uri`、subject、scope、challenge。
5. Hub 驗證 `state` 與 `iss` 後，從服務端呼叫 `POST /oauth/token`（`grant_type=authorization_code`，帶 verifier），取得 access 與 refresh。
6. Hub 呼叫 `GET /me` 取得 `issuer` 和 `subject`；若 token 回應也帶 subject，兩者必須一致。
   - 以 `(issuer, subject)` 建立或找到 Hub 帳號，投影為 `identities(provider="arcana", user_id=subject)`，並設唯一約束。
   - 同時首次登入不得建出兩個帳號；不依名稱或 email 合併。
7. Hub 建立自己的 session，登入成功後輪替 Hub session。
8. callback 用完 `code` 立刻轉往乾淨 URL。
9. 代理與應用日誌一律遮蔽 code、state、Authorization header、client secret、token body。

## 4. token 規則

| 項目 | 規則 |
|---|---|
| Authorization code | 60 秒、單次使用 |
| Access token | opaque，至少 256-bit 隨機值，15 分鐘 |
| Refresh token | opaque，每次成功刷新都輪替，舊的立即失效 |
| 閒置期限 | 30 天，只有成功刷新會延長，一般資料讀取不延長 |
| 絕對期限 | 從最初授權起算 180 天，刷新不重設（見待決事項 1） |
| 儲存 | Arcana 只存雜湊；Hub 存明文 refresh，放在 Hub 自己的 SQLite |
| 重用偵測 | 先驗證 client 身分與 token 所屬 client；已輪替掉的 refresh 再被出示時，撤銷整個 family |
| Family 撤銷 | 該 family 所有 access 和 refresh 立即失效，尚未兌換的相關 code 一併作廢 |
| 追蹤保留 | 已消耗 refresh 的雜湊與 family 關係，至少保留到 family 絕對期限 |

**每次資料請求的驗證**：token、family、client、帳號狀態、scope、期限，全部從 token 對應的資料判定。外部傳入的 owner 不能切換本人。

**Arcana 帳號停用**：
- 停用時，在同一個交易內撤銷該帳號所有 grant。
- 帳號復原時，舊 token 不會復活；資料庫回復也不能讓舊授權復活。

**Hub 端：**
- **刷新串行化**：同一個 grant 的刷新，在所有程序間串行執行，包括同步 worker 和登入流程。
- **先存後用**：拿到新 token 後，先在交易內存檔，再交給其他工作使用。
- **儲存保護**：Hub DB、WAL/SHM、備份、快照、診斷包都納入權限與加密政策，並排除在 Git 之外。
- **錯誤處理**：資料 API 回 401 時先刷新一次；收到 `invalid_grant` 才要求使用者重新授權。

## 5. 撤銷與 Hub session

- **資料授權**：Arcana 撤銷後，資料存取立即停止。
- **Hub 登入狀態**：Hub 每次替以 Arcana 登入的帳號發新 access token（Hub token 為 10 分鐘），都向 Arcana 確認 grant 仍有效，結果最多快取 5 分鐘。所以 Arcana 撤銷後，Hub session 最遲約 15 分鐘失效（見待決事項 3）。
- **同步不延長登入**：同步 worker 的 refresh 成功，不能當作「使用者仍在登入中」的證明。
- **解除連結的入口**：Arcana 帳號頁可列出並撤銷已授權的 integration。Hub「解除連結」呼叫 `POST /oauth/revoke`。

## 6. 網址與網路

- `authorize_url` 是瀏覽器可達的網址；`api_base_url` 是 Hub 容器呼叫 token 與資料端點用的網址。兩者可以分開設定，但都由管理員固定設定、綁定同一個 issuer，不從瀏覽器輸入，也不跟隨跨主機的 redirect。
- 只有同機開發可以用 `http://127.0.0.1` 加上 Docker host-gateway 的 HTTP，並明確列為開發例外。
- **朋友使用時**，Arcana authorize 和 ManaBrew callback 都必須走瀏覽器可達的私人 HTTPS（Tailscale）。token 和資料通道優先也走 Tailscale HTTPS，並驗證憑證。

## 7. §3 端點表（前綴 `/api/integrations/v1`）

| 方法／路徑 | 認證 | 用途 |
|---|---|---|
| `GET /oauth/authorize` | Arcana cookie | 驗證請求、顯示同意頁 |
| `POST /oauth/authorize` | Arcana cookie + CSRF | 消耗同意交易，發 code 或回拒絕 |
| `POST /oauth/token` | client authentication | `authorization_code`（帶 verifier）或 `refresh_token`，表單編碼 |
| `POST /oauth/revoke` | client authentication | 撤銷 token 所屬 family；未知或已失效 token 也回 200（RFC 7009） |
| `GET /me` | Bearer | 回 `issuer`、`subject`、`contract_version`、`capabilities`；有 `profile` scope 才含 `display_name` |
| 原有資料 GET 端點 | Bearer + 指定 scope | 維持唯讀 |

scope：`profile collection:read decks:read events:read`

## 8. §5 錯誤

- **OAuth 錯誤**（RFC 6749 §5.2 格式）：`invalid_request`、`invalid_client`、`invalid_grant`、`unauthorized_client`、`unsupported_grant_type`、`invalid_scope`。拒絕授權回 `access_denied`。
- **資料 API**：沿用現行巢狀錯誤格式。401 附 Bearer challenge；403 表示 scope 不足。

## 9. §6 驗收新增

- **完整瀏覽器流程**：未登入 → Arcana 登入 → 同意 → Hub 建立或找到帳號 → 實際讀到本人資料。
- **授權請求錯誤**：
  - state、iss、PKCE 錯誤；
  - code 過期或重播；
  - redirect 不完全比對；
  - 使用者拒絕同意；
  - scope 越權。
- **並行與異常**：
  - 兩個請求同時首次登入；
  - 跨程序刷新競態；
  - 回應遺失；
  - refresh 重用與 family 撤銷。
- **帳號狀態**：帳號停用、復原後，舊 token 都不會復活；撤銷後所有舊 access token 失效。
- **長時間與重啟**：跨日背景同步、Hub 或 Arcana 重啟後狀態仍在；用可控時鐘測 30 天閒置、180 天絕對期限。
- **實機與日誌**：本機和朋友端的 HTTPS 實際登入；日誌遮蔽；Hub session 在撤銷後的失效時限。
- **保留項目**：v0.1 原有的快照與事件交界、帳號隔離、Hub 衝突驗收全部保留。

## 10. 分工

**Codex（Arcana）**：
- client 登錄，以及 secret 驗證與輪替；
- 授權請求暫存、登入後恢復、同意頁；
- code、grant family、token、重用紀錄、審計；
- Bearer 驗證與 scope 檢查；
- 授權管理頁，並與帳號停用整合；
- 永久不重用的隨機 subject；
- 授權資料表放在 `accounts.sqlite3`，方便和帳號停用一起原子提交；ManaBrew 完全不存取這個檔案。

Codex 粗估約 1–2 週工程量，不含快照與事件 adapter。

**Claude（ManaBrew）**：
- Hub 新增 `arcana` 登入供應商，沿用 `auth/oauth.rs` 的 start／callback 架構，加上 PKCE 與 `iss` 驗證；
- 新增 Hub migration，存放 grant 與 refresh；
- 串行刷新 worker、session 失效檢查；
- UI 的「用 Arcana 登入」入口；
- 先用 fixture 和模擬 Arcana 端點開發。

## 11. 使用者決定（2026-11-15）

1. **絕對期限**：180 天，從最初授權起算，刷新不重設。
2. **回應遺失寬限**：1.0 不做。採嚴格輪替，契約寫明「成功回應若遺失，可能需要重新授權」；`Idempotency-Key` 方案留待日後版本再評估。
3. **撤銷後 Hub 登入失效時限**：最遲約 15 分鐘即可。本專案只在朋友間私用，不需要 back-channel 立即通知。
4. **朋友連線**：朋友的裝置已加入使用者的 tailnet，透過同一個 Tailscale HTTPS 入口登入。開設 ManaBrew 的 Tailscale Serve 入口時，仍須使用者當下同意。

## 12. Claude 核對契約 v1.0.0 草案（2026-11-15）

已核對 `arcana-manabrew-api-contract.md` §2–§7 與交接文件 2026/11/15 段落，與本提案及使用者決定一致，沒有異議。對契約 §7 列給 Claude 的四項確認如下：

1. **issuer 與 Hub 唯一鍵**：Hub 只支援單一 Arcana issuer，由管理員固定設定，與契約 §2.2 的 issuer 字串逐字比對，不做正規化。Hub 沿用既有 `identities` 表 `UNIQUE(provider, provider_user_id)`，以 `provider="arcana"`、`provider_user_id=subject` 為鍵。`/me` 回傳的 issuer 與設定不符就拒絕登入；設定的 issuer 若改變，Hub 拒絕所有既有 Arcana 身分登入，不自動遷移。日後若要支援多個 issuer，provider 會改成含 issuer 的命名空間，並另提契約修訂。
2. **登入快取綁定同一 grant**：每次 Arcana 登入都在 Arcana 產生一個獨立的 grant family。Hub session 綁定自己登入時的那個 family，簽發 Hub token 前用該 family 呼叫 `/me`。正向結果依 family 分開快取 5 分鐘，計時起點是最後一次成功的 `/me`。背景同步使用該帳號最近一次授權、且仍有效的 family，與 session 的快取互不延長。同一使用者用兩台裝置登入，會在 Arcana 授權管理頁看到兩筆 integration，屬預期行為。
3. **刷新回應遺失**：採嚴格輪替。結果不確定的 refresh 不自動重試；下一次出示舊 refresh 若收到 `invalid_grant`，就標記該 family 失效，等使用者重新授權，不形成刷新風暴。
4. **Hub callback 的 HTTPS URL**：
   - Tailscale Serve 只開放 443、8443、10000 三個 HTTPS 埠，其中 443 已由 Arcana 使用。
   - ManaBrew 網頁與 Hub 規劃在 `https://<arcana 同一 tailnet 主機>:8443`，callback 為 `https://<同主機>:8443/api/auth/callback/arcana`；relay 走 `:10000` 的 wss。
   - relay 目前只有在 443 埠才會使用 wss，ManaBrew 端要改成「頁面是 https 就用 wss」。這屬 Claude 端工作。
   - 實際網址、client secret 不寫入公開 fixture，也不放進 Git。
   - 開設 Serve 入口前，會先取得使用者同意。
