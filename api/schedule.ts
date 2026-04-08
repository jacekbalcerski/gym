import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const kv = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const schedule = await kv.get('schedule:current');

  if (!schedule) {
    return res.status(200).json({
      status: 'no-data',
      message: 'Brak danych — scraper jeszcze nie uruchomiony.',
    });
  }

  // Cache na 5 minut (CDN) + 1 minuta (browser)
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(schedule);
}
