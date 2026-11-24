import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { etag } from "hono/etag";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { getDb, initializeDatabase, getSetting, env, type Kysely, type Schema } from "@ksecrets/db";
import {
  configureAuth,
  verifyToken,
  verifyRefreshToken,
  validateApiKey,
  authenticateUser,
  createUser,
  getUserById,
  countUsers,
  enableMfaSetup,
  confirmMfa,
  disableMfa,
  createApiKey,
  getApiKeysByUserId,
  revokeApiKey,
  updateProfile,
  updatePassword,
  createAccessToken,
  createRefreshToken,
  type TokenPayload,
} from "@ksecrets/auth";
import {
  encryptWithMasterKey,
  decryptWithMasterKey,
  serializationResult,
  deserializeResult,
  hashPassword,
  verifyPassword,
} from "@ksecrets/crypto";
import { CreatePushSchema, ViewPushSchema, AuditLogQuerySchema, createErrorResponse } from "@ksecrets/types";

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  RATE_LIMIT: KVNamespace;
  SECRET_KEY_BASE: string;
  KSECRETS_MASTER_KEY: string;
  CORS_ORIGINS?: string;
  WEB_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ENVIRONMENT?: string;
};

type Variables = {
  user?: TokenPayload;
};

type Db = Kysely<Schema>;
type AppContext = any;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ACCESS_COOKIE = "ks_at";
const REFRESH_COOKIE = "ks_rt";

