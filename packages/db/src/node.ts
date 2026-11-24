import { Kysely, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { initializeWith, type Schema } from "./index";
import { env } from "./env";

export function getNodeDb(path: string = env.DATABASE_PATH): Kysely<Schema> {
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return new Kysely<Schema>({
    dialect: new SqliteDialect({ database }),
  });
}

export async function initializeNodeDatabase(path?: string): Promise<Kysely<Schema>> {
  const db = getNodeDb(path);
  await initializeWith(db);
  return db;
}
