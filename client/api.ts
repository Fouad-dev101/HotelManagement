export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    credentials: 'include',
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as any)?.error ?? `Erreur ${res.status}`);
  return data as T;
}
export const fmtMAD = (cents: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format((cents ?? 0) / 100);
export const today = () => new Date().toISOString().slice(0, 10);