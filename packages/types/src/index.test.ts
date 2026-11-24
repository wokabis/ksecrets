import { describe, expect, it } from "vitest";
import { CreatePushSchema, CreateUserSchema, ErrorResponseSchema, PushKind } from "./index";

describe("push validation", () => {
  it("accepts a valid password push", () => {
    const parsed = CreatePushSchema.safeParse({
      kind: "password",
      payload: "encrypted-payload",
      expiryViews: 3,
      expiryDays: 7,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unsupported push types", () => {
    const parsed = CreatePushSchema.safeParse({ kind: "spreadsheet", payload: "x" });
    expect(parsed.success).toBe(false);
  });

  it("rejects oversized expiry windows", () => {
    const parsed = CreatePushSchema.safeParse({
      kind: "note",
      payload: "x",
      expiryViews: 5000,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("account validation", () => {
  it("requires passwords of at least 12 characters", () => {
    expect(CreateUserSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ email: "a@b.co", password: "long-enough-password" }).success).toBe(true);
  });
});

describe("error responses", () => {
  it("matches the documented shape", () => {
    const parsed = ErrorResponseSchema.safeParse({
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("push kinds", () => {
  it("supports password, note, file and url", () => {
    expect(PushKind.options).toEqual(["password", "note", "file", "url"]);
  });
});
