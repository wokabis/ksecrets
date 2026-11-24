import { SignJWT, jwtVerify } from "jose";
import { authenticator } from "otplib";
import { hashPassword, verifyPassword, generateApiKey, hashApiKey, sha256Hex } from "@ksecrets/crypto";
import type { Kysely, Schema } from "@ksecrets/db";
import type { User, CreateUserInput, LoginInput, ApiKey, CreateApiKeyInput } from "@ksecrets/types";

type Db = Kysely<Schema>;

const JWT_ISSUER = "ksecrets";
const JWT_AUDIENCE = "ksecrets-api";
const TOKEN_EXPIRY = "24h";
const REFRESH_EXPIRY = "30d";

let jwtSecret: Uint8Array = new TextEncoder().encode("dev-secret-change-me");

export function configureAuth(options: { secretKeyBase?: string }): void {
  if (options.secretKeyBase && options.secretKeyBase.length >= 16) {
    jwtSecret = new TextEncoder().encode(options.secretKeyBase);
  }
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: "admin" | "user";
  mfaVerified: boolean;
  scopes: string[];
}

export async function createAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(jwtSecret);
}

export async function createRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(jwtSecret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.type === "refresh") return null;
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.type !== "refresh" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export async function countUsers(db: Db): Promise<number> {
  const row = await db
    .selectFrom("users")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function createUser(db: Db, input: CreateUserInput): Promise<User> {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();

  await db
    .insertInto("users")
    .values({
      id,
      email: input.email.toLowerCase(),
      password_hash: passwordHash,
      name: input.name ?? null,
      role: input.role,
      mfa_enabled: 0,
      mfa_secret: null,
      mfa_backup_codes: null,
      created_at: now,
      last_login_at: null,
    })
    .execute();

  const user = await getUserById(db, id);
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const user = await db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst();
  return user ? mapUser(user) : null;
}

export async function getUserByEmail(db: Db, email: string): Promise<User | null> {
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email.toLowerCase())
    .executeTakeFirst();
  return user ? mapUser(user) : null;
}

export async function authenticateUser(
  db: Db,
  input: LoginInput
): Promise<{ user: User; mfaRequired?: boolean; accessToken?: string; refreshToken?: string } | null> {
  const user = await getUserByEmail(db, input.email);
  if (!user) return null;

  const userRecord = await db
    .selectFrom("users")
    .select(["id", "password_hash", "mfa_enabled", "mfa_secret", "mfa_backup_codes"])
    .where("id", "=", user.id)
    .executeTakeFirst();

  if (!userRecord) return null;

  const validPassword = await verifyPassword(input.password, userRecord.password_hash);
  if (!validPassword) return null;

  if (userRecord.mfa_enabled === 1) {
    if (!input.mfaCode) return { user, mfaRequired: true };
    const totpValid = userRecord.mfa_secret ? verifyMfaCode(userRecord.mfa_secret, input.mfaCode) : false;
    const backupValid = totpValid ? false : await consumeBackupCode(db, user.id, input.mfaCode);
    if (!totpValid && !backupValid) return null;
  }

  await db
    .updateTable("users")
    .set({ last_login_at: new Date().toISOString() })
    .where("id", "=", user.id)
    .execute();

  const accessToken = await createAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    mfaVerified: userRecord.mfa_enabled === 1,
    scopes:
      user.role === "admin"
        ? ["admin", "pushes:read", "pushes:write", "audit:read"]
        : ["pushes:read", "pushes:write"],
  });

  const refreshToken = await createRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

function randomBackupCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export async function enableMfaSetup(
  db: Db,
  userId: string,
  email: string
): Promise<{ secret: string; uri: string; backupCodes: string[] }> {
  const secret = authenticator.generateSecret();
  const backupCodes = Array.from({ length: 10 }, () => randomBackupCode());
  const hashedCodes = backupCodes.map((code) => sha256Hex(code.replace(/-/g, "").toUpperCase()));

  await db
    .updateTable("users")
    .set({ mfa_enabled: 0, mfa_secret: secret, mfa_backup_codes: JSON.stringify(hashedCodes) })
    .where("id", "=", userId)
    .execute();

  return { secret, uri: generateMfaUri(email, secret), backupCodes };
}

