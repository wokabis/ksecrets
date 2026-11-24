import { z } from "zod";

export const PushKind = z.enum(["password", "note", "file", "url"]);
export type PushKind = z.infer<typeof PushKind>;

export const PushStatus = z.enum(["active", "expired", "deleted", "burned"]);
export type PushStatus = z.infer<typeof PushStatus>;

export const CreatePushSchema = z.object({
  kind: PushKind,
  payload: z.string().min(1).max(10_000_000),
  passphrase: z.string().max(256).optional(),
  expiryViews: z.number().int().positive().max(1000).optional(),
  expiryDays: z.number().int().positive().max(365).optional(),
  expiryDate: z.string().datetime().optional(),
  filename: z.string().max(256).optional(),
  contentType: z.string().max(128).optional(),
  size: z.number().int().positive().optional(),
  retrieverEmail: z.string().email().optional(),
  note: z.string().max(5000).optional(),
});
export type CreatePushInput = z.infer<typeof CreatePushSchema>;

export const PushResponseSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  secretUrl: z.string().url(),
  previewUrl: z.string().url().optional(),
  kind: PushKind,
  status: PushStatus,
  expiryViews: z.number().int().nullable(),
  expiryDays: z.number().int().nullable(),
  expiryDate: z.string().datetime().nullable(),
  views: z.number().int(),
  maxViews: z.number().int().nullable(),
  hasPassphrase: z.boolean(),
  filename: z.string().nullable(),
  contentType: z.string().nullable(),
  size: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
});
export type PushResponse = z.infer<typeof PushResponseSchema>;

export const ViewPushSchema = z.object({
  id: z.string().uuid(),
  passphrase: z.string().optional(),
});
export type ViewPushInput = z.infer<typeof ViewPushSchema>;

export const ViewPushResponseSchema = z.object({
  id: z.string().uuid(),
  kind: PushKind,
  payload: z.string(),
  downloadUrl: z.string().optional(),
  filename: z.string().nullable(),
  contentType: z.string().nullable(),
  size: z.number().int().nullable(),
  views: z.number().int(),
  maxViews: z.number().int().nullable(),
  expiresAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
  retrieverEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
});
export type ViewPushResponse = z.infer<typeof ViewPushResponseSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  pushId: z.string().uuid(),
  action: z.enum(["created", "viewed", "expired", "deleted", "burned", "passphrase_failed"]),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  retrieverEmail: z.string().email().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogQuerySchema = z.object({
  pushId: z.string().uuid().optional(),
  action: z.enum(["created", "viewed", "expired", "deleted", "burned", "passphrase_failed"]).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().max(128).nullable(),
  role: z.enum(["admin", "user"]),
  mfaEnabled: z.boolean(),
  mfaSecret: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  name: z.string().max(128).optional(),
  role: z.enum(["admin", "user"]).default("user"),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  mfaCode: z.string().min(6).max(16).optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().max(64),
  keyHash: z.string(),
  prefix: z.string(),
  scopes: z.array(z.enum(["pushes:read", "pushes:write", "audit:read", "admin"])),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().max(64),
  scopes: z.array(z.enum(["pushes:read", "pushes:write", "audit:read", "admin"])).default(["pushes:write"]),
  expiresInDays: z.number().int().positive().max(365).optional(),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export const SettingsSchema = z.object({
  siteName: z.string().max(128).default("KSecrets"),
  siteUrl: z.string().url(),
  theme: z.string().default("cerulean"),
  customCss: z.string().optional(),
  defaultExpiryViews: z.number().int().positive().max(1000).default(1),
  defaultExpiryDays: z.number().int().positive().max(365).default(7),
  maxPayloadSize: z.number().int().positive().default(10_000_000),
  maxFileSize: z.number().int().positive().default(100_000_000),
  requireHttps: z.boolean().default(true),
  allowAnonymous: z.boolean().default(true),
  requireMfa: z.boolean().default(false),
  retentionDays: z.number().int().positive().max(365).default(30),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().email().optional(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  });

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const VersionResponseSchema = z.object({
  version: z.string(),
  commit: z.string(),
  buildDate: z.string().datetime(),
});
export type VersionResponse = z.infer<typeof VersionResponseSchema>;

export function createErrorResponse(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, details } };
}