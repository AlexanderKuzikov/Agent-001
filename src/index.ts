import 'dotenv/config';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
import { fetchPageHTML } from './browser.js';
import { extractCourtBlocks, splitAddresses } from './extractor.js';
import { extractWithLLM, createLLMClient } from './llm.js';

const TARGET      = process.env.TARGET_URL!;
const BATCH       = parseInt(process.env.LLM_BATCH_SIZE ?? '5');
const CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY ?? '1');
const OUT_DIR     = 'output';

function progress(current: number, total: number, label: string) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% — ${label}    `);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

async function main() {
  const startTotal = Date.now();

  const { client, model } = createLLMClient();

  console.log(`\n🚀 Agent-001 старт`);
  console.log(`🌐 URL: ${TARGET}`);
  console.log(`🤖 Модель: ${model}`);
  console.log(`🗂  Размер батча: ${BATCH}`);
  console.log(`⚡ Concurrency: ${CONCURRENCY}\n`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

  console.log('📡 Загружаем страницу...');
  const t0 = Date.now();
  const html = await fetchPageHTML(TARGET);
  console.log(`   ✓ Страница загружена за ${formatDuration(Date.now() - t0)}`);

  const blocks = extractCourtBlocks(html);
  const totalBatches = Math.ceil(blocks.length / BATCH);
  console.log(`\n📋 Найдено судов: ${blocks.length}`);
  console.log(`🗂  Батчей: ${totalBatches}\n`);

  const results = [];
  const stats = {
    totalCourts: blocks.length,
    extracted: 0,
    failedBatches: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalReasoningTokens: 0,
    batchTimes: [] as number[],
  };

  let completedBatches = 0;
  const limit = pLimit(CONCURRENCY);

  const batchTasks = Array.from({ length: totalBatches }, (_, idx) => {
    const batchNum = idx + 1;
    const batch = blocks.slice(idx * BATCH, idx * BATCH + BATCH);

    return limit(async () => {
      const tBatch = Date.now();
      const { result, usage } = await extractWithLLM(client, model, batch, batchNum);
      const batchMs = Date.now() - tBatch;

      completedBatches++;
      progress(completedBatches, totalBatches, `Батч ${completedBatches}/${totalBatches} ✓ (${formatDuration(batchMs)})`);

      return { result, usage, batch, batchMs };
    });
  });

  const batchResults = await Promise.all(batchTasks);

  for (const { result, usage, batch, batchMs } of batchResults) {
    stats.batchTimes.push(batchMs);
    stats.totalPromptTokens += usage.prompt;
    stats.totalCompletionTokens += usage.completion;
    stats.totalReasoningTokens += usage.reasoning;

    for (const court of result.courts) {
      if (court.addresses.length === 0) {
        const block = batch.find(b => b.code === court.code);
        if (block) court.addresses = splitAddresses(block.rawAddress);
        continue;
      }
      court.addresses = court.addresses.flatMap(a =>
        a.includes(';') ? splitAddresses(a) : [a.trim()]
      );
    }

    if (result.courts.length === 0) {
      stats.failedBatches++;
    } else {
      stats.extracted += result.courts.length;
      results.push(...result.courts);
    }
  }

  const totalMs = Date.now() - startTotal;
  const avgBatchMs = stats.batchTimes.reduce((a: number, b: number) => a + b, 0) / stats.batchTimes.length;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(OUT_DIR, `courts_${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');

  const statsFile = path.join(OUT_DIR, `stats_${timestamp}.json`);
  const fullStats = {
    ...stats,
    totalTime: formatDuration(totalMs),
    totalTimeMs: totalMs,
    avgBatchTime: formatDuration(avgBatchMs),
    courtsPerMinute: Math.round((stats.extracted / totalMs) * 60_000),
    url: TARGET,
    model,
    batchSize: BATCH,
    concurrency: CONCURRENCY,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(statsFile, JSON.stringify(fullStats, null, 2), 'utf-8');

  console.log(`\n\n${'─'.repeat(50)}`);
  console.log(`✅ Готово!`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`📊 Судов найдено:     ${stats.totalCourts}`);
  console.log(`📊 Судов извлечено:   ${stats.extracted}`);
  console.log(`❌ Неудачных батчей:  ${stats.failedBatches}`);
  console.log(`⏱  Общее время:       ${formatDuration(totalMs)}`);
  console.log(`⏱  Среднее на батч:   ${formatDuration(avgBatchMs)}`);
  console.log(`⚡ Судов в минуту:    ${fullStats.courtsPerMinute}`);
  console.log(`🔢 Prompt токенов:    ${stats.totalPromptTokens}`);
  console.log(`🔢 Completion токенов:${stats.totalCompletionTokens}`);
  console.log(`🔢 Reasoning токенов: ${stats.totalReasoningTokens}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`💾 Результат: ${outFile}`);
  console.log(`💾 Статистика: ${statsFile}`);
  console.log(`${'─'.repeat(50)}\n`);
}

main().catch(console.error);