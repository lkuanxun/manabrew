use rusqlite::{params, OptionalExtension, Result as SqlResult};

use super::Storage;

// Kept on its own version track so this fork never claims an upstream
// migration number: upstream numbering stays free to advance without colliding.
const ARCANA_MIGRATIONS: &[(i64, &str)] = &[
    (
        1,
        "CREATE TABLE arcana_oauth_states (
        state_hash    TEXT PRIMARY KEY,
        pkce_verifier TEXT NOT NULL,
        binding_hash  TEXT NOT NULL,
        expires_at    TEXT NOT NULL
    );
    CREATE TABLE arcana_grants (
        id                TEXT PRIMARY KEY,
        account_id        TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        subject           TEXT NOT NULL,
        access_token      TEXT NOT NULL,
        access_expires_at TEXT NOT NULL,
        refresh_token     TEXT NOT NULL,
        authorized_at     TEXT NOT NULL,
        verified_at       TEXT NOT NULL,
        pending_code_hash TEXT
    );
    CREATE INDEX idx_arcana_grants_account ON arcana_grants(account_id, authorized_at);
    CREATE INDEX idx_arcana_grants_pending ON arcana_grants(pending_code_hash);
    CREATE TABLE arcana_session_grants (
        session_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
        grant_id     TEXT NOT NULL REFERENCES arcana_grants(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_arcana_session_grants_grant ON arcana_session_grants(grant_id);",
    ),
    (
        2,
        "CREATE TABLE arcana_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );",
    ),
    (
        3,
        "CREATE TABLE arcana_mirror_decks (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        deck_id    TEXT NOT NULL,
        revision   TEXT NOT NULL,
        payload    TEXT NOT NULL,
        synced_at  TEXT NOT NULL,
        PRIMARY KEY (account_id, deck_id)
    );
    CREATE TABLE arcana_mirror_collection (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        revision   TEXT NOT NULL,
        payload    TEXT NOT NULL,
        synced_at  TEXT NOT NULL
    );
    CREATE TABLE arcana_sync_state (
        account_id      TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        cursor          TEXT,
        failures        INTEGER NOT NULL DEFAULT 0,
        retry_at        TEXT,
        last_success_at TEXT,
        last_error      TEXT
    );",
    ),
    (
        4,
        "CREATE TABLE arcana_rules (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        revision   TEXT,
        payload    TEXT,
        checked_at TEXT NOT NULL
    );",
    ),
];

#[derive(Debug, Clone)]
pub struct ArcanaGrantRow {
    pub id: String,
    pub subject: String,
    pub access_token: String,
    pub access_expires_at: String,
    pub refresh_token: String,
    pub verified_at: String,
}

pub struct NewArcanaGrant<'a> {
    pub id: &'a str,
    pub account_id: &'a str,
    pub subject: &'a str,
    pub access_token: &'a str,
    pub access_expires_at: &'a str,
    pub refresh_token: &'a str,
    pub now: &'a str,
    pub pending_code_hash: Option<&'a str>,
}

