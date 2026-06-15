# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Frontend (Vite dev server, port 5173 by default)
npm run dev

# Backend (Express, port 8787) — MUST run separately from ./server
cd server && npm run dev     # nodemon, auto-restart
cd server && npm start       # production, no auto-restart
```

Both servers must run simultaneously. Vite proxies `/api` to `localhost:3001` (see `vite.config.js`), but the server default port is `8787` — check your local setup for the actual proxy target.

The server reads its config from `server/.env` (not the repo root's `.env.local`):
```
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1   # default
DEEPSEEK_MODEL=deepseek-v4-flash                 # default
PORT=8787                                        # default
```

There are no tests, no lint, and no type-checking configured.

## Architecture

This is a Vue 3 + Express AI chat app focused on front-end developer interview practice. The frontend is a SPA (Vite + Pinia + Vue Router + Tailwind). The backend is a thin proxy that forwards chat and interview-scoring requests to the DeepSeek API via the OpenAI SDK (v6, `server/config/index.js`).

### Two distinct AI interaction modes

1. **Free chat** (`/` or `/chat/:id`): SSE streaming via `POST /api/chat`. The server streams `data: {"content": "..."}\n\n` chunks, terminated by `data: [DONE]\n\n`. The client reads via `fetch` + `ReadableStream` (`src/utils/chatApi.js`).
2. **Interview scoring** (`POST /api/interview/score`): Non-streaming, temperature 0.3. Sends `{ question, answerPoints, userAnswer, model }` and expects the AI to return a JSON score object.

### Interview question bank (local, hardcoded)

Questions live in `src/data/questions/` as plain JS arrays. Each question object:
```js
{ id, type, category, difficulty, tags, knowledgePoints, question, answerPoints }
```
- `type`: `"concept"` | `"coding"` | `"scenario"`
- `category`: `"html"` | `"css"` | `"javascript"` | `"vue"` | `"react"` | `"engineering"`
- `difficulty`: `"easy"` | `"medium"` | `"hard"`

`src/data/questions/index.js` exports `selectQuestions()` which does stratified random sampling (40/40/20 easy/medium/hard ratio) from the category pool defined by `interviewTypes`. Four preset types exist: `frontend`, `js-core`, `vue-special`, `css-html`.

### Interview flow (no AI involved in question selection)

`InterviewView.vue` → user picks type/count/difficulty → `interviewStore.startInterview()` calls `selectQuestions()` → questions stored in store → `InterviewSession.vue` renders them one at a time → user's answer sent to `/api/interview/score` → AI scores it → results stored in `interviewStore.history` (persisted via localStorage).

### File upload (client-side parsing, prompt injection)

`ChatInput.vue` handles file uploads: PDF (pdfjs-dist), Word (mammoth), and text files are parsed entirely client-side by `src/utils/docParser.js`. The extracted text is injected into the conversation as a `system` message via `src/utils/messageBuilder.js` — each file capped at 6000 chars, total context capped at 8000 chars. This is purely for chat context; interview questions do NOT use uploaded files (they always come from the local bank).

### Pinia store persistence

All three stores (`app`, `chat`, `interview`) use `pinia-plugin-persistedstate` → localStorage. Chat history, interview records, theme preference, and model selection survive page reloads. The `chat` store uses a `messagesByChatId` map keyed by auto-generated UUIDs; titles are auto-derived from the first user message.

### Model configuration

Two available models defined in `src/utils/modelConfig.js`, both DeepSeek, neither supports vision (`supportsVision: false`). The model ID is stored in `appStore.currentModelId` and passed with each request. The `messageBuilder.js` checks `supportsVision` — when false, uploaded images get converted to text descriptions instead of base64 data URLs.

### Router

Three routes: `/` and `/chat/:id` → `ChatView`, `/interview` → `InterviewView`, `/stats` → `StatsView`. Route changes don't destroy components; chat and interview state persist across navigation.
