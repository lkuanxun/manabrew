# 契約增補：賽制禁限清單 `/rules`（1.1.0 確認版）

- 提案方：Claude（ManaBrew 衍生專案）
- 對象：Arcana 整合契約 1.0.0
- 審查：Codex 審查意見見 `/home/likuanxun/MTG/docs/arcana-manabrew-rules-v1.1-review.md`，本版逐項採納
- 狀態：2026-11-15 Codex 確認，作為雙方實作基線（確認版：`/home/likuanxun/MTG/docs/arcana-manabrew-rules-v1.1-agreed.md`）。ManaBrew 端已實作並以 mock 驗證 Hub 同步；Arcana 的 `/rules` 與 `rules.changed` 尚未實作，正式版不動
- 版本：新增唯讀端點與事件主題，屬向下相容的增補，升 minor

## 1. 使用者決定

| ManaBrew 賽制          | 規則 profile         | 禁牌                                   | 角色限制                        | Game Changer  |
| ---------------------- | -------------------- | -------------------------------------- | ------------------------------- | ------------- |
| Duel Commander（雙人） | `arcana-custom-duel` | Arcana 雙人全禁（官方 Commander ∪ DC） | DC 的指揮官、行侶限制           | 不限          |
| Commander（四人）      | `commander-b3`       | WotC 官方 Commander 禁牌               | WotC 的行侶限制（目前為 Lutri） | 每副最多 3 張 |

- 四人目前只做 B3；之後要 B4／B5 時，新增 profile 和選項即可，不改清單格式。
- 雙人、四人沿用同一個更新時程：Arcana 依 DC 公告加 7 天的既有排程發布。ManaBrew 不自行查官方網站，只讀 Arcana 已發布的那一代。
- 違規只顯示警告，不擋開局。這份 API 不代表遊戲引擎強制執行這些規則。

## 2. 端點

`GET /api/integrations/v1/rules`

- 任何有效 access token 都可讀，不新增 scope。401 和 refresh 照原有授權流程處理，撤銷後一樣讀不到。
- `/me` 的 capabilities 建議加入 `rules.read`。ManaBrew 目前用 404 判斷「尚未實作」，有這個 capability 不會改變行為。
- 回應必須來自當前生效的那一代索引，不能在請求當下去抓網站，也不能把不同日期的資料拼在一起。

```json
{
  "contract_version": "1.1.0",
  "revision": "20261112-2a3ee0dba01c",
  "updated_at": "2026-11-12T08:00:00Z",
  "duel_banned": [{ "name": "Black Lotus", "oracle_id": "…" }],
  "duel_commander_restricted": [
    { "name": "Breya, Etherium Shaper", "oracle_id": "…", "scope": "commander" },
    { "name": "Lutri, the Spellchaser", "oracle_id": "…", "scope": "companion" }
  ],
  "commander_banned": [{ "name": "Black Lotus", "oracle_id": "…" }],
  "commander_restricted": [
    { "name": "Lutri, the Spellchaser", "oracle_id": "…", "scope": "companion" }
  ],
  "game_changers": [{ "name": "Ad Nauseam", "oracle_id": "…" }],
  "rule_profiles": {
    "arcana-custom-duel": { "game_changer_limit": null },
    "commander-b3": { "bracket": 3, "game_changer_limit": 3 }
  }
}
```

| 欄位                        | 內容                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `duel_banned`               | 雙人全禁，依來源展開官方與 DC 的整類禁牌（含 DC 的貼紙、Attraction 政策）   |
| `duel_commander_restricted` | 雙人的角色限制；`scope` 為 `commander`（不能當指揮官）或 `companion`        |
| `commander_banned`          | 只有 WotC 官方 Commander 禁牌，只展開 WotC 適用的整類，不由「聯集減 DC」推  |
| `commander_restricted`      | 四人的角色限制，目前只有 Lutri 的行侶限制；不代表禁止放主牌或當指揮官       |
| `game_changers`             | 完整官方 GC 清單，不扣除禁牌；同一張牌可以同時是 GC 與禁牌                  |
| `rule_profiles`             | 以穩定 ID 描述政策；`game_changer_limit` 為 `null` 表示不限，`0` 表示不允許 |

- `name` 用英文 Oracle 完整名稱，雙面牌給完整名稱。`oracle_id` 盡量提供。
- 金邊、銀邊、橡實、尺寸等依印刷版本判斷的限制，用牌名清單無法表達。這份 API 不宣稱涵蓋這部分，ManaBrew 的警告也不涵蓋。
- `revision` 要涵蓋所有集合、角色限制和 profile：即使雙人聯集沒變，只有四人來源變了也要換 revision。
- `updated_at` 是這一代的建立或發布時間，不是官方生效日，也不是這次 GET 的時間。
- 尚未實作：回 404。已實作但清單不完整或無法讀取：回 503。不要用空陣列或拿雙人清單代替。

## 3. 變更通知

Arcana 發布新一代時，保存**一筆**可重播的全域事件，每個有 `events:read` 的 `/changes` 讀者都會收到；不需要替每個 subject 複製一筆資料：

```json
{
  "event_id": "…",
  "topic": "rules.changed",
  "resource_id": "rules",
  "revision": "20261112-2a3ee0dba01c",
  "occurred_at": "…"
}
```

- 事件要能在漏輪詢或服務重啟後重播，不能只靠記憶體廣播；發布順序要保證清單先生效，事件才可見。
- 加入規則 stream 後，舊游標如果無法延用，回 410 即可。ManaBrew 會重抓快照，快照後一定會抓 `/rules`，不會漏掉。
- 規則事件只觸發重抓 `/rules`，不會讓 ManaBrew 重抓收藏或牌組。

## 4. ManaBrew 端行為（已實作）

- Hub 在快照後、收到 `rules.changed` 時，或上次檢查已超過一小時，就抓 `/rules`。這是 Hub 讀 Arcana 已發布的資料，跟 Arcana 向官方網站抓新清單的排程無關。
- 404：只記錄檢查時間。503、格式不完整（缺少任一清單或 `rule_profiles`）、網路錯誤：寫入日誌、保留上一份正常的清單，一小時後再試；牌組與收藏的同步不受影響。
- 清單存在 Hub 的 `arcana_rules` 表，是全域資料、不含帳號資訊；前端透過 Hub 的 `GET /api/arcana/rules` 讀取。
- 依使用者選的賽制套用 profile，不看玩家人數，也不看同步牌組上的 `ruleset` 欄位。
- 比對：牌卡有 oracle_id 就先比 oracle_id，再比名稱。名稱只統一大小寫並取雙面牌正面，不去標點或空格，所以 Wasteland 和 Waste Land 不會被當成同一張。
- 計數：GC 計算主牌加指揮官，兩位 Partner 都計入；同名只算一次，雙面牌算一張；行侶不計入。
- 角色限制：`commander` 只在該牌位於指揮官欄位時警告；`companion` 只在該牌位於行侶欄位時警告。放在主牌不會被當成禁牌。
- 禁牌警告和 GC 計數各自獨立：同時是 GC 與禁牌的牌，兩邊都會算到。

## 5. 驗收項目

1. 同一張只有 DC 禁的牌：雙人警告，四人不警告。
2. WotC 官方禁牌：雙人、四人都警告。
3. Lutri：放行侶欄位才警告，放主牌或當指揮官不警告。
4. GC：四人 3 張不警告、4 張警告；兩位 Partner 和雙面牌的計數正確；雙人不限。
5. 同時是 GC 與禁牌的牌：禁牌警告照常出現，GC 計數也照常計入。
6. 規則換代、斷線重播、410 重抓快照、503 時保留舊清單。
