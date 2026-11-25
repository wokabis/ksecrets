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

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const MASTER_KEY_LENGTH = 32;

export async function generateMasterKey(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH));
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password) as any,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
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
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    masterKey as any,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as any,
      info: new TextEncoder().encode(context) as any,
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
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data as any
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
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKeyFromMaster(masterKey, context);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data as any
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

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: input.iv as any },
    key,
    combined as any
  );
  return new Uint8Array(decrypted);
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

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: input.iv as any },
    key,
    combined as any
  );
  return new Uint8Array(decrypted);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as any,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  // @ts-ignore - Uint8Array is valid BufferSource for Web Crypto
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256
  );
  const hashArray = new Uint8Array(hash);
  const saltArray = new Uint8Array(salt);
  return `${Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('')}:${Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as any,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256
  );
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('') === hashHex;
}

export async function generateApiKey(): Promise<{ key: string; hash: string; prefix: string }> {
  const prefix = "ks_";
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const randomPart = encodeBase64(randomBytes);
  const key = `${prefix}${randomPart}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key) as any);
  const hashArray = new Uint8Array(hash);
  return { key, hash: Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join(''), prefix };
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as any,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data) as any);
  const sigArray = new Uint8Array(signature);
  return Array.from(sigArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(data: string, secret: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  return timingSafeEqual(
    new Uint8Array(expected.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))),
    new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export function encodeBase64(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

export async function sign(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data as unknown as BufferSource
  );
  return new Uint8Array(signature);
}

export async function verify(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoKey
): Promise<boolean> {
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature as unknown as BufferSource,
    data as unknown as BufferSource
  );
}