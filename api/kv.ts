// Minimal Upstash Redis REST client using fetch — no ESM/CJS issues
const url = process.env.KV_REST_API_URL!;
const token = process.env.KV_REST_API_TOKEN!;

const headers = () => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export async function kvGet<T>(key: string): Promise<T | null> {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: headers() });
  const data = await res.json() as { result: string | null };
  if (!data.result) return null;
  return JSON.parse(data.result) as T;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(JSON.stringify(value)),
  });
}
