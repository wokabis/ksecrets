import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { etag } from "hono/etag";
import { compress } from "hono/compress";
import { rateLimiter } from "hono-rate-limiter";
import { getDb, initializeDatabase } from "@pwpush/db";
import { verifyToken, validateApiKey, type TokenPayload } from "@pwpush/auth";
import { encryptWithMasterKey, decryptWithMasterKey, serializationResult, deserializeResult, hashPassword, verifyPassword, generateApiKey } from "@pwpush/crypto";
import { env } from "@pwpush/db";
import {
  CreatePushSchema,
  ViewPushSchema,
  AuditLogQuerySchema,
  PushResponseSchema,
  ViewPushResponseSchema,
  AuditLogEntrySchema,
  VersionResponseSchema,
  ErrorResponseSchema,
  createErrorResponse,
} from "@pwpush/types";
import { v4 as uuidv4 } from "uuid";

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  RATE_LIMIT: KVNamespace;
};

type Variables = {
  user?: TokenPayload;
  apiKeyScopes?: string[];
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", etag());
app.use("*", compress());
app.use("*", cors({
  origin: ["*"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
}));

app.use("/api/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-Key");

  if (apiKey) {
    const validation = await validateApiKey(apiKey);
    if (!validation) {
      return c.json(createErrorResponse("UNAUTHORIZED", "Invalid API key"), 401);
    }
    c.set("apiKeyScopes", validation.scopes);
    return next();
  }

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) {
      return c.json(createErrorResponse("UNAUTHORIZED", "Invalid or expired token"), 401);
    }
    c.set("user", payload);
    return next();
  }

  return next();
});

const rateLimit = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  keyGenerator: (c) => c.req.header("CF-Connecting-IP") ?? "anonymous",
  store: {
    async increment(key: string) {
      const kv = c.env.RATE_LIMIT;
      const current = await kv.get(key);
      const count = current ? parseInt(current) + 1 : 1;
      await kv.put(key, count.toString(), { expirationTtl: 60 });
      return { totalHits: count, resetTime: Date.now() + 60000 };
    },
    async decrement(key: string) {
      const kv = c.env.RATE_LIMIT;
      const current = await kv.get(key);
      if (current) {
        const count = Math.max(0, parseInt(current) - 1);
        await kv.put(key, count.toString(), { expirationTtl: 60 });
      }
    },
    async resetKey(key: string) {
      await c.env.RATE_LIMIT.delete(key);
    },
  },
});

app.use("/api/v2/pushes", rateLimit);
app.use("/api/v2/audit", rateLimit);

app.get("/api/v2/version", (c) => {
  return c.json({
    version: "0.1.0",
    commit: "dev",
    buildDate: new Date().toISOString(),
  } satisfies VersionResponse);
});

app.post("/api/v2/pushes", async (c) => {
  const body = await c.req.json();
  const parsed = CreatePushSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const input = parsed.data;
  const db = getDb(c.env.DB);
  const id = uuidv4();
  const now = new Date().toISOString();

  let expiresAt: string | null = null;
  if (input.expiryDays) {
    expiresAt = new Date(Date.now() + input.expiryDays * 86400000).toISOString();
  } else if (input.expiryDate) {
    expiresAt = input.expiryDate;
  }

  let passphraseHash: string | null = null;
  let encryptedPayload: string;
  const masterKey = new Uint8Array(Buffer.from(env.PWPUSH_MASTER_KEY, "hex"));

  if (input.passphrase) {
    passphraseHash = await hashPassword(input.passphrase);
    const result = await encryptWithMasterKey(input.payload, masterKey, `push-${id}`);
    encryptedPayload = serializationResult(result);
  } else {
    const result = await encryptWithMasterKey(input.payload, masterKey, `push-${id}`);
    encryptedPayload = serializationResult(result);
  }

  await db.insertInto("pushes").values({
    id,
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
    created_at: now,
    expires_at: expiresAt,
    deleted_at: null,
  }).execute();

  await db.insertInto("audit_logs").values({
    id: uuidv4(),
    push_id: id,
    action: "created",
    ip: c.req.header("CF-Connecting-IP") ?? null,
    user_agent: c.req.header("User-Agent") ?? null,
    retriever_email: input.retrieverEmail ?? null,
    metadata: JSON.stringify({ kind: input.kind, hasPassphrase: !!input.passphrase }),
    created_at: now,
  }).execute();

  const baseUrl = new URL(c.req.url).origin;
  const response = {
    id,
    url: `${baseUrl}/p/${id}`,
    secretUrl: `${baseUrl}/s/${id}`,
    previewUrl: `${baseUrl}/v/${id}`,
    kind: input.kind,
    status: "active" as const,
    expiryViews: input.expiryViews ?? null,
    expiryDays: input.expiryDays ?? null,
    expiryDate: input.expiryDate ?? null,
    views: 0,
    maxViews: input.expiryViews ?? null,
    hasPassphrase: !!input.passphrase,
    filename: input.filename ?? null,
    contentType: input.contentType ?? null,
    size: input.size ?? null,
    createdAt: now,
    expiresAt,
    deletedAt: null,
  };

  return c.json(response, 201);
});

