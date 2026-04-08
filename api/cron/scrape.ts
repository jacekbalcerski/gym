import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import * as cheerio from 'cheerio';

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
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
    }),
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  // Oczyść ewentualne markdown backticki
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Opcjonalna weryfikacja CRON_SECRET
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch HTML
    const html = await fetch(
      'https://sport.um.warszawa.pl/waw/osir-wola/-/hala-sportowa-kolo-obozowa-60'
    ).then(r => r.text());

    // 2. Wyciągnij tekst z głównej sekcji
    const $ = cheerio.load(html);
    const contentText =
      $('main').text().trim() ||
      $('.journal-content-article').text().trim() ||
      $('article').text().trim() ||
      $('body').text().trim();

    // 3. Wyślij do Gemini
    const geminiResponse = await callGemini(contentText);

    // 4. Porównaj z aktualnym stanem
    const currentState = await kv.get('schedule:current');
    const hasChanged = JSON.stringify(currentState) !== JSON.stringify(geminiResponse);

    // 5. Zapisz
    if (hasChanged) {
      // Archiwizuj stary stan
      if (currentState) {
        const history: unknown[] = (await kv.get('schedule:history')) || [];
        (history as object[]).push({
          state: currentState,
          archivedAt: new Date().toISOString(),
        });
        // Zachowaj ostatnie 30 wpisów
        await kv.set('schedule:history', history.slice(-30));
      }

      await kv.set('schedule:current', {
        ...geminiResponse,
        lastChanged: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      });
    } else {
      // Zaktualizuj tylko timestamp sprawdzenia
      await kv.set('schedule:current', {
        ...(currentState as object),
        lastChecked: new Date().toISOString(),
      });
    }

    // 6. Zapisz surowy tekst do debugowania
    await kv.set('schedule:raw-text', {
      text: contentText.substring(0, 5000),
      fetchedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      changed: hasChanged,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return res.status(500).json({ error: 'Scrape failed' });
  }
}
