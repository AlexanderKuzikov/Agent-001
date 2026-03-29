import * as cheerio from 'cheerio';

export interface CourtBlock {
  code: string;
  name: string;
  rawAddress: string;
  website: string | null;
}

export function extractCourtBlocks(html: string): CourtBlock[] {
  const $ = cheerio.load(html);
  const courts: CourtBlock[] = [];

  $('li a[onclick]').each((_, el) => {
    const onclick = $(el).attr('onclick') ?? '';
    const codeMatch = onclick.match(/'([A-Z0-9]+)'\)/);
    if (!codeMatch) return;

    const code = codeMatch[1];
    const name = $(el).text().trim();
    const infoDiv = $(el).next('.courtInfoCont');

    // Адрес — текст после <b>Адрес:</b>
    const fullText = infoDiv.text();
    const addressMatch = fullText.match(/Адрес:\s*([^\n]+?)(?:Телефон|E-mail|Официальный|$)/s);
    const rawAddress = addressMatch?.[1]?.trim() ?? '';

    // Сайт
    const websiteEl = infoDiv.find('a[href^="http"]').last();
    const website = websiteEl.length ? websiteEl.attr('href') ?? null : null;

    courts.push({ code, name, rawAddress, website });
  });

  return courts;
}

export function splitAddresses(raw: string): string[] {
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}