app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", etag());
app.use(
  "*",
  cors({
    origin: (origin: string, c: AppContext) => {
      const allowed = (c.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((value: string) => value.trim())
        .filter(Boolean);
      if (!origin) return "*";
      if (allowed.length === 0 || allowed.includes(origin)) return origin;
      return allowed[0];
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
    credentials: true,
  })
);

let initPromise: Promise<void> | null = null;

async function ensureDb(c: AppContext): Promise<void> {
  if (!initPromise) {
    initPromise = initializeDatabase(c.env.DB).catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

async function resolveIdentity(c: AppContext): Promise<{ user: TokenPayload | null; invalidKey: boolean }> {
  const apiKey = c.req.header("X-API-Key");
  const db = getDb(c.env.DB);

  if (apiKey) {
    const validation = await validateApiKey(db, apiKey);
    if (!validation) return { user: null, invalidKey: true };
    const record = await db
      .selectFrom("users")
      .select(["id", "email", "role"])
      .where("id", "=", validation.userId)
      .executeTakeFirst();
    if (!record) return { user: null, invalidKey: true };
    return {
      user: {
        sub: record.id,
        email: record.email,
        role: record.role as "admin" | "user",
        mfaVerified: true,
        scopes: validation.scopes,
      },
      invalidKey: false,
    };
  }

  const authHeader = c.req.header("Authorization");
  let token: string | undefined;
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
  if (!token) token = getCookie(c, ACCESS_COOKIE);
  if (!token) return { user: null, invalidKey: false };

  return { user: await verifyToken(token), invalidKey: false };
}

app.use("/api/*", async (c, next) => {
  await ensureDb(c);
  configureAuth({ secretKeyBase: c.env.SECRET_KEY_BASE || env.SECRET_KEY_BASE });
  const identity = await resolveIdentity(c);
  if (identity.invalidKey) {
    return c.json(createErrorResponse("UNAUTHORIZED", "Invalid API key"), 401);
  }
  if (identity.user) c.set("user", identity.user);
  await next();
});

function isSecure(c: AppContext): boolean {
  return (
    new URL(c.req.url).protocol === "https:" ||
    c.req.header("X-Forwarded-Proto") === "https"
  );
}

function setAuthCookies(c: AppContext, accessToken: string, refreshToken: string): void {
  const secure = isSecure(c);
  const sameSite = secure ? "None" : "Lax";
  setCookie(c, ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  setCookie(c, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function clearAuthCookies(c: AppContext): void {
  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/" });
}

function requireUser(c: AppContext): TokenPayload | null {
  return c.get("user") ?? null;
}

function isAdmin(user: TokenPayload | null): boolean {
  return user?.role === "admin";
}

function webBase(c: AppContext): string {
  const configured = c.env.WEB_URL as string | undefined;
  const origin = c.req.header("Origin");
  const requestOrigin = new URL(c.req.url).origin;
  return (configured || origin || requestOrigin).replace(/\/$/, "");
}

function masterKey(c: AppContext): Uint8Array {
  const raw = (c.env.KSECRETS_MASTER_KEY || env.KSECRETS_MASTER_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("KSECRETS_MASTER_KEY must be a 32-byte hex string");
  }
  return Uint8Array.from(raw.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16)));
}

async function audit(
  db: Db,
  pushId: string,
  action: "created" | "viewed" | "expired" | "deleted" | "burned" | "passphrase_failed",
  c: AppContext,
  metadata: Record<string, unknown> = {},
  retrieverEmail: string | null = null
): Promise<void> {
  await db
    .insertInto("audit_logs")
    .values({
      id: crypto.randomUUID(),
      push_id: pushId,
      action,
      ip: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null,
      user_agent: c.req.header("User-Agent") ?? null,
      retriever_email: retrieverEmail,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString(),
    })
    .execute();
}

async function allowRequest(c: AppContext, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const kv = c.env.RATE_LIMIT;
  if (!kv) return true;
  const ip = c.req.header("CF-Connecting-IP") ?? "anonymous";
  const windowIndex = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${bucket}:${ip}:${windowIndex}`;
  const current = Number((await kv.get(key)) ?? "0");
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: Math.max(windowSeconds, 60) });
  return true;
}

function tooMany(c: AppContext) {
  return c.json(createErrorResponse("RATE_LIMITED", "Too many requests. Please try again later."), 429);
}

function serializePush(push: any, base: string) {
  return {
    id: push.id,
    url: `${base}/p/${push.id}`,
    secretUrl: `${base}/s/${push.id}`,
    previewUrl: `${base}/v/${push.id}`,
    kind: push.kind,
    status: push.status,
    expiryViews: push.expiry_views ?? null,
    expiryDays: push.expiry_days ?? null,
    expiryDate: push.expiry_date ?? null,
    views: push.views ?? 0,
    maxViews: push.max_views ?? null,
    hasPassphrase: !!push.passphrase_hash,
    filename: push.filename ?? null,
    contentType: push.content_type ?? null,
    size: push.size ?? null,
    createdAt: push.created_at,
    expiresAt: push.expires_at ?? null,
    deletedAt: push.deleted_at ?? null,
  };
}

function serializeUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    mfaEnabled: user.mfa_enabled === 1 || user.mfaEnabled === true,
    createdAt: user.created_at ?? user.createdAt,
    lastLoginAt: user.last_login_at ?? user.lastLoginAt ?? null,
  };
}

async function sendNotificationEmail(c: AppContext, to: string, subject: string, html: string): Promise<void> {
  const key = c.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: c.env.EMAIL_FROM || "KSecrets <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
  } catch {
    // email delivery is best-effort
  }
}

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  name: z.string().max(128).optional(),
});

const ProfileSchema = z.object({
  name: z.string().max(128).nullable().optional(),
});

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(128),
});

const MfaVerifySchema = z.object({
  code: z.string().min(6).max(16),
});

const ApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.enum(["pushes:read", "pushes:write", "audit:read", "admin"])).default(["pushes:write"]),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

const SettingsUpdateSchema = z.record(
  z.enum([
    "site_name",
    "site_url",
    "theme",
    "custom_css",
    "default_expiry_views",
    "default_expiry_days",
    "max_payload_size",
    "max_file_size",
    "require_https",
    "allow_anonymous",
    "require_mfa",
    "retention_days",
  ]),
  z.string()
);

app.get("/health", (c) => c.json({ status: "ok", service: "ksecrets-api", timestamp: new Date().toISOString() }));

app.get("/api/v2/version", (c) => {
  return c.json({
    version: "1.0.0",
    commit: c.env.ENVIRONMENT ?? "production",
    buildDate: new Date().toISOString(),
  });
});

app.get("/api/v2/openapi.json", (c) => {
  const base = new URL(c.req.url).origin;
  return c.json({
    openapi: "3.1.0",
    info: {
      title: "KSecrets API",
      version: "1.0.0",
      description: "Zero-knowledge secret sharing API with expiring links, audit trails, MFA and API keys.",
    },
    servers: [{ url: `${base}/api/v2` }],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
    },
    paths: {
      "/pushes": { get: { summary: "List your pushes" }, post: { summary: "Create a push" } },
      "/pushes/{id}": {
        get: { summary: "View a push" },
        post: { summary: "View a passphrase-protected push" },
        delete: { summary: "Delete a push" },
      },
      "/audit": { get: { summary: "Query audit logs" } },
      "/auth/register": { post: { summary: "Create an account" } },
      "/auth/login": { post: { summary: "Authenticate" } },
      "/auth/me": { get: { summary: "Current user" } },
      "/auth/api-keys": { get: { summary: "List API keys" }, post: { summary: "Create API key" } },
      "/auth/mfa/enable": { post: { summary: "Start MFA enrollment" } },
      "/admin/stats": { get: { summary: "Instance statistics" } },
    },
  });
});

app.post("/api/v2/auth/register", async (c) => {
  if (!(await allowRequest(c, "register", 10, 60))) return tooMany(c);
  const parsed = RegisterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid registration details", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", parsed.data.email.toLowerCase())
    .executeTakeFirst();
  if (existing) {
    return c.json(createErrorResponse("EMAIL_TAKEN", "An account with this email already exists"), 409);
  }

  const role = (await countUsers(db)) === 0 ? "admin" : "user";
  const user = await createUser(db, {
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
    role,
  });

  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    mfaVerified: false,
    scopes: role === "admin" ? ["admin", "pushes:read", "pushes:write", "audit:read"] : ["pushes:read", "pushes:write"],
  };
  const accessToken = await createAccessToken(payload);
  const refreshToken = await createRefreshToken(user.id);
  setAuthCookies(c, accessToken, refreshToken);

  return c.json({ user: serializeUser(user), accessToken, refreshToken }, 201);
});

app.post("/api/v2/auth/login", async (c) => {
  if (!(await allowRequest(c, "login", 20, 60))) return tooMany(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
      mfaCode: z.string().min(6).max(16).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Email and password are required", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const result = await authenticateUser(db, parsed.data);
  if (!result) {
    return c.json(createErrorResponse("INVALID_CREDENTIALS", "Invalid email, password, or MFA code"), 401);
  }
  if (result.mfaRequired) {
    return c.json({ mfaRequired: true }, 200);
  }

  setAuthCookies(c, result.accessToken!, result.refreshToken!);
  return c.json({
    user: serializeUser(result.user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});

app.post("/api/v2/auth/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = (body.refreshToken as string | undefined) ?? getCookie(c, REFRESH_COOKIE);
  if (!token) return c.json(createErrorResponse("UNAUTHORIZED", "Missing refresh token"), 401);

  const verified = await verifyRefreshToken(token);
  if (!verified) return c.json(createErrorResponse("UNAUTHORIZED", "Invalid refresh token"), 401);

  const db = getDb(c.env.DB);
  const user = await getUserById(db, verified.sub);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "User no longer exists"), 401);

  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    mfaVerified: user.mfaEnabled,
    scopes:
      user.role === "admin"
        ? ["admin", "pushes:read", "pushes:write", "audit:read"]
        : ["pushes:read", "pushes:write"],
  };
  const accessToken = await createAccessToken(payload);
  const refreshToken = await createRefreshToken(user.id);
  setAuthCookies(c, accessToken, refreshToken);
  return c.json({ accessToken, refreshToken });
});

app.post("/api/v2/auth/logout", (c) => {
  clearAuthCookies(c);
  return c.body(null, 204);
});

app.get("/api/v2/auth/me", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const db = getDb(c.env.DB);
  const record = await db.selectFrom("users").selectAll().where("id", "=", user.sub).executeTakeFirst();
  if (!record) return c.json(createErrorResponse("NOT_FOUND", "User not found"), 404);

  return c.json(serializeUser(record));
});

app.put("/api/v2/auth/profile", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const parsed = ProfileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid profile", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const updated = await updateProfile(db, user.sub, parsed.data);
  if (!updated) return c.json(createErrorResponse("NOT_FOUND", "User not found"), 404);

  const record = await db.selectFrom("users").selectAll().where("id", "=", user.sub).executeTakeFirst();
  return c.json(serializeUser(record));
});

app.put("/api/v2/auth/password", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const parsed = PasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid password payload", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const ok = await updatePassword(db, user.sub, parsed.data.currentPassword, parsed.data.newPassword);
  if (!ok) {
    return c.json(createErrorResponse("INVALID_PASSWORD", "Current password is incorrect"), 403);
  }
  return c.json({ success: true });
});

app.get("/api/v2/auth/api-keys", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const db = getDb(c.env.DB);
  const items = await getApiKeysByUserId(db, user.sub);
  return c.json({ items });
});

app.post("/api/v2/auth/api-keys", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const parsed = ApiKeyCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid API key request", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const result = await createApiKey(db, user.sub, parsed.data);
  return c.json(result, 201);
});

app.delete("/api/v2/auth/api-keys/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const db = getDb(c.env.DB);
  const revoked = await revokeApiKey(db, c.req.param("id"), user.sub);
  if (!revoked) return c.json(createErrorResponse("NOT_FOUND", "API key not found"), 404);
  return c.body(null, 204);
});

app.post("/api/v2/auth/mfa/enable", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const db = getDb(c.env.DB);
  const setup = await enableMfaSetup(db, user.sub, user.email);
  return c.json(setup);
});

app.post("/api/v2/auth/mfa/verify", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const parsed = MfaVerifySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(createErrorResponse("VALIDATION_ERROR", "A 6-digit code is required"), 400);

  const db = getDb(c.env.DB);
  const valid = await confirmMfa(db, user.sub, parsed.data.code);
  if (!valid) return c.json(createErrorResponse("INVALID_MFA_CODE", "Invalid authenticator code"), 403);
  return c.json({ success: true, mfaEnabled: true });
});

app.post("/api/v2/auth/mfa/disable", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const db = getDb(c.env.DB);
  await disableMfa(db, user.sub);
  return c.json({ success: true, mfaEnabled: false });
});

app.post("/api/v2/pushes", async (c) => {
  if (!(await allowRequest(c, "create-push", 60, 60))) return tooMany(c);

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreatePushSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const identity = requireUser(c);
  const db = getDb(c.env.DB);

  if (!identity) {
    const allowAnonymous = await getSetting(db, "allow_anonymous", "true");
    if (allowAnonymous !== "true") {
      return c.json(createErrorResponse("UNAUTHORIZED", "Authentication required"), 401);
    }
  }

  const maxPayload = Number(await getSetting(db, "max_payload_size", "10000000"));
  if (parsed.data.payload.length > maxPayload) {
    return c.json(createErrorResponse("PAYLOAD_TOO_LARGE", "Payload exceeds the configured size limit"), 413);
  }

  const input = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let expiresAt: string | null = null;
  if (input.expiryDays) {
    expiresAt = new Date(Date.now() + input.expiryDays * 86400000).toISOString();
  } else if (input.expiryDate) {
    expiresAt = input.expiryDate;
  }

  const passphraseHash = input.passphrase ? await hashPassword(input.passphrase) : null;
  let encryptedPayload: string;
  try {
    const result = await encryptWithMasterKey(input.payload, masterKey(c), `push-${id}`);
    encryptedPayload = serializationResult(result);
  } catch {
    return c.json(createErrorResponse("MISCONFIGURED", "Server encryption key is not configured"), 500);
  }

  await db
    .insertInto("pushes")
    .values({
      id,
      user_id: identity?.sub ?? null,
      kind: input.kind,
      payload: encryptedPayload,
      passphrase_hash: passphraseHash,
      expiry_views: input.expiryViews ?? null,
      expiry_days: input.expiryDays ?? null,
      expiry_date: input.expiryDate ?? null,
      max_views: input.expiryViews ?? null,
      filename: input.filename ?? null,
      content_type: input.contentType ?? null,
      size: input.size ?? null,
      retriever_email: input.retrieverEmail ?? null,
      note: input.note ?? null,
      status: "active",
      views: 0,
      created_at: now,
      expires_at: expiresAt,
      deleted_at: null,
    })
    .execute();

  await audit(db, id, "created", c, { kind: input.kind, hasPassphrase: !!input.passphrase }, input.retrieverEmail ?? null);

  const base = webBase(c);
  const response = {
    ...serializePush(
      {
        id,
        kind: input.kind,
        status: "active",
        expiry_views: input.expiryViews ?? null,
        expiry_days: input.expiryDays ?? null,
        expiry_date: input.expiryDate ?? null,
        views: 0,
        max_views: input.expiryViews ?? null,
        passphrase_hash: passphraseHash,
        filename: input.filename ?? null,
        content_type: input.contentType ?? null,
        size: input.size ?? null,
        created_at: now,
        expires_at: expiresAt,
        deleted_at: null,
      },
      base
    ),
  };

  if (input.retrieverEmail) {
    const link = `${base}/p/${id}`;
    const emailPromise = sendNotificationEmail(
      c,
      input.retrieverEmail,
      "A secure secret has been shared with you",
      `<p>A secure secret has been shared with you.</p><p><a href="${link}">Open it on KSecrets</a></p><p>It will expire according to the sender's settings.</p>`
    );
    try {
      c.executionCtx.waitUntil(emailPromise);
    } catch {
      void emailPromise;
    }
  }

  return c.json(response, 201);
});

app.post("/api/v2/files", async (c) => {
  if (!(await allowRequest(c, "upload-file", 30, 60))) return tooMany(c);

  const identity = requireUser(c);
  const db = getDb(c.env.DB);

  if (!identity) {
    const allowAnonymous = await getSetting(db, "allow_anonymous", "true");
    if (allowAnonymous !== "true") {
      return c.json(createErrorResponse("UNAUTHORIZED", "Authentication required"), 401);
    }
  }

  const form = await c.req.formData().catch(() => null);
  if (!form) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Expected multipart/form-data"), 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "A file is required"), 400);
  }

  const maxFile = Number(await getSetting(db, "max_file_size", "100000000"));
  if (file.size > maxFile) {
    return c.json(createErrorResponse("PAYLOAD_TOO_LARGE", "File exceeds the configured size limit"), 413);
  }

  const passphrase = String(form.get("passphrase") || "") || null;
  const expiryDaysRaw = Number(form.get("expiryDays") || 0);
  const expiryViewsRaw = Number(form.get("expiryViews") || 0);
  const expiryDays = Number.isFinite(expiryDaysRaw) && expiryDaysRaw > 0 ? Math.min(expiryDaysRaw, 3650) : null;
  const expiryViews = Number.isFinite(expiryViewsRaw) && expiryViewsRaw > 0 ? Math.min(expiryViewsRaw, 1000) : null;
  const note = String(form.get("note") || "").slice(0, 1000) || null;
  const retrieverEmail = String(form.get("retrieverEmail") || "").slice(0, 320) || null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = expiryDays ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null;
  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(0, 200) || "file";
  const r2Key = `pushes/${id}/${safeName}`;
  const passphraseHash = passphrase ? await hashPassword(passphrase) : null;

  try {
    await c.env.FILES.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
  } catch {
    return c.json(createErrorResponse("STORAGE_ERROR", "Unable to store file"), 500);
  }

  try {
    await db
      .insertInto("pushes")
      .values({
        id,
        user_id: identity?.sub ?? null,
        kind: "file",
        payload: "",
        passphrase_hash: passphraseHash,
        expiry_views: expiryViews,
        expiry_days: expiryDays,
        expiry_date: null,
        max_views: expiryViews,
        filename: file.name.slice(0, 255),
        content_type: file.type || "application/octet-stream",
        size: file.size,
        retriever_email: retrieverEmail,
        note,
        status: "active",
        views: 0,
        created_at: now,
        expires_at: expiresAt,
        deleted_at: null,
      })
      .execute();

    await db
      .insertInto("files")
      .values({
        id: crypto.randomUUID(),
        push_id: id,
        r2_key: r2Key,
        filename: file.name.slice(0, 255),
        content_type: file.type || "application/octet-stream",
        size: file.size,
        created_at: now,
      })
      .execute();
  } catch {
    await c.env.FILES.delete(r2Key).catch(() => undefined);
    return c.json(createErrorResponse("INTERNAL_ERROR", "Unable to create file push"), 500);
  }

  await audit(db, id, "created", c, { kind: "file", size: file.size, hasPassphrase: !!passphrase }, retrieverEmail);

  const base = webBase(c);
  return c.json(
    {
      ...serializePush(
        {
          id,
          kind: "file",
          status: "active",
          expiry_views: expiryViews,
          expiry_days: expiryDays,
          expiry_date: null,
          views: 0,
          max_views: expiryViews,
          passphrase_hash: passphraseHash,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size: file.size,
          created_at: now,
          expires_at: expiresAt,
          deleted_at: null,
        },
        base
      ),
      downloadUrl: `/api/v2/pushes/${id}/download`,
    },
    201
  );
});

app.get("/api/v2/pushes", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50") || 50, 1), 200);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0") || 0, 0);
  const status = c.req.query("status");
  const scopeAll = isAdmin(user) && c.req.query("scope") === "all";

  const db = getDb(c.env.DB);
  const applyFilters = (qb: any) => {
    if (!scopeAll) qb = qb.where("user_id", "=", user.sub);
    if (status && ["active", "expired", "deleted", "burned"].includes(status)) {
      qb = qb.where("status", "=", status as any);
    }
    return qb;
  };

  const items = await applyFilters(
    db.selectFrom("pushes").selectAll().orderBy("created_at", "desc").limit(limit).offset(offset)
  ).execute();
  const totalRow = await applyFilters(
    db.selectFrom("pushes").select(({ fn }) => fn.countAll().as("count"))
  ).executeTakeFirst();

  const base = webBase(c);
  const total = Number(totalRow?.count ?? 0);

  return c.json({
    items: items.map((push: any) => serializePush(push, base)),
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  });
});