impl Storage {
    pub(super) fn migrate_arcana(&self) -> SqlResult<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS arcana_schema_version (
                id      INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            );
            INSERT OR IGNORE INTO arcana_schema_version (id, version) VALUES (1, 0);",
        )?;
        let current: i64 = self.conn.query_row(
            "SELECT version FROM arcana_schema_version WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        for (version, sql) in ARCANA_MIGRATIONS {
            if *version <= current {
                continue;
            }
            let tx = self.conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "UPDATE arcana_schema_version SET version = ?1 WHERE id = 1",
                params![version],
            )?;
            tx.commit()?;
            tracing::info!(version, "arcana migration ran");
        }
        Ok(())
    }

    pub fn arcana_issuer_matches(&self, issuer: &str) -> SqlResult<bool> {
        self.conn.execute(
            "INSERT OR IGNORE INTO arcana_meta (key, value) VALUES ('issuer', ?1)",
            params![issuer],
        )?;
        let stored: String = self.conn.query_row(
            "SELECT value FROM arcana_meta WHERE key = 'issuer'",
            [],
            |row| row.get(0),
        )?;
        Ok(stored == issuer)
    }

    pub fn insert_arcana_oauth_state(
        &self,
        state_hash: &str,
        pkce_verifier: &str,
        binding_hash: &str,
        now: &str,
        expires_at: &str,
    ) -> SqlResult<()> {
        self.conn.execute(
            "DELETE FROM arcana_oauth_states WHERE expires_at <= ?1",
            params![now],
        )?;
        self.conn.execute(
            "INSERT INTO arcana_oauth_states (state_hash, pkce_verifier, binding_hash, expires_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![state_hash, pkce_verifier, binding_hash, expires_at],
        )?;
        Ok(())
    }

    pub fn take_arcana_oauth_state(
        &self,
        state_hash: &str,
        now: &str,
    ) -> SqlResult<Option<(String, String)>> {
        let row = self
            .conn
            .query_row(
                "SELECT pkce_verifier, binding_hash FROM arcana_oauth_states
                 WHERE state_hash = ?1 AND expires_at > ?2",
                params![state_hash, now],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        self.conn.execute(
            "DELETE FROM arcana_oauth_states WHERE state_hash = ?1",
            params![state_hash],
        )?;
        Ok(row)
    }

    pub fn insert_arcana_grant(&self, grant: &NewArcanaGrant) -> SqlResult<()> {
        self.conn.execute(
            "INSERT INTO arcana_grants (id, account_id, subject, access_token, access_expires_at,
                refresh_token, authorized_at, verified_at, pending_code_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)",
            params![
                grant.id,
                grant.account_id,
                grant.subject,
                grant.access_token,
                grant.access_expires_at,
                grant.refresh_token,
                grant.now,
                grant.pending_code_hash
            ],
        )?;
        self.request_arcana_sync(grant.account_id)
    }

    pub fn bind_arcana_session(&self, code_hash: &str, session_hash: &str) -> SqlResult<()> {
        let tx = self.conn.unchecked_transaction()?;
        let grant_id: Option<String> = tx
            .query_row(
                "SELECT id FROM arcana_grants WHERE pending_code_hash = ?1",
                params![code_hash],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(grant_id) = grant_id {
            tx.execute(
                "UPDATE arcana_grants SET pending_code_hash = NULL WHERE id = ?1",
                params![grant_id],
            )?;
            tx.execute(
                "INSERT INTO arcana_session_grants (session_hash, grant_id) VALUES (?1, ?2)",
                params![session_hash, grant_id],
            )?;
        }
        tx.commit()
    }

    pub fn arcana_grant_for_session(
        &self,
        session_hash: &str,
    ) -> SqlResult<Option<ArcanaGrantRow>> {
        self.conn
            .query_row(
                "SELECT g.id, g.subject, g.access_token, g.access_expires_at, g.refresh_token, g.verified_at
                 FROM arcana_session_grants s JOIN arcana_grants g ON g.id = s.grant_id
                 WHERE s.session_hash = ?1",
                params![session_hash],
                |row| {
                    Ok(ArcanaGrantRow {
                        id: row.get(0)?,
                        subject: row.get(1)?,
                        access_token: row.get(2)?,
                        access_expires_at: row.get(3)?,
                        refresh_token: row.get(4)?,
                        verified_at: row.get(5)?,
                    })
                },
            )
            .optional()
    }

    pub fn arcana_grant(&self, grant_id: &str) -> SqlResult<Option<ArcanaGrantRow>> {
        self.conn
            .query_row(
                "SELECT id, subject, access_token, access_expires_at, refresh_token, verified_at
                 FROM arcana_grants WHERE id = ?1",
                params![grant_id],
                |row| {
                    Ok(ArcanaGrantRow {
                        id: row.get(0)?,
                        subject: row.get(1)?,
                        access_token: row.get(2)?,
                        access_expires_at: row.get(3)?,
                        refresh_token: row.get(4)?,
                        verified_at: row.get(5)?,
                    })
                },
            )
            .optional()
    }

    pub fn rotate_arcana_grant(
        &self,
        grant_id: &str,
        access_token: &str,
        access_expires_at: &str,
        refresh_token: &str,
    ) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE arcana_grants
             SET access_token = ?2, access_expires_at = ?3, refresh_token = ?4
             WHERE id = ?1",
            params![grant_id, access_token, access_expires_at, refresh_token],
        )?;
        Ok(())
    }

    pub fn mark_arcana_grant_verified(&self, grant_id: &str, now: &str) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE arcana_grants SET verified_at = ?2 WHERE id = ?1",
            params![grant_id, now],
        )?;
        Ok(())
    }

    pub fn delete_arcana_grant(&self, grant_id: &str) -> SqlResult<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM sessions WHERE token_hash IN (
                SELECT session_hash FROM arcana_session_grants WHERE grant_id = ?1
             )",
            params![grant_id],
        )?;
        tx.execute("DELETE FROM arcana_grants WHERE id = ?1", params![grant_id])?;
        tx.commit()
    }

    pub fn arcana_grants_for_account(&self, account_id: &str) -> SqlResult<Vec<ArcanaGrantRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, subject, access_token, access_expires_at, refresh_token, verified_at
             FROM arcana_grants WHERE account_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![account_id], |row| {
                Ok(ArcanaGrantRow {
                    id: row.get(0)?,
                    subject: row.get(1)?,
                    access_token: row.get(2)?,
                    access_expires_at: row.get(3)?,
                    refresh_token: row.get(4)?,
                    verified_at: row.get(5)?,
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn arcana_sync_targets(&self) -> SqlResult<Vec<ArcanaSyncTarget>> {
        let mut stmt = self.conn.prepare(
            "SELECT g.account_id, g.id, s.cursor, s.failures, s.retry_at
             FROM arcana_grants g
             LEFT JOIN arcana_sync_state s ON s.account_id = g.account_id
             WHERE g.authorized_at = (
                 SELECT MAX(o.authorized_at) FROM arcana_grants o WHERE o.account_id = g.account_id
             )
             GROUP BY g.account_id",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ArcanaSyncTarget {
                    account_id: row.get(0)?,
                    grant_id: row.get(1)?,
                    cursor: row.get(2)?,
                    failures: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    retry_at: row.get(4)?,
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn replace_arcana_mirror(
        &self,
        account_id: &str,
        collection: Option<(&str, &str)>,
        decks: Option<&[(String, String, String)]>,
        cursor: Option<&str>,
        now: &str,
    ) -> SqlResult<()> {
        let tx = self.conn.unchecked_transaction()?;
        if let Some((revision, payload)) = collection {
            tx.execute(
                "INSERT INTO arcana_mirror_collection (account_id, revision, payload, synced_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(account_id) DO UPDATE SET
                     revision = excluded.revision, payload = excluded.payload,
                     synced_at = excluded.synced_at",
                params![account_id, revision, payload, now],
            )?;
        }
        if let Some(decks) = decks {
            tx.execute(
                "DELETE FROM arcana_mirror_decks WHERE account_id = ?1",
                params![account_id],
            )?;
            for (deck_id, revision, payload) in decks {
                tx.execute(
                    "INSERT INTO arcana_mirror_decks (account_id, deck_id, revision, payload, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![account_id, deck_id, revision, payload, now],
                )?;
            }
        }
        tx.execute(
            "INSERT INTO arcana_sync_state (account_id, cursor, failures, retry_at, last_success_at, last_error)
             VALUES (?1, ?2, 0, NULL, ?3, NULL)
             ON CONFLICT(account_id) DO UPDATE SET
                 cursor = excluded.cursor, failures = 0, retry_at = NULL,
                 last_success_at = excluded.last_success_at, last_error = NULL",
            params![account_id, cursor, now],
        )?;
        tx.commit()
    }

    pub fn arcana_mirror_deck_revisions(
        &self,
        account_id: &str,
    ) -> SqlResult<Vec<(String, String, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT deck_id, revision, payload FROM arcana_mirror_decks WHERE account_id = ?1",
        )?;
        let rows = stmt
            .query_map(params![account_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn record_arcana_sync_failure(
        &self,
        account_id: &str,
        error: &str,
        retry_at: &str,
        reset_cursor: bool,
    ) -> SqlResult<()> {
        self.conn.execute(
            "INSERT INTO arcana_sync_state (account_id, cursor, failures, retry_at, last_error)
             VALUES (?1, NULL, 1, ?3, ?2)
             ON CONFLICT(account_id) DO UPDATE SET
                 failures = failures + 1, retry_at = excluded.retry_at, last_error = excluded.last_error,
                 cursor = CASE WHEN ?4 THEN NULL ELSE cursor END",
            params![account_id, error, retry_at, reset_cursor],
        )?;
        Ok(())
    }

    pub fn arcana_rules_checked_at(&self) -> SqlResult<Option<String>> {
        self.conn
            .query_row(
                "SELECT checked_at FROM arcana_rules WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn record_arcana_rules(
        &self,
        rules: Option<(&str, &str)>,
        checked_at: &str,
    ) -> SqlResult<()> {
        let (revision, payload) = rules.unzip();
        self.conn.execute(
            "INSERT INTO arcana_rules (id, revision, payload, checked_at) VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
                 revision = COALESCE(excluded.revision, revision),
                 payload = COALESCE(excluded.payload, payload),
                 checked_at = excluded.checked_at",
            params![revision, payload, checked_at],
        )?;
        Ok(())
    }

    pub fn arcana_rules(&self) -> SqlResult<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT payload FROM arcana_rules WHERE id = 1", [], |row| {
                row.get::<_, Option<String>>(0)
            })
            .optional()?
            .flatten())
    }

    pub fn request_arcana_sync(&self, account_id: &str) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE arcana_sync_state SET retry_at = NULL WHERE account_id = ?1",
            params![account_id],
        )?;
        Ok(())
    }

    pub fn arcana_library(&self, account_id: &str) -> SqlResult<ArcanaLibrary> {
        let mut stmt = self.conn.prepare(
            "SELECT payload FROM arcana_mirror_decks WHERE account_id = ?1 ORDER BY deck_id",
        )?;
        let decks = stmt
            .query_map(params![account_id], |row| row.get(0))?
            .collect::<SqlResult<Vec<String>>>()?;
        let collection = self
            .conn
            .query_row(
                "SELECT payload FROM arcana_mirror_collection WHERE account_id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .optional()?;
        let state = self
            .conn
            .query_row(
                "SELECT last_success_at, last_error FROM arcana_sync_state WHERE account_id = ?1",
                params![account_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let (last_success_at, last_error) = state.unwrap_or((None, None));
        let linked: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM arcana_grants WHERE account_id = ?1)",
            params![account_id],
            |row| row.get(0),
        )?;
        Ok(ArcanaLibrary {
            decks,
            collection,
            last_success_at,
            last_error,
            linked,
        })
    }
}

pub struct ArcanaSyncTarget {
    pub account_id: String,
    pub grant_id: String,
    pub cursor: Option<String>,
    pub failures: i64,
    pub retry_at: Option<String>,
}

pub struct ArcanaLibrary {
    pub decks: Vec<String>,
    pub collection: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub linked: bool,
}
