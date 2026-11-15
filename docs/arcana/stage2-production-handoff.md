# 第二階段：ManaBrew 接正式 Arcana（交接給 Codex）

日期：2026-11-15。提出方：Claude（ManaBrew 衍生專案）。

## 使用者決定

- 手機測試改用**正式 Arcana** 登入。原型 issuer 只綁 `127.0.0.1:7876`，手機連不到；tailnet 的 443 已經給正式 Arcana 使用。
- 同意用 Tailscale Serve 開兩個**只限 tailnet** 的入口：`:8443` 給 ManaBrew 網頁與 Hub，`:10000` 給 relay。不開 Funnel，也不動 443。
- 切到正式版時，Hub **新開一份資料**；原型的 Hub 資料原封保留，可隨時切回。
- 目前只有使用者自己測，還不通知朋友。

下文的 `<主機>` 指正式 Arcana 用 443 的那台 tailnet 主機，實際名稱不寫進 Git。

## 請 Codex 提供

1. **正式版部署 v1.1**：包含 `/rules`、`rules.changed` 和 v2 游標。若正式版只先上 1.0，ManaBrew 也能運作，`/rules` 回 404 時只是不顯示禁限警告。部署時段與回退點由 Codex 和使用者決定。
2. **正式 issuer**（含尾斜線），預期為 `https://<主機>/`。Hub 會比對 callback 的 `iss` 和 `/me` 回的 issuer，兩者必須等於這個字串，即使 Hub 是從下方第 5 點的內部位址呼叫。
3. **在正式 accounts 登錄新的 `manabrew` client**
   - redirect_uri 精確為 `https://<主機>:8443/api/auth/callback/arcana`。
   - scopes 與原型相同：收藏、牌組、事件讀取。
   - secret 寫成 0600 檔案，告知路徑。Claude 只讀這個檔放進 ManaBrew 的 `.env`，不寫進 Git、網址或日誌。
   - 不複製 7876 的 secret、grant 或帳號。
4. **瀏覽器 authorize 網址**：請確認是否為 `https://<主機>/api/integrations/v1/oauth/authorize`。
5. **Hub 呼叫正式 API 的路線**
   - 已實測：ManaBrew 的容器連 `<主機>` 的 tailnet IP:443 會被拒絕；主機本身可以連。
   - 建議 Hub 改用 `http://host.docker.internal:8765/api/integrations/v1`，也就是正式容器已發布的 8765 埠，透過 compose 的 `host-gateway` 對應。這樣不必把 Hub 接進正式的 Docker 網路。
   - 觀察：`mtg-arcana-app-1` 的 8765 綁在 `0.0.0.0`，區網也連得到。若這不是預期，請 Codex 評估；改成只綁 127.0.0.1 的話，上述路線也要換。
   - 若 Codex 偏好別的路線，例如讓 Hub 加入正式網路，請直接指定。
6. **原型**：切換後 ManaBrew 不再呼叫 7876，Hub 也不再接 `mtg-oauth-stage1_default`。原型是否保留由 Codex 和使用者決定。

## ManaBrew 端切換（Claude 執行）

1. 備份目前的 `.env`，再改成：
   - `WEB_APP_URL=https://<主機>:8443`
   - `RELAY_HOST=wss://<主機>:10000`：前端遇到完整網址會直接使用；`RELAY_PORT` 維持預設。
   - `ARCANA_ISSUER`、`ARCANA_AUTHORIZE_URL`、`ARCANA_API_BASE_URL`、`ARCANA_CLIENT_ID`，以及從 secret 檔讀入的 `ARCANA_CLIENT_SECRET`。
   - `HUB_DATA_DIR=./ops/hub-data/arcana-prod`
   - `COMPOSE_FILE=compose.arcana.yml:ops/arcana/compose.production.yml`：這個檔只替 Hub 加上 `host.docker.internal`。
2. 開啟入口：
   - `tailscale serve --bg --https=8443 http://127.0.0.1:8780`
   - `tailscale serve --bg --https=10000 http://127.0.0.1:8781`
3. 重建並重啟 ManaBrew。`ops/hub-data/arcana`（原型資料）不動。

**回退**：還原 `.env`，執行 `tailscale serve --https=8443 off` 和 `tailscale serve --https=10000 off`，然後重啟。

## 驗收

PC 和手機各做一次：

1. 登入 → 同意 → Hub callback。
2. 同步本人的收藏與牌組；Collection 頁可以看到 Arcana 收藏。
3. `/rules` 同步完成，Singleplayer 選 Arcana 牌組時出現禁限警告。
4. 以 Arcana 牌組開局並打到結束。
5. 在 Arcana 管理頁撤銷授權後，Hub 停止同步並登出 Arcana 連結。
