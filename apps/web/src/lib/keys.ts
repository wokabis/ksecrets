export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("VITE_MASTER_KEY must be a 32-byte hex string");
  }
  return Uint8Array.from(normalized.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
