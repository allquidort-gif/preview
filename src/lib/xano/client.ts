// src/lib/xano/client.ts
type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const BASE_URL =
  process.env.NEXT_PUBLIC_XANO_BASE_URL ||
  process.env.XANO_BASE_URL ||
  "";

const API_KEY =
  process.env.NEXT_PUBLIC_XANO_API_KEY ||
  process.env.XANO_API_KEY ||
  "";

/**
 * Minimal Xano fetch wrapper.
 *
 * For personal projects, you can call Xano directly from the browser using NEXT_PUBLIC_XANO_BASE_URL.
 * If you later want to keep secrets server-side, we can swap this to call a Next.js /api/xano proxy route.
 */
export async function xanoFetch<T>(
  path: string,
  options?: {
    method?: HttpMethod;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<T> {
  if (!BASE_URL) {
    throw new Error(
      "Missing Xano base URL. Set NEXT_PUBLIC_XANO_BASE_URL in .env.local"
    );
  }

  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers ?? {}),
  };

  // Optional API key header (depends on how you secured your Xano APIs)
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Xano request failed (${res.status} ${res.statusText}) on ${path}${text ? `: ${text}` : ""}`
    );
  }

  // Some Xano endpoints may return empty responses
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return (undefined as unknown) as T;
  }

  return (await res.json()) as T;
}
