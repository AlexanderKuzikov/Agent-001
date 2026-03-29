# Agent-001

Экспериментальный агент для сбора данных о судах общей юрисдикции РФ с портала ГАС «Правосудие» (sudrf.ru).

## Цель

Исследование архитектуры браузерных агентов на базе локальных LLM.  
Агент получает страницу реестра судов, извлекает структурированные данные и возвращает JSON.

## Стек

- **Runtime:** Node.js + TypeScript (ESM)
- **Браузер:** Playwright
- **LLM:** Qwen3.5-4B Q4_K_M via LM Studio (local OpenAI-compatible API)
- **Structured output:** JSON Schema через `response_format`

## Архитектура

```

URL страницы sudrf.ru
→ Playwright (получение HTML)
→ cheerio (вырезка блоков судов)
→ LM Studio API (structured extraction)
→ JSON результат

```

## Требования

- Node.js 20+
- LM Studio с запущенным локальным сервером
- Модель: `Qwen/Qwen3.5-4B` (bartowski GGUF, Q4_K_M)

## Установка

```bash
npm install
npx playwright install chromium
```


## Конфигурация

Создай `.env`:

```env
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=qwen/qwen3.5-4b
```


## Запуск

```bash
npx tsx src/index.ts
```


## Статус

🧪 Эксперимент — не production

Закидывай в репо, и переходим к `package.json` и структуре проекта.```