async function viewPush(c: AppContext) {
  if (!(await allowRequest(c, "view-push", 120, 60))) return tooMany(c);

  const id = c.req.param("id");
  const body =
    c.req.method === "POST" ? await c.req.json().catch(() => ({})) : { passphrase: c.req.query("passphrase") };
  const parsed = ViewPushSchema.safeParse({ id, ...body });
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const push = await db.selectFrom("pushes").selectAll().where("id", "=", id).executeTakeFirst();
  if (!push) return c.json(createErrorResponse("NOT_FOUND", "Push not found"), 404);

  if (push.status !== "active") {
    return c.json(createErrorResponse("EXPIRED", "This push has expired or been deleted"), 410);
  }

  if (push.expires_at && new Date(push.expires_at) < new Date()) {
    await expirePush(db, push.id);
    return c.json(createErrorResponse("EXPIRED", "This push has expired"), 410);
  }

  if (push.max_views && push.views >= push.max_views) {
    await expirePush(db, push.id);
    return c.json(createErrorResponse("EXPIRED", "Maximum views reached"), 410);
  }

  if (push.passphrase_hash) {
    if (!parsed.data.passphrase) {
      return c.json(createErrorResponse("PASSPHRASE_REQUIRED", "This push requires a passphrase"), 403);
    }
    const valid = await verifyPassword(parsed.data.passphrase, push.passphrase_hash);
    if (!valid) {
      await audit(db, push.id, "passphrase_failed", c);
      return c.json(createErrorResponse("INVALID_PASSPHRASE", "Incorrect passphrase"), 403);
    }
  }

  if (push.kind === "file") {
    return c.json({
      id: push.id,
      kind: push.kind,
      payload: "",
      downloadUrl: `/api/v2/pushes/${push.id}/download`,
      filename: push.filename,
      contentType: push.content_type,
      size: push.size,
      views: push.views,
      maxViews: push.max_views,
      expiresAt: push.expires_at,
      note: push.note,
      retrieverEmail: push.retriever_email,
      createdAt: push.created_at,
    });
  }

  let payload: string;
  try {
    const result = deserializeResult(push.payload);
    const decrypted = await decryptWithMasterKey(result, masterKey(c), `push-${push.id}`);
    payload = new TextDecoder().decode(decrypted);
  } catch {
    return c.json(createErrorResponse("DECRYPTION_FAILED", "Failed to decrypt payload"), 500);
  }

  const newViews = push.views + 1;
  await db.updateTable("pushes").set({ views: newViews }).where("id", "=", push.id).execute();
  await audit(db, push.id, "viewed", c, { views: newViews }, push.retriever_email);

  if (push.max_views && newViews >= push.max_views) {
    await expirePush(db, push.id);
  }

  return c.json({
    id: push.id,
    kind: push.kind,
    payload,
    encryptedPayload: payload,
    filename: push.filename,
    contentType: push.content_type,
    size: push.size,
    views: newViews,
    maxViews: push.max_views,
    expiresAt: push.expires_at,
    note: push.note,
    retrieverEmail: push.retriever_email,
    createdAt: push.created_at,
  });
}

app.get("/api/v2/pushes/:id", viewPush);
app.post("/api/v2/pushes/:id", viewPush);

async function downloadFile(c: AppContext) {
  if (!(await allowRequest(c, "download-file", 60, 60))) return tooMany(c);

  const id = c.req.param("id");
  const body =
    c.req.method === "POST" ? await c.req.json().catch(() => ({})) : { passphrase: c.req.query("passphrase") };
  const parsed = ViewPushSchema.safeParse({ id, ...body });
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const push = await db.selectFrom("pushes").selectAll().where("id", "=", id).executeTakeFirst();
  if (!push) return c.json(createErrorResponse("NOT_FOUND", "Push not found"), 404);
  if (push.kind !== "file") return c.json(createErrorResponse("NOT_FOUND", "Not a file push"), 404);
  if (push.status !== "active") {
    return c.json(createErrorResponse("EXPIRED", "This push has expired or been deleted"), 410);
  }
  if (push.expires_at && new Date(push.expires_at) < new Date()) {
    await expirePush(db, push.id);
    return c.json(createErrorResponse("EXPIRED", "This push has expired"), 410);
  }
  if (push.max_views && push.views >= push.max_views) {
    await expirePush(db, push.id);
    return c.json(createErrorResponse("EXPIRED", "Maximum views reached"), 410);
  }
  if (push.passphrase_hash) {
    if (!parsed.data.passphrase) {
      return c.json(createErrorResponse("PASSPHRASE_REQUIRED", "This push requires a passphrase"), 403);
    }
    const valid = await verifyPassword(parsed.data.passphrase, push.passphrase_hash);
    if (!valid) {
      await audit(db, push.id, "passphrase_failed", c);
      return c.json(createErrorResponse("INVALID_PASSPHRASE", "Incorrect passphrase"), 403);
    }
  }

  const fileRow = await db.selectFrom("files").selectAll().where("push_id", "=", push.id).executeTakeFirst();
  if (!fileRow) return c.json(createErrorResponse("NOT_FOUND", "File not found"), 404);

  const object = await c.env.FILES.get(fileRow.r2_key);
  if (!object) return c.json(createErrorResponse("NOT_FOUND", "File no longer available"), 404);

  const newViews = push.views + 1;
  await db.updateTable("pushes").set({ views: newViews }).where("id", "=", push.id).execute();
  await audit(db, push.id, "viewed", c, { views: newViews, download: true }, push.retriever_email);
  if (push.max_views && newViews >= push.max_views) {
    await expirePush(db, push.id);
  }

  const asciiName = fileRow.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(object.body, {
    headers: {
      "Content-Type": fileRow.content_type || "application/octet-stream",
      "Content-Length": String(fileRow.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileRow.filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

app.get("/api/v2/pushes/:id/download", downloadFile);
app.post("/api/v2/pushes/:id/download", downloadFile);

app.delete("/api/v2/pushes/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const push = await db.selectFrom("pushes").select(["id", "user_id", "status", "kind"]).where("id", "=", id).executeTakeFirst();
  if (!push) return c.json(createErrorResponse("NOT_FOUND", "Push not found"), 404);
  if (user.role !== "admin" && push.user_id !== user.sub) {
    return c.json(createErrorResponse("FORBIDDEN", "You do not own this push"), 403);
  }

  if (push.kind === "file") {
    const fileRow = await db.selectFrom("files").select("r2_key").where("push_id", "=", id).executeTakeFirst();
    if (fileRow) await c.env.FILES.delete(fileRow.r2_key).catch(() => undefined);
  }

  await db
    .updateTable("pushes")
    .set({ status: "deleted", deleted_at: new Date().toISOString() })
    .where("id", "=", id)
    .execute();
  await audit(db, id, "deleted", c);

  return c.body(null, 204);
});

app.get("/api/v2/audit", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);

  const query = c.req.query();
  const parsed = AuditLogQuerySchema.safeParse({
    ...query,
    limit: query.limit ? parseInt(query.limit) : undefined,
    offset: query.offset ? parseInt(query.offset) : undefined,
  });
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid query parameters", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const scopeAll = isAdmin(user) && query.scope === "all";

  let ownedIds: string[] | null = null;
  if (!scopeAll) {
    const owned = await db.selectFrom("pushes").select("id").where("user_id", "=", user.sub).execute();
    ownedIds = owned.map((row) => row.id);
    if (ownedIds.length === 0) {
      return c.json({ items: [], total: 0, limit: parsed.data.limit, offset: parsed.data.offset, hasMore: false });
    }
  }

  const applyFilters = (qb: any) => {
    if (ownedIds) qb = qb.where("push_id", "in", ownedIds);
    if (parsed.data.pushId) qb = qb.where("push_id", "=", parsed.data.pushId);
    if (parsed.data.action) qb = qb.where("action", "=", parsed.data.action);
    if (parsed.data.fromDate) qb = qb.where("created_at", ">=", parsed.data.fromDate);
    if (parsed.data.toDate) qb = qb.where("created_at", "<=", parsed.data.toDate);
    return qb;
  };

  const items = await applyFilters(
    db
      .selectFrom("audit_logs")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(parsed.data.limit)
      .offset(parsed.data.offset)
  ).execute();
  const totalRow = await applyFilters(
    db.selectFrom("audit_logs").select(({ fn }) => fn.countAll().as("count"))
  ).executeTakeFirst();
  const total = Number(totalRow?.count ?? 0);

  return c.json({
    items: items.map((item: any) => ({
      id: item.id,
      pushId: item.push_id,
      action: item.action,
      ip: item.ip,
      userAgent: item.user_agent,
      retrieverEmail: item.retriever_email,
      metadata: item.metadata ? JSON.parse(item.metadata) : {},
      createdAt: item.created_at,
    })),
    total,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    hasMore: parsed.data.offset + parsed.data.limit < total,
  });
});

app.get("/api/v2/admin/stats", async (c) => {
  const user = requireUser(c);
  if (!isAdmin(user)) return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);

  const db = getDb(c.env.DB);
  const count = async (table: "pushes" | "audit_logs" | "users", status?: string) => {
    let qb: any = db.selectFrom(table).select(({ fn }: any) => fn.countAll().as("count"));
    if (status) qb = qb.where("status", "=", status);
    const row = await qb.executeTakeFirst();
    return Number(row?.count ?? 0);
  };

  const [total, active, expired, deleted, auditCount, userCount] = await Promise.all([
    count("pushes"),
    count("pushes", "active"),
    count("pushes", "expired"),
    count("pushes", "deleted"),
    count("audit_logs"),
    count("users"),
  ]);

  return c.json({
    pushes: { total, active, expired, deleted },
    auditLogs: { count: auditCount },
    users: { count: userCount },
  });
});

app.get("/api/v2/admin/users", async (c) => {
  const user = requireUser(c);
  if (!isAdmin(user)) return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);

  const db = getDb(c.env.DB);
  const users = await db
    .selectFrom("users")
    .select(["id", "email", "name", "role", "mfa_enabled", "created_at", "last_login_at"])
    .orderBy("created_at", "asc")
    .execute();

  return c.json({ items: users.map((row) => serializeUser({ ...row, mfaEnabled: row.mfa_enabled === 1 })) });
});

