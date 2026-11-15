# Arcana × ManaBrew 自架環境

本分支（`arcana/main`）是 ManaBrew 的衍生版本，與 Arcana（`/home/likuanxun/MTG`，由 Codex 維護）整合。雙方介面以 Arcana 端的 `docs/arcana-manabrew-api-contract.md` 為準。

## 服務

`compose.arcana.yml`（Compose 專案名 `manabrew-arcana`）：

| 服務        | 用途                                                  | 主機埠         |
| ----------- | ----------------------------------------------------- | -------------- |
| web         | 網頁，`/api/*` 同源轉發到 Hub                         | 127.0.0.1:8780 |
| relay       | 大廳與牌局轉送                                        | 127.0.0.1:8781 |
| hub         | 帳號、牌組；資料在 `ops/hub-data/arcana/`（不進 Git） | 只經 web       |
| node        | 伺服器端 Forge 引擎與 bot                             | 無             |
| mock-arcana | 模擬 Arcana 認證端點（profile `mock-arcana`）         | 127.0.0.1:8790 |

```bash
docker compose -f compose.arcana.yml up -d
docker compose -f compose.arcana.yml down
```

設定放在 repo 根目錄的 `.env`（不進 Git）：`MANABREW_SERVER_KEY`、`ARCANA_*`、`COMPOSE_PROFILES`。

## Arcana 登入

Hub 設定以下五項後啟用「Continue with Arcana」：`ARCANA_CLIENT_ID`、`ARCANA_CLIENT_SECRET`、`ARCANA_ISSUER`、`ARCANA_AUTHORIZE_URL`（瀏覽器可達）、`ARCANA_API_BASE_URL`（Hub 容器可達，含 `/api/integrations/v1`）。

本機開發用 `mock-arcana`：`.env` 設 `COMPOSE_PROFILES=mock-arcana`、`ARCANA_ISSUER=http://localhost:8790/`、`ARCANA_AUTHORIZE_URL=http://localhost:8790/api/integrations/v1/oauth/authorize`、`ARCANA_API_BASE_URL=http://mock-arcana:8790/api/integrations/v1`。模擬帳號有 Alice、Bob 兩位；`POST http://localhost:8790/mock/revoke-subject`（表單 `subject=`）可模擬使用者在 Arcana 撤銷授權。模擬服務的授權資料只存在記憶體，重啟後先前的授權全部失效。

Hub 第一次成功以 Arcana 登入時，會把 issuer 記在 `arcana_meta`。之後若設定的 issuer 不同，所有 Arcana 登入都會被拒絕，不會自動改綁既有身分。

### 與 Codex 的 OAuth 原型聯測

原型只綁在 `127.0.0.1:7876`。Hub 必須加入原型的 Docker 網路，才呼叫得到它的 API：

```bash
docker compose -f compose.arcana.yml -f ops/arcana/compose.stage1.yml up -d hub
```

建議直接在 `.env` 設定 `COMPOSE_FILE=compose.arcana.yml:ops/arcana/compose.stage1.yml`，之後一律用不帶 `-f` 的 `docker compose`。只要有一次單獨用 `-f compose.arcana.yml` 啟動其他服務（例如 `up -d web`），Docker 會連帶重建 Hub，Hub 就會脫離原型網路：Arcana 登入跟著失敗，同步也停住。

`.env` 的設定：

- `ARCANA_ISSUER=http://127.0.0.1:7876/`
- `ARCANA_AUTHORIZE_URL=http://127.0.0.1:7876/api/integrations/v1/oauth/authorize`
- `ARCANA_API_BASE_URL=http://mtg-oauth-stage1-app-1:7860/api/integrations/v1`
- client 憑證取自 Codex 寫入的 `/home/likuanxun/MTG/data/oauth-stage1/manabrew-client.json`（只讀不改）。

## 單向同步（Stage C）

Hub 背景每 5 秒同步一次已連結帳號的 Arcana 收藏與牌組，存進獨立的鏡像表，不碰 ManaBrew 自己的 My Decks 和收藏。My Decks 和 Collection 頁都有「Arcana」切換，可唯讀瀏覽同步來的牌組與收藏；收藏依印刷版本與 finish 合併張數。

Play 首頁的「Arcana decks」區塊會列出鏡像的牌組，按 Play 後才向 Scryfall 補齊卡片並開局。使用者在 Arcana 撤銷授權後，已同步的資料保留，但不再更新。

模擬 Arcana 提供契約的資料端點，測試資料在 `ops/arcana/mock-arcana/fixtures.json`：Alice 有 3 副 100 張牌組與 9 筆收藏，Bob 有 1 副。另有幾個模擬操作，都用 POST、表單欄位：

- `/mock/touch-deck`：`subject`、`deck_id`，可加 `name`
- `/mock/remove-deck`：`subject`、`deck_id`
- `/mock/touch-collection`：`subject`、`holding_id`
- `/mock/expire-cursors`：不需參數
- `/mock/touch-rules`：不需參數，換一個禁限清單版本並對所有 subject 發 `rules.changed`
- `/mock/rules-unavailable`：不需參數，切換 `/rules` 是否回 503

## 賽制與禁限

可選的賽制只剩 Commander（四人）和 Duel Commander（雙人），清單在 `src/lib/formats.ts` 的 `PLAYABLE_FORMAT_IDS`。其他賽制的程式和路由都還在，只是從選單隱藏。

禁限清單來自 Arcana 的 `/rules`（提案見 `contract-1.1-rules-proposal.md`），Hub 同步後由 `GET /api/arcana/rules` 提供給前端，判定在 `src/lib/formatRestrictions.ts`：

- Duel Commander（profile `arcana-custom-duel`）：Arcana 雙人全禁，以及 DC 的指揮官、行侶限制；Game Changer 不限。
- Commander（profile `commander-b3`）：官方 Commander 禁牌和行侶限制，Game Changer 每副最多 3 張。

Game Changer 的上限從 Arcana 回傳的 `rule_profiles` 讀取，不寫死在前端。

違規只顯示警告，不擋開局。模擬環境的清單在 `ops/arcana/mock-arcana/rules.json`。

`.env` 可用 `HUB_DATA_DIR` 換掉 Hub 的資料目錄。Hub 一旦綁定 issuer 就不能換，所以模擬環境和原型應該各用一個目錄，例如 `./ops/hub-data/arcana-mock`。

## 透過 Tailscale 給朋友使用

Tailscale Serve 只開放 443、8443、10000 三個 HTTPS 埠，443 由 Arcana 使用。規劃：網頁與 Hub 用 `:8443`，relay 用 `:10000`。relay 位址設成完整網址：`RELAY_HOST=wss://<tailnet 主機>:10000`，這樣前端會直接使用該網址。設定 Serve 前須取得使用者同意。接正式 Arcana 的交接與切換步驟見 [stage2-production-handoff.md](stage2-production-handoff.md)；使用者已同意開這兩個入口，於切換時一併開啟。

## 與上游的差異

- Duel Commander：關閉指揮官傷害判負，不允許備牌。
- Hub：新增 Arcana 登入（`auth/arcana.rs`，資料表另有版本序列，見 `docs/agents/HUB.md`）。
- 前端：登入對話框的 Arcana 按鈕。
- 介面精簡：關閉 Deck Hub（Community）；導覽列只留 Singleplayer、Multiplayer、My Decks、Collection；首頁拿掉 Card Search、Life Tracker、My Collection 入口和上游的 Discord、GitHub 連結；隱藏 Limited。頁面仍可用網址開啟。