export async function confirmMfa(db: Db, userId: string, code: string): Promise<boolean> {
  const row = await db
    .selectFrom("users")
    .select(["mfa_secret"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!row?.mfa_secret) return false;
  if (!verifyMfaCode(row.mfa_secret, code)) return false;

  await db.updateTable("users").set({ mfa_enabled: 1 }).where("id", "=", userId).execute();
  return true;
}

export async function disableMfa(db: Db, userId: string): Promise<void> {
  await db
    .updateTable("users")
    .set({ mfa_enabled: 0, mfa_secret: null, mfa_backup_codes: null })
    .where("id", "=", userId)
    .execute();
}

export function verifyMfaCode(secret: string, code: string): boolean {
  try {
    return authenticator.check(code.replace(/\s/g, ""), secret);
  } catch {
    return false;
  }
}

async function consumeBackupCode(db: Db, userId: string, code: string): Promise<boolean> {
  const row = await db
    .selectFrom("users")
    .select(["mfa_backup_codes"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!row?.mfa_backup_codes) return false;

  const hashed = sha256Hex(code.replace(/-/g, "").toUpperCase());
  const codes: string[] = JSON.parse(row.mfa_backup_codes);
  const index = codes.indexOf(hashed);
  if (index === -1) return false;

  codes.splice(index, 1);
  await db
    .updateTable("users")
    .set({ mfa_backup_codes: JSON.stringify(codes) })
    .where("id", "=", userId)
    .execute();
  return true;
}

export function generateMfaUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "KSecrets", secret);
}

export async function updateProfile(db: Db, userId: string, input: { name?: string | null }): Promise<User | null> {
  await db
    .updateTable("users")
    .set({ name: input.name ?? null })
    .where("id", "=", userId)
    .execute();
  return getUserById(db, userId);
}

export async function updatePassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const row = await db
    .selectFrom("users")
    .select(["password_hash"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!row) return false;
  if (!(await verifyPassword(currentPassword, row.password_hash))) return false;

  const passwordHash = await hashPassword(newPassword);
  await db.updateTable("users").set({ password_hash: passwordHash }).where("id", "=", userId).execute();
  return true;
}

export async function createApiKey(
  db: Db,
  userId: string,
  input: CreateApiKeyInput
): Promise<{ key: string; apiKey: Omit<ApiKey, "keyHash"> }> {
  const { key, hash, prefix } = await generateApiKey();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
    : null;

  await db
    .insertInto("api_keys")
    .values({
      id,
      user_id: userId,
      name: input.name,
      key_hash: hash,
      prefix,
      scopes: JSON.stringify(input.scopes),
      expires_at: expiresAt,
      created_at: now,
    })
    .execute();

  return {
    key,
    apiKey: {
      id,
      userId,
      name: input.name,
      prefix,
      scopes: input.scopes,
      lastUsedAt: null,
      expiresAt,
      createdAt: now,
    },
  };
}

export async function getApiKeysByUserId(db: Db, userId: string): Promise<Array<Omit<ApiKey, "keyHash">>> {
  const keys = await db
    .selectFrom("api_keys")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return keys.map((row) => {
    const mapped = mapApiKey(row);
    const { keyHash: _keyHash, ...rest } = mapped;
    return rest;
  });
}

export async function validateApiKey(
  db: Db,
  key: string
): Promise<{ userId: string; scopes: string[] } | null> {
  const hash = hashApiKey(key);
  const apiKey = await db
    .selectFrom("api_keys")
    .select(["user_id", "scopes", "expires_at"])
    .where("key_hash", "=", hash)
    .executeTakeFirst();

  if (!apiKey) return null;
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return null;

  await db
    .updateTable("api_keys")
    .set({ last_used_at: new Date().toISOString() })
    .where("key_hash", "=", hash)
    .execute();

  return { userId: apiKey.user_id, scopes: JSON.parse(apiKey.scopes) };
}

export async function revokeApiKey(db: Db, id: string, userId: string): Promise<boolean> {
  const result = await db
    .deleteFrom("api_keys")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return Number(result?.numDeletedRows ?? 0) > 0;
}

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mfaEnabled: row.mfa_enabled === 1,
    mfaSecret: null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function mapApiKey(row: any): ApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
    prefix: row.prefix,
    scopes: JSON.parse(row.scopes),
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}
