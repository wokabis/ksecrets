const base = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");

export function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function apiUrl(path: string): string {
  return `${base}${path}`;
}
