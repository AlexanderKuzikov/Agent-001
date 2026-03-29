// src/types.ts

export interface Court {
  code: string;
  name: string;
  addresses: string[];
  website: string | null;
}

export interface ExtractionResult {
  courts: Court[];
}

export const courtSchema = {
  type: "object",
  properties: {
    courts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code:      { type: "string" },
          name:      { type: "string" },
          addresses: { type: "array", items: { type: "string" } },
          website:   { type: ["string", "null"] }
        },
        required: ["code", "name", "addresses", "website"]
      }
    }
  },
  required: ["courts"]
} as const;

export const SYSTEM_PROMPT = `You are a data extraction agent. Your task is to extract court information from Russian court registry HTML.

Extract all courts from the provided HTML fragment. For each court extract:
- code: classification code (e.g. "59RS0017")
- name: full court name, trim whitespace
- addresses: split address string by ";" into array, trim each element
- website: official site URL, null if not present

Rules:
- /no_think
- Return only valid JSON matching the provided schema
- Do not add any text outside JSON
- If a field is missing — use null for strings, [] for arrays
- Preserve original Russian text as-is, do not translate or correct`;