app.get("/api/v2/pushes/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ViewPushSchema.safeParse({ id, ...body });
  if (!parsed.success) {
    return c.json(createErrorResponse("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb(c.env.DB);
  const push = await db
    .selectFrom("pushes")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!push) {
    return c.json(createErrorResponse("NOT_FOUND", "Push not found"), 404);
  }

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
      await db.insertInto("audit_logs").values({
        id: uuidv4(),
        push_id: push.id,
        action: "passphrase_failed",
        ip: c.req.header("CF-Connecting-IP") ?? null,
        user_agent: c.req.header("User-Agent") ?? null,
        retriever_email: null,
        metadata: JSON.stringify({}),
        created_at: new Date().toISOString(),
      }).execute();
      return c.json(createErrorResponse("INVALID_PASSPHRASE", "Incorrect passphrase"), 403);
    }
  }

  const masterKey = new Uint8Array(Buffer.from(env.PWPUSH_MASTER_KEY, "hex"));
  let payload: string;
  try {
    const result = deserializeResult(push.payload);
    const decrypted = await decryptWithMasterKey(result, masterKey, `push-${push.id}`);
    payload = new TextDecoder().decode(decrypted);
  } catch {
    return c.json(createErrorResponse("DECRYPTION_FAILED", "Failed to decrypt payload"), 500);
  }

  const newViews = push.views + 1;
  await db
    .updateTable("pushes")
    .set({ views: newViews })
    .where("id", "=", push.id)
    .execute();

  await db.insertInto("audit_logs").values({
    id: uuidv4(),
    push_id: push.id,
    action: "viewed",
    ip: c.req.header("CF-Connecting-IP") ?? null,
    user_agent: c.req.header("User-Agent") ?? null,
    retriever_email: push.retriever_email,
    metadata: JSON.stringify({ views: newViews }),
    created_at: new Date().toISOString(),
  }).execute();

  if (push.max_views && newViews >= push.max_views) {
    await expirePush(db, push.id);
  }

  const response = {
    id: push.id,
    kind: push.kind,
    payload,
    filename: push.filename,
    contentType: push.content_type,
    size: push.size,
    views: newViews,
    maxViews: push.max_views,
    expiresAt: push.expires_at,
    note: push.note,
    retrieverEmail: push.retriever_email,
    createdAt: push.created_at,
  };

  return c.json(response);
});

app.delete("/api/v2/pushes/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);

  const push = await db
    .selectFrom("pushes")
    .select(["id", "status"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!push) {
    return c.json(createErrorResponse("NOT_FOUND", "Push not found"), 404);
  }

  await db
    .updateTable("pushes")
    .set({ status: "deleted", deleted_at: new Date().toISOString() })
    .where("id", "=", id)
    .execute();

  await db.insertInto("audit_logs").values({
    id: uuidv4(),
    push_id: id,
    action: "deleted",
    ip: c.req.header("CF-Connecting-IP") ?? null,
    user_agent: c.req.header("User-Agent") ?? null,
    retriever_email: null,
    metadata: JSON.stringify({}),
    created_at: new Date().toISOString(),
  }).execute();

  return c.body(null, 204);
});

