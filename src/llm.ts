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

export function createLLMClient(): { client: OpenAI; model: string } {
  if (process.env.LLM_PROVIDER === 'cloud') {
    return {
      client: new OpenAI({
        apiKey: process.env.LLM_CLOUD_API_KEY!,
        baseURL: process.env.LLM_CLOUD_BASE_URL,
      }),
      model: process.env.LLM_CLOUD_MODEL ?? 'qwen/qwen3.5-flash',
    };
  }

  return {
    client: new OpenAI({
      apiKey: 'lm-studio',
      baseURL: process.env.LLM_LOCAL_BASE_URL ?? 'http://localhost:1234/v1',
    }),
    model: process.env.LLM_LOCAL_MODEL ?? 'qwen3-4b',
  };
}

export async function extractWithLLM(
  client: OpenAI,
  model: string,
  blocks: CourtBlock[],
  batchIndex: number
): Promise<LLMResponse> {
  const isCloud = process.env.LLM_PROVIDER === 'cloud';
  const enableThinking = process.env.LLM_ENABLE_THINKING === 'true';

  const userContent = `/no_think\n` + blocks
    .map(b => `CODE: ${b.code}\nNAME: ${b.name}\nADDRESS: ${b.rawAddress}\nWEBSITE: ${b.website ?? ''}`)
    .join('\n---\n');

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 2048,
    ...(isCloud && { extra_body: { enable_thinking: enableThinking } }),
    response_format: { type: 'json_object' },
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
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { result: { courts: parsed }, usage };
    }
    if (Array.isArray(parsed?.courts)) {
      return { result: parsed as ExtractionResult, usage };
    }
    if (parsed?.code && parsed?.name) {
      return { result: { courts: [parsed] }, usage };
    }
    console.error(`\n  ❌ Батч ${batchIndex}: неожиданная структура ответа`);
    console.error(`  Raw (первые 500): ${raw.slice(0, 500)}`);
    return { ...EMPTY, usage };
  } catch (e) {
    console.error(`\n  ❌ Батч ${batchIndex}: невалидный JSON`);
    console.error(`  Raw (первые 500 символов): ${raw.slice(0, 500)}`);
    return { ...EMPTY, usage };
  }
}