const AdminUserUpdateSchema = z.object({
  name: z.string().max(128).nullable().optional(),
  role: z.enum(["admin", "user"]).optional(),
});

app.patch("/api/v2/admin/users/:id", async (c) => {
  const user = requireUser(c);
  if (!isAdmin(user)) return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);

  const parsed = AdminUserUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid user update", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (Object.keys(updates).length === 0) return c.json({ success: true });

  await db.updateTable("users").set(updates as any).where("id", "=", c.req.param("id")).execute();
  const row = await db.selectFrom("users").selectAll().where("id", "=", c.req.param("id")).executeTakeFirst();
  if (!row) return c.json(createErrorResponse("NOT_FOUND", "User not found"), 404);
  return c.json(serializeUser(row));
});

app.delete("/api/v2/admin/users/:id", async (c) => {
  const user = requireUser(c);
  if (!user || user.role !== "admin") return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);
  if (c.req.param("id") === user.sub) {
    return c.json(createErrorResponse("FORBIDDEN", "You cannot delete your own account"), 400);
  }

  const db = getDb(c.env.DB);
  await db.deleteFrom("users").where("id", "=", c.req.param("id")).execute();
  return c.body(null, 204);
});

app.get("/api/v2/admin/export/:type", async (c) => {
  const user = requireUser(c);
  if (!isAdmin(user)) return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);

  const type = c.req.param("type");
  const db = getDb(c.env.DB);

  let data: unknown;
  if (type === "pushes") {
    data = await db.selectFrom("pushes").selectAll().orderBy("created_at", "desc").execute();
  } else if (type === "audit") {
    data = await db.selectFrom("audit_logs").selectAll().orderBy("created_at", "desc").execute();
  } else if (type === "users") {
    const rows = await db
      .selectFrom("users")
      .select(["id", "email", "name", "role", "mfa_enabled", "created_at", "last_login_at"])
      .execute();
    data = rows.map((row) => serializeUser({ ...row, mfaEnabled: row.mfa_enabled === 1 }));
  } else {
    return c.json(createErrorResponse("INVALID_EXPORT", "Export type must be pushes, audit, or users"), 400);
  }

  return c.json(data);
});

