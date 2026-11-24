import { Kysely, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { schema, type Schema } from "./schema";
import { env } from "../env";

let dbInstance: Kysely<Schema> | null = null;

export function getDb(): Kysely<Schema> {
  if (dbInstance) return dbInstance;

  const dialect = new SqliteDialect({
    database: new Database(env.DATABASE_PATH),
  });

  dbInstance = new Kysely<Schema>({ dialect });

  return dbInstance;
}

export async function initializeDatabase(): Promise<void> {
  const db = getDb();

  await db.schema
    .createTable("pushes")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("payload", "text", (col) => col.notNull())
    .addColumn("passphrase_hash", "text")
    .addColumn("expiry_views", "integer")
    .addColumn("expiry_days", "integer")
    .addColumn("expiry_date", "text")
    .addColumn("views", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("max_views", "integer")
    .addColumn("filename", "text")
    .addColumn("content_type", "text")
    .addColumn("size", "integer")
    .addColumn("retriever_email", "text")
    .addColumn("note", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`datetime('now')`))
    .addColumn("expires_at", "text")
    .addColumn("deleted_at", "text")
    .execute();

  await db.schema
    .createIndex("idx_pushes_expires_at")
    .ifNotExists()
    .on("pushes")
    .column("expires_at")
    .where("expires_at IS NOT NULL")
    .execute();

  await db.schema
    .createIndex("idx_pushes_status")
    .ifNotExists()
    .on("pushes")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_pushes_created_at")
    .ifNotExists()
    .on("pushes")
    .column("created_at")
    .execute();

  await db.schema
    .createTable("audit_logs")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("push_id", "text", (col) => col.notNull().references("pushes.id").onDelete("cascade"))
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("ip", "text")
    .addColumn("user_agent", "text")
    .addColumn("retriever_email", "text")
    .addColumn("metadata", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`datetime('now')`))
    .execute();

  await db.schema
    .createIndex("idx_audit_logs_push_id")
    .ifNotExists()
    .on("audit_logs")
    .column("push_id")
    .execute();

  await db.schema
    .createIndex("idx_audit_logs_created_at")
    .ifNotExists()
    .on("audit_logs")
    .column("created_at")
    .execute();

  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("mfa_enabled", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("mfa_secret", "text")
    .addColumn("mfa_backup_codes", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`datetime('now')`))
    .addColumn("last_login_at", "text")
    .execute();

  await db.schema
    .createTable("api_keys")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("key_hash", "text", (col) => col.notNull())
    .addColumn("prefix", "text", (col) => col.notNull())
    .addColumn("scopes", "text", (col) => col.notNull().defaultTo('["pushes:write"]'))
    .addColumn("last_used_at", "text")
    .addColumn("expires_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`datetime('now')`))
    .execute();

  await db.schema
    .createIndex("idx_api_keys_user_id")
    .ifNotExists()
    .on("api_keys")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_api_keys_key_hash")
    .ifNotExists()
    .on("api_keys")
    .column("key_hash")
    .execute();

  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("key", "text", (col) => col.primaryKey().notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`datetime('now')`))
    .execute();

  await db.schema
    .createTable("files")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey().notNull())
    .addColumn("push_id", "text", (col) => col.notNull().references("pushes.id").onDelete("cascade"))
    .addColumn("r2_key", "text", (col) => col.notNull())
    .addColumn("filename", "text", (col) => col.notNull())
    .addColumn("content_type", "text", (col) => col.notNull())
    .addColumn("size", "integer", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`datetime('now')`))
    .execute();

  await seedDefaults(db);
}

async function seedDefaults(db: Kysely<Schema>): Promise<void> {
  const defaults: Record<string, string> = {
    site_name: "Password Pusher",
    site_url: "https://pwpush.example.com",
    theme: "cerulean",
    custom_css: "",
    default_expiry_views: "1",
    default_expiry_days: "7",
    max_payload_size: "10000000",
    max_file_size: "100000000",
    require_https: "true",
    allow_anonymous: "true",
    require_mfa: "false",
    retention_days: "30",
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db
      .insertInto("settings")
      .values({ key, value })
      .onConflict((oc) => oc.column("key").doNothing())
      .execute();
  }
}

export { schema };
export type { Schema };