app.get("/api/v2/audit", async (c) => {
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
  let qb = db
    .selectFrom("audit_logs")
    .selectAll()
    .orderBy("created_at", "desc")
    .limit(parsed.data.limit)
    .offset(parsed.data.offset);

  if (parsed.data.pushId) {
    qb = qb.where("push_id", "=", parsed.data.pushId);
  }
  if (parsed.data.action) {
    qb = qb.where("action", "=", parsed.data.action);
  }
  if (parsed.data.fromDate) {
    qb = qb.where("created_at", ">=", parsed.data.fromDate);
  }
  if (parsed.data.toDate) {
    qb = qb.where("created_at", "<=", parsed.data.toDate);
  }

  const items = await qb.execute();
  const totalResult = await db
    .selectFrom("audit_logs")
    .select(({ fn }) => fn.countAll().as("count"))
    .executeTakeFirst();

  const total = Number(totalResult?.count ?? 0);

  return c.json({
    items: items.map((item) => ({
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

app.post("/api/v2/auth/login", async (c) => {
  const body = await c.req.json();
  const { email, password, mfaCode } = body;

  const { authenticateUser, createAccessToken, createRefreshToken } = await import("@pwpush/auth");
  const result = await authenticateUser({ email, password, mfaCode });

  if (!result) {
    return c.json(createErrorResponse("INVALID_CREDENTIALS", "Invalid email, password, or MFA code"), 401);
  }

  if (!result.accessToken) {
    return c.json({ mfaRequired: true }, 200);
  }

  return c.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      mfaEnabled: result.user.mfaEnabled,
    },
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});

app.get("/api/v2/auth/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(createErrorResponse("UNAUTHORIZED", "Not authenticated"), 401);
  }

  const db = getDb(c.env.DB);
  const userRecord = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", user.sub)
    .executeTakeFirst();

  if (!userRecord) {
    return c.json(createErrorResponse("NOT_FOUND", "User not found"), 404);
  }

  return c.json({
    id: userRecord.id,
    email: userRecord.email,
    name: userRecord.name,
    role: userRecord.role,
    mfaEnabled: userRecord.mfa_enabled === 1,
    createdAt: userRecord.created_at,
    lastLoginAt: userRecord.last_login_at,
  });
});

app.get("/api/v2/admin/stats", async (c) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json(createErrorResponse("FORBIDDEN", "Admin access required"), 403);
  }

  const db = getDb(c.env.DB);
  const [pushStats, auditStats, userStats] = await Promise.all([
    db.selectFrom("pushes").select(({ fn }) => [
      fn.countAll().as("total"),
      fn.countAll().where("status", "=", "active").as("active"),
      fn.countAll().where("status", "=", "expired").as("expired"),
      fn.countAll().where("status", "=", "deleted").as("deleted"),
    ]).executeTakeFirst(),
    db.selectFrom("audit_logs").select(({ fn }) => fn.countAll().as("count")).executeTakeFirst(),
    db.selectFrom("users").select(({ fn }) => fn.countAll().as("count")).executeTakeFirst(),
  ]);

  return c.json({
    pushes: pushStats,
    auditLogs: auditStats,
    users: userStats,
  });
});

export async function expirePush(db: ReturnType<typeof getDb>, pushId: string): Promise<void> {
  await db
    .updateTable("pushes")
    .set({ status: "expired", deleted_at: new Date().toISOString() })
    .where("id", "=", pushId)
    .execute();

  await db.insertInto("audit_logs").values({
    id: uuidv4(),
    push_id: pushId,
    action: "expired",
    ip: null,
    user_agent: null,
    retriever_email: null,
    metadata: JSON.stringify({}),
    created_at: new Date().toISOString(),
  }).execute();
}

export async function cleanupExpiredPushes(db: ReturnType<typeof getDb>): Promise<number> {
  const expired = await db
    .selectFrom("pushes")
    .select("id")
    .where("status", "=", "active")
    .where("expires_at", "<", new Date().toISOString())
    .execute();

  for (const push of expired) {
    await expirePush(db, push.id);
  }

  return expired.length;
}

export default app;