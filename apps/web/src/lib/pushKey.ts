export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function generatePushKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function keyFromFragment(hash: string = window.location.hash): Uint8Array | null {
  const match = /(?:^#?|&)k=([A-Za-z0-9_-]+)/.exec(hash);
  if (!match) return null;
  try {
    return fromBase64Url(match[1]);
  } catch {
    return null;
  }
}
