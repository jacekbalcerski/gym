import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet } from './kv';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const schedule = await kvGet('schedule:current');

  if (!schedule) {
    return res.status(200).json({
      status: 'no-data',
      message: 'Brak danych — scraper jeszcze nie uruchomiony.',
    });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(schedule);
}