app.get("/api/v2/settings", async (c) => {
  const db = getDb(c.env.DB);
  const keys = ["site_name", "theme", "allow_anonymous", "require_mfa", "max_payload_size", "max_file_size", "default_expiry_views", "default_expiry_days"];
  const rows = await db.selectFrom("settings").selectAll().where("key", "in", keys).execute();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return c.json(settings);
});

app.put("/api/v2/settings", async (c) => {
  const user = requireUser(c);
  if (!isAdmin(user)) return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);

  const parsed = SettingsUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid settings payload", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  for (const [key, value] of Object.entries(parsed.data)) {
    await db
      .insertInto("settings")
      .values({ key, value, updated_at: new Date().toISOString() })
      .onConflict((oc) =>
        oc.column("key").doUpdateSet({ value, updated_at: new Date().toISOString() })
      )
      .execute();
  }
  return c.json({ success: true });
});

export async function expirePush(db: Db, pushId: string): Promise<void> {
  await db
    .updateTable("pushes")
    .set({ status: "expired", deleted_at: new Date().toISOString() })
    .where("id", "=", pushId)
    .execute();

  await db
    .insertInto("audit_logs")
    .values({
      id: crypto.randomUUID(),
      push_id: pushId,
      action: "expired",
      ip: null,
      user_agent: null,
      retriever_email: null,
      metadata: JSON.stringify({}),
      created_at: new Date().toISOString(),
    })
    .execute();
}

export async function cleanupExpiredPushes(db: Db): Promise<number> {
  const expired = await db
    .selectFrom("pushes")
    .select("id")
    .where("status", "=", "active")
    .where("expires_at", "<", new Date().toISOString())
    .execute();

  for (const push of expired) {
    await expirePush(db, push.id);
  }

  const retentionDays = Number(await getSetting(db, "retention_days", "30"));
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  await db
    .deleteFrom("pushes")
    .where("status", "in", ["expired", "deleted"])
    .where("created_at", "<", cutoff)
    .execute();

  return expired.length;
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: any, env: Bindings, ctx: any) => {
    await initializeDatabase(env.DB);
    const db = getDb(env.DB);
    ctx.waitUntil(cleanupExpiredPushes(db));
  },
};
