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