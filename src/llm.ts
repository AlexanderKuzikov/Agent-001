import OpenAI from 'openai';
import { courtSchema, SYSTEM_PROMPT, type ExtractionResult } from './types.js';
import type { CourtBlock } from './extractor.js';

interface LLMUsage {
  prompt: number;
  completion: number;
  reasoning: number;
}

interface LLMResponse {
  result: ExtractionResult;
  usage: LLMUsage;
}

const EMPTY: LLMResponse = {
  result: { courts: [] },
  usage: { prompt: 0, completion: 0, reasoning: 0 }
};

export async function extractWithLLM(
  client: OpenAI,
  model: string,
  blocks: CourtBlock[],
  batchIndex: number
): Promise<LLMResponse> {
  const userContent = blocks
    .map(b => `CODE: ${b.code}\nNAME: ${b.name}\nADDRESS: ${b.rawAddress}\nWEBSITE: ${b.website ?? ''}`)
    .join('\n---\n');

const response = await client.chat.completions.create({
  model,
  temperature: 0,
  max_tokens: 2048,
  // @ts-ignore — LM Studio extension
  reasoning: 'off',
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'courts',
      strict: true,
      schema: courtSchema
    }
  },
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ]
});
  const choice = response.choices[0];
  const finishReason = choice.finish_reason;
  const message = choice.message as {
    content: string | null;
    reasoning_content?: string;
  };

  const raw = message.content || message.reasoning_content || '';

  const usage: LLMUsage = {
    prompt: response.usage?.prompt_tokens ?? 0,
    completion: response.usage?.completion_tokens ?? 0,
    reasoning: (response.usage as any)?.completion_tokens_details?.reasoning_tokens ?? 0,
  };

  if (!raw) {
    console.error(`\n  ⚠️  Батч ${batchIndex}: пустой ответ (finish_reason: ${finishReason})`);
    return EMPTY;
  }

  if (finishReason === 'length') {
    console.warn(`\n  ⚠️  Батч ${batchIndex}: ответ обрезан — уменьши батч или увеличь max_tokens`);
  }

  try {
    return { result: JSON.parse(raw) as ExtractionResult, usage };
  } catch (e) {
    console.error(`\n  ❌ Батч ${batchIndex}: невалидный JSON`);
    console.error(`  Raw (первые 500 символов): ${raw.slice(0, 500)}`);
    return { ...EMPTY, usage };
  }
}