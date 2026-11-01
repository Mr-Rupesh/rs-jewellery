import type { User } from "firebase/auth";

export async function adminFetch(user: User, url: string, body: unknown, method = "POST") {
  const token = await user.getIdToken();
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data } as { ok: boolean; status: number; data: Record<string, string> };
}
