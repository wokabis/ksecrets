import { describe, expect, it } from "vitest";
import {
  decrypt,
  decryptWithMasterKey,
  deserializeResult,
  encrypt,
  encryptWithMasterKey,
  generateApiKey,
  hashApiKey,
  hashPassword,
  serializationResult,
  sha256Hex,
  verifyPassword,
} from "./index";

describe("symmetric encryption", () => {
  it("round-trips a passphrase-protected payload", async () => {
    const result = await encrypt("correct horse battery staple", "hunter2-hunter2");
    const decrypted = await decrypt(result, "hunter2-hunter2");
    expect(new TextDecoder().decode(decrypted)).toBe("correct horse battery staple");
  });

  it("rejects an incorrect passphrase", async () => {
    const result = await encrypt("top secret", "right-passphrase");
    await expect(decrypt(result, "wrong-passphrase")).rejects.toThrow();
  });
});

describe("master key encryption", () => {
  const masterKey = Uint8Array.from({ length: 32 }, (_, index) => index);

  it("round-trips through serialization", async () => {
    const result = await encryptWithMasterKey("zero knowledge", masterKey, "web");
    const restored = await decryptWithMasterKey(deserializeResult(serializationResult(result)), masterKey, "web");
    expect(new TextDecoder().decode(restored)).toBe("zero knowledge");
  });

  it("fails with a different context", async () => {
    const result = await encryptWithMasterKey("zero knowledge", masterKey, "web");
    await expect(decryptWithMasterKey(result, masterKey, "cli-push")).rejects.toThrow();
  });
});

describe("password hashing", () => {
  it("verifies a stored hash", async () => {
    const hash = await hashPassword("a-very-long-password");
    expect(hash).toContain(":");
    expect(await verifyPassword("a-very-long-password", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("api keys", () => {
  it("generates branded, deterministic hashes", async () => {
    const { key, hash, prefix } = await generateApiKey();
    expect(key.startsWith("ks_")).toBe(true);
    expect(prefix).toBe("ks_");
    expect(hashApiKey(key)).toBe(hash);
    expect(sha256Hex(key)).toBe(hash);
  });
});
