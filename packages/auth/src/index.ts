import { SignJWT, jwtVerify, createSecretKey } from "jose";
import { authenticator } from "otplib";
import { hashPassword, verifyPassword, generateApiKey } from "@pwpush/crypto";
import { getDb } from "@pwpush/db";
import { env } from "@pwpush/db";
import type { User, CreateUserInput, LoginInput, ApiKey, CreateApiKeyInput } from "@pwpush/types";

const JWT_SECRET = createSecretKey(new TextEncoder().encode(env.SECRET_KEY_BASE || "dev-secret-change-me"));
const JWT_ISSUER = "pwpush";
const JWT_AUDIENCE = "pwpush-api";
const TOKEN_EXPIRY = "24h";
const REFRESH_EXPIRY = "30d";

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
    .sign(JWT_SECRET);
}

export async function createRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const db = getDb();
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

  return getUserById(id)!;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getDb();
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return user ? mapUser(user) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email.toLowerCase())
    .executeTakeFirst();

  return user ? mapUser(user) : null;
}

export async function authenticateUser(input: LoginInput): Promise<{ user: User; accessToken: string; refreshToken: string } | null> {
  const user = await getUserByEmail(input.email);
  if (!user) return null;

  const db = getDb();
  const userRecord = await db
    .selectFrom("users")
    .select(["password_hash", "mfa_enabled", "mfa_secret", "mfa_backup_codes"])
    .where("id", "=", user.id)
    .executeTakeFirst();

  if (!userRecord) return null;

  const validPassword = await verifyPassword(input.password, userRecord.password_hash);
  if (!validPassword) return null;

  if (userRecord.mfa_enabled) {
    if (!input.mfaCode) return { user, accessToken: "", refreshToken: "" } as any;
    const valid = verifyMfaCode(userRecord.mfa_secret!, input.mfaCode);
    if (!valid) return null;
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
    scopes: user.role === "admin" ? ["admin", "pushes:read", "pushes:write", "audit:read"] : ["pushes:read", "pushes:write"],
  });

  const refreshToken = await createRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

export async function enableMfa(userId: string): Promise<{ secret: string; backupCodes: string[] }> {
  const secret = authenticator.generateSecret();
  const backupCodes = Array.from({ length: 10 }, () => authenticator.generateToken(secret).slice(0, 6));

  const db = getDb();
  await db
    .updateTable("users")
    .set({ mfa_enabled: 1, mfa_secret: secret, mfa_backup_codes: JSON.stringify(backupCodes) })
    .where("id", "=", userId)
    .execute();

  return { secret, backupCodes };
}

export async function disableMfa(userId: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable("users")
    .set({ mfa_enabled: 0, mfa_secret: null, mfa_backup_codes: null })
    .where("id", "=", userId)
    .execute();
}

export function verifyMfaCode(secret: string, code: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

export function generateMfaUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "Password Pusher", secret);
}

export async function createApiKey(userId: string, input: CreateApiKeyInput): Promise<{ key: string; apiKey: ApiKey }> {
  const db = getDb();
  const { key, hash, prefix } = await generateApiKey();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString() : null;

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

  const apiKey = await getApiKeyById(id);
  return { key, apiKey: apiKey! };
}

export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const db = getDb();
  const key = await db
    .selectFrom("api_keys")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return key ? mapApiKey(key) : null;
}

export async function getApiKeysByUserId(userId: string): Promise<ApiKey[]> {
  const db = getDb();
  const keys = await db
    .selectFrom("api_keys")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return keys.map(mapApiKey);
}

export async function validateApiKey(key: string): Promise<{ userId: string; scopes: string[] } | null> {
  const db = getDb();
  const hash = await hashPassword(key);
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

export async function revokeApiKey(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .deleteFrom("api_keys")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .execute();

  return (result.numChangedRows ?? 0) > 0;
}

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mfaEnabled: row.mfa_enabled === 1,
    mfaSecret: row.mfa_secret,
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