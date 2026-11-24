import { subtle } from "node:crypto";
import { randomBytes } from "node:crypto";
import { createHash, createHmac } from "node:crypto";
import { pbkdf2Sync } from "node:crypto";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const MASTER_KEY_LENGTH = 32;

export interface EncryptionResult {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  tag: Uint8Array;
}

export interface DecryptionInput {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  tag: Uint8Array;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export async function generateMasterKey(): Promise<Uint8Array> {
  return randomBytes(MASTER_KEY_LENGTH);
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function deriveKeyFromMaster(
  masterKey: Uint8Array,
  context: string
): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(`ksecrets-${context}`);
  const keyMaterial = await subtle.importKey(
    "raw",
    masterKey,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(context),
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(
  plaintext: string | Uint8Array,
  password: string
): Promise<EncryptionResult> {
  const data = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);

  const encrypted = await subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  const ciphertext = new Uint8Array(encrypted.slice(0, -TAG_LENGTH));
  const tag = new Uint8Array(encrypted.slice(-TAG_LENGTH));

  return { ciphertext, iv, salt, tag };
}

export async function encryptWithMasterKey(
  plaintext: string | Uint8Array,
  masterKey: Uint8Array,
  context: string
): Promise<EncryptionResult> {
  const data = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKeyFromMaster(masterKey, context);

  const encrypted = await subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  const ciphertext = new Uint8Array(encrypted.slice(0, -TAG_LENGTH));
  const tag = new Uint8Array(encrypted.slice(-TAG_LENGTH));

  return { ciphertext, iv, salt, tag };
}

export async function decrypt(
  input: DecryptionInput,
  password: string
): Promise<Uint8Array> {
  const key = await deriveKey(password, input.salt);

  const combined = new Uint8Array(input.ciphertext.length + input.tag.length);
  combined.set(input.ciphertext);
  combined.set(input.tag, input.ciphertext.length);

  try {
    const decrypted = await subtle.decrypt(
      { name: ALGORITHM, iv: input.iv },
      key,
      combined
    );
    return new Uint8Array(decrypted);
  } catch {
    throw new Error("Decryption failed: invalid passphrase or corrupted data");
  }
}

export async function decryptWithMasterKey(
  input: DecryptionInput,
  masterKey: Uint8Array,
  context: string
): Promise<Uint8Array> {
  const key = await deriveKeyFromMaster(masterKey, context);

  const combined = new Uint8Array(input.ciphertext.length + input.tag.length);
  combined.set(input.ciphertext);
  combined.set(input.tag, input.ciphertext.length);

  try {
    const decrypted = await subtle.decrypt(
      { name: ALGORITHM, iv: input.iv },
      key,
      combined
    );
    return new Uint8Array(decrypted);
  } catch {
    throw new Error("Decryption failed: invalid master key or corrupted data");
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return hash.toString("hex") === hashHex;
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashApiKey(key: string): string {
  return sha256Hex(key);
}

export async function generateApiKey(): Promise<{ key: string; hash: string; prefix: string }> {
  const prefix = "ks_";
  const randomPart = randomBytes(24).toString("base64url");
  const key = `${prefix}${randomPart}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, hash, prefix };
}

export async function hmacSign(data: string, secret: string): Promise<string> {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export async function hmacVerify(data: string, secret: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

export function decodeBase64(str: string): Uint8Array {
  return Uint8Array.from(Buffer.from(str, "base64url"));
}

export function serializationResult(result: EncryptionResult): string {
  return JSON.stringify({
    c: encodeBase64(result.ciphertext),
    i: encodeBase64(result.iv),
    s: encodeBase64(result.salt),
    t: encodeBase64(result.tag),
  });
}

export function deserializeResult(str: string): DecryptionInput {
  const { c, i, s, t } = JSON.parse(str);
  return {
    ciphertext: decodeBase64(c),
    iv: decodeBase64(i),
    salt: decodeBase64(s),
    tag: decodeBase64(t),
  };
}

export async function generateKeyPair(): Promise<KeyPair> {
  return subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

export async function sign(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return new Uint8Array(signature);
}

export async function verify(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoKey
): Promise<boolean> {
  return subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    data
  );
}