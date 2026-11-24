export const env = {
  DATABASE_PATH: process.env.DATABASE_PATH ?? ":memory:",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  SECRET_KEY_BASE: process.env.SECRET_KEY_BASE ?? "",
  KSECRETS_MASTER_KEY: process.env.KSECRETS_MASTER_KEY ?? "",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "ksecrets-files",
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL ?? "",
} as const;

export type Env = typeof env;