import { sql } from "kysely";

export const schema = {
  pushes: sql`
    CREATE TABLE IF NOT EXISTS pushes (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('password', 'note', 'file', 'url')),
      payload TEXT NOT NULL,
      passphrase_hash TEXT,
      expiry_views INTEGER,
      expiry_days INTEGER,
      expiry_date TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      max_views INTEGER,
      filename TEXT,
      content_type TEXT,
      size INTEGER,
      retriever_email TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted', 'burned')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      deleted_at TEXT
    )
  `,
  pushIndexes: sql`
    CREATE INDEX IF NOT EXISTS idx_pushes_expires_at ON pushes(expires_at) WHERE expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_pushes_status ON pushes(status);
    CREATE INDEX IF NOT EXISTS idx_pushes_created_at ON pushes(created_at DESC);
  `,

  audit_logs: sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      push_id TEXT NOT NULL REFERENCES pushes(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('created', 'viewed', 'expired', 'deleted', 'burned', 'passphrase_failed')),
      ip TEXT,
      user_agent TEXT,
      retriever_email TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  auditIndexes: sql`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_push_id ON audit_logs(push_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  `,

  users: sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT,
      mfa_backup_codes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    )
  `,

  api_keys: sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["pushes:write"]',
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  apiKeyIndexes: sql`
    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
  `,

  settings: sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  files: sql`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY NOT NULL,
      push_id TEXT NOT NULL REFERENCES pushes(id) ON DELETE CASCADE,
      r2_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
};

export type Schema = {
  pushes: {
    id: string;
    kind: "password" | "note" | "file" | "url";
    payload: string;
    passphrase_hash: string | null;
    expiry_views: number | null;
    expiry_days: number | null;
    expiry_date: string | null;
    views: number;
    max_views: number | null;
    filename: string | null;
    content_type: string | null;
    size: number | null;
    retriever_email: string | null;
    note: string | null;
    status: "active" | "expired" | "deleted" | "burned";
    created_at: string;
    expires_at: string | null;
    deleted_at: string | null;
  };
  audit_logs: {
    id: string;
    push_id: string;
    action: "created" | "viewed" | "expired" | "deleted" | "burned" | "passphrase_failed";
    ip: string | null;
    user_agent: string | null;
    retriever_email: string | null;
    metadata: string | null;
    created_at: string;
  };
  users: {
    id: string;
    email: string;
    password_hash: string;
    name: string | null;
    role: "admin" | "user";
    mfa_enabled: 0 | 1;
    mfa_secret: string | null;
    mfa_backup_codes: string | null;
    created_at: string;
    last_login_at: string | null;
  };
  api_keys: {
    id: string;
    user_id: string;
    name: string;
    key_hash: string;
    prefix: string;
    scopes: string;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
  };
  settings: {
    key: string;
    value: string;
    updated_at: string;
  };
  files: {
    id: string;
    push_id: string;
    r2_key: string;
    filename: string;
    content_type: string;
    size: number;
    created_at: string;
  };
};