import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { kvGet, kvSet } from '../kv';

interface DayHours {
  open: string;
  close: string;
}

interface Closure {
  dateFrom: string;
  dateTo: string;
  timeFrom: string | null;
  timeTo: string | null;
  reason: string;
  affectsWholeBuilding: boolean;
}

interface ModifiedHours {
  dateFrom: string;
  dateTo: string;
  open: string;
  close: string;
  reason: string;
}

interface GymSchedule {
  regularHours: {
    weekdays: DayHours;
    saturday: DayHours;
    sunday: DayHours;
  };
  closures: Closure[];
  modifiedHours: ModifiedHours[];
  notices: string[];
  parseConfidence: 'high' | 'medium' | 'low';
}

const SITE_UNAVAILABLE_PHRASES = [
  'serwis jest niedostępny',
  'prace serwisowe',
  'strona jest niedostępna',
  'temporarily unavailable',
];

function isSiteUnavailable(html: string, statusCode: number): boolean {
  if (statusCode !== 200) return true;
  const lower = html.toLowerCase();
  return SITE_UNAVAILABLE_PHRASES.some(phrase => lower.includes(phrase));
}

async function callGemini(pageText: string): Promise<GymSchedule> {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const prompt = `Analizujesz tekst ze strony internetowej Hali Sportowej Koło (Obozowa 60, Warszawa).
Wyciągnij informacje o dostępności SIŁOWNI (nie całej hali, chyba że cały obiekt jest zamknięty).

Szukaj:
- Godzin otwarcia siłowni (standardowych i zmienionych)
- Przerw technicznych, remontów, zamknięć siłowni
- Zamknięć całego obiektu (hali) które wpływają na siłownię
- Dat i godzin kiedy siłownia jest nieczynna lub ma zmienione godziny

Zwróć TYLKO JSON (bez markdown, bez backticks), w formacie:
{
  "regularHours": {
    "weekdays": { "open": "HH:MM", "close": "HH:MM" },
    "saturday": { "open": "HH:MM", "close": "HH:MM" },
    "sunday": { "open": "HH:MM", "close": "HH:MM" }
  },
  "closures": [
    {
      "dateFrom": "YYYY-MM-DD",
      "dateTo": "YYYY-MM-DD",
      "timeFrom": "HH:MM lub null jeśli cały dzień",
      "timeTo": "HH:MM lub null jeśli cały dzień",
      "reason": "powód po polsku",
      "affectsWholeBuilding": false
    }
  ],
  "modifiedHours": [
    {
      "dateFrom": "YYYY-MM-DD",
      "dateTo": "YYYY-MM-DD",
      "open": "HH:MM",
      "close": "HH:MM",
      "reason": "powód po polsku"
    }
  ],
  "notices": ["inne ważne informacje jako tablica stringów"],
  "parseConfidence": "high | medium | low"
}

Jeśli nie znajdziesz informacji o siłowni, zwróć puste tablice.
Jeśli nie jesteś pewien interpretacji, ustaw parseConfidence na "low" i dodaj opis w notices.

Tekst strony:
---
${pageText}
---`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
    }),
  });

  const data = await response.json() as { candidates?: { content: { parts: { text: string }[] } }[]; error?: { message: string } };
  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error(`Gemini returned no text; full response: ${JSON.stringify(data).substring(0, 500)}`);
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as GymSchedule;
  } catch {
    throw new Error(`Gemini JSON parse failed; raw text: ${cleaned.substring(0, 500)}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let contentText: string;

    // 1a. POST z polem text — pre-extracted text (np. z Playwright w GitHub Actions)
    if (req.method === 'POST' && typeof req.body?.text === 'string') {
      contentText = req.body.text;
    } else {
      let html: string;
      let fetchStatus = 200;

      // 1b. POST z polem html — przekazany HTML (legacy GitHub Actions bypass)
      if (req.method === 'POST' && typeof req.body?.html === 'string') {
        html = req.body.html;
      } else {
        // 1c. Użyj Jina Reader do wyrenderowania strony JS (OSiR blokuje datacenter IPs)
        const jinaUrl = 'https://r.jina.ai/https://sport.um.warszawa.pl/waw/osir-wola/-/hala-sportowa-kolo-obozowa-60';
        console.log('Fetching via Jina Reader:', jinaUrl);
        const httpResponse = await fetch(jinaUrl, {
          headers: {
            'Accept': 'text/plain',
            'X-Return-Format': 'text',
            'X-Locale': 'pl-PL',
          },
        });
        fetchStatus = httpResponse.status;
        html = await httpResponse.text();
        console.log(`Jina response: status=${fetchStatus}, length=${html.length}, preview=${html.substring(0, 200)}`);
      }

      // 2. Sprawdź czy strona działa
      if (isSiteUnavailable(html, fetchStatus)) {
        const currentState = await kvGet<object>('schedule:current');
        await kvSet('schedule:current', {
          ...(currentState ?? {}),
          siteUnavailable: true,
          lastChecked: new Date().toISOString(),
        });
        await kvSet('schedule:raw-text', {
          text: html.substring(0, 500),
          fetchedAt: new Date().toISOString(),
          siteUnavailable: true,
        });
        return res.status(200).json({ success: true, siteUnavailable: true });
      }

      // 3. Wyciągnij tekst z głównej sekcji
      const $ = cheerio.load(html);
      contentText =
        $('main').text().trim() ||
        $('.journal-content-article').text().trim() ||
        $('article').text().trim() ||
        $('body').text().trim();
    }

    // 4. Wyślij do Gemini
    const geminiResponse = await callGemini(contentText);

    // 5. Porównaj z aktualnym stanem (ignorując metadane)
    const currentState = await kvGet<Record<string, unknown>>('schedule:current');
    const { lastChecked: _lc, lastChanged: _lg, siteUnavailable: _su, ...currentData } = currentState ?? {};
    const hasChanged = JSON.stringify(currentData) !== JSON.stringify(geminiResponse);

    // 6. Zapisz
    if (hasChanged) {
      if (currentState) {
        const history = (await kvGet<object[]>('schedule:history')) ?? [];
        history.push({ state: currentState, archivedAt: new Date().toISOString() });
        await kvSet('schedule:history', history.slice(-30));
      }
      await kvSet('schedule:current', {
        ...geminiResponse,
        siteUnavailable: false,
        lastChanged: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      });
    } else {
      await kvSet('schedule:current', {
        ...(currentState ?? {}),
        siteUnavailable: false,
        lastChecked: new Date().toISOString(),
      });
    }

    // 7. Zapisz surowy tekst do debugowania
    await kvSet('schedule:raw-text', {
      text: contentText.substring(0, 5000),
      fetchedAt: new Date().toISOString(),
      siteUnavailable: false,
    });

    return res.status(200).json({ success: true, changed: hasChanged });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Scrape error:', message);
    return res.status(500).json({ error: 'Scrape failed', detail: message });
  }
}
