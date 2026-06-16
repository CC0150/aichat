# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Frontend (Vite dev server, port 5173 by default)
npm run dev

# Backend (Express, port 8787) — MUST run separately from ./server
cd server && npm run dev     # nodemon, auto-restart
cd server && npm start       # production, no auto-restart

# Lint / format
npm run lint                 # ESLint check
npm run format               # Prettier write

# Smoke test (requires running server on port 3001)
node test/smoke.test.js
```

Both servers must run simultaneously. Vite proxies `/api` to `localhost:3001` (see `vite.config.js`), but the server default port is `8787` — check your local setup for the actual proxy target.

The server reads its config from `server/.env` (not the repo root's `.env.local`):
```
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1   # default
DEEPSEEK_MODEL=deepseek-v4-flash                 # default
PORT=8787                                        # default
```

## Architecture

This is a Vue 3 + Express AI chat app focused on front-end developer interview practice. The frontend is a SPA (Vite + Pinia + Vue Router + Tailwind). The backend is a proxy that forwards chat and interview requests to the DeepSeek API via the OpenAI SDK (v6, `server/config/index.js`).

### Routes

Five frontend routes: `/` and `/chat/:id` → `ChatView`, `/interview` → `InterviewView`, `/stats` → `StatsView`, `/knowledge` → `KnowledgeView`.

Server routes registered in `server/routes/index.js`:
| Mount | File | Purpose |
|-------|------|---------|
| `/api/chat` | `chat.js` | SSE streaming chat |
| `/api/interview` | `interview.js` | AI scoring + deep evaluation |
| `/api/questions` | `questions.js` | AI question generation (from file content or target role) |
| `/api/knowledge` | `knowledge.js` | Knowledge base CRUD + KB-based question generation |
| `/health` | `health.js` | Health check |

### Server middleware (`server/middleware/index.js`)

Applied in order: `compression()` → `helmet()` (with CSP for iconify) → `cors("*")` → `express.json(5mb)` → rate limiter (30 req/min per IP on `/api`) → global error handler.

### AI interaction modes

1. **SSE streaming** (`POST /api/chat`): Used for free chat. Server streams `data: {"content": "..."}\n\n` chunks, terminated by `data: [DONE]\n\n`. Client reads via `fetch` + `ReadableStream` (`src/utils/chatApi.js`).
2. **Non-streaming JSON** (`POST /api/interview/score`, `/evaluate`, `/api/questions/generate`, `/api/knowledge/:id/generate`): Uses `server/services/aiCompletions.js` → `callAI()` which centralizes the `openai.chat.completions.create` → `extractJson` → `JSON.parse` pipeline. All error handling delegates to `server/services/errorHandler.js` → `handleAIError()`.

### Server utilities (`server/utils/`)

| File | Purpose |
|------|---------|
| `parseJson.js` | `extractJson(raw)` — strips markdown fences, finds first valid `{}` or `[]` block |
| `validate.js` | `sanitizeString`, `clampNumber`, `validateEnum` — input sanitization for all routes |
| `constants.js` | `DIFFICULTY_MAP` — shared difficulty labels |

### Frontend shared utilities (`src/utils/`)

| File | Purpose |
|------|---------|
| `apiClient.js` | `apiRequest(url, options)` — unified fetch wrapper with network error handling and JSON parsing. Used by both `interviewApi.js` and `knowledgeApi.js` |
| `chatApi.js` | `requestChatStream()` — SSE streaming via fetch + ReadableStream |
| `interviewHelpers.js` | `getScoreColor`, `getScoreBg`, `getScoreBgSolid`, `getScoreBorder`, `getScoreLabel`, `difficultyMap`, `difficultyColor` — shared score/difficulty display helpers |
| `modelConfig.js` | Model definitions (all DeepSeek, none support vision) |
| `messageBuilder.js` | `buildMessagesWithContext()` — assembles messages array with file/image context, applies char limits |
| `docParser.js` | Client-side file parsing: PDF (pdfjs-dist, lazily imported), Word (mammoth), text |
| `index.js` | Re-exports: `modelOptions`, `getModelById`, `requestChatStream`, `autoResize`, `isAbortError` |

### Stores (Pinia, all persisted to localStorage)

| Store | Key state |
|-------|----------|
| `app` | Theme, sidebar state, current model selection |
| `chat` | `history[]`, `messagesByChatId{}`, `currentChatId`, `undoState`, `isRegenerating`, `setRegenerateAbort`/`abortRegenerate` — auto-titles from first message, eviction at 50 chats / 200 messages per chat |
| `interview` | Phase machine (`idle` → `config` → `running` → `result`), question bank, scores, history (persisted) |
| `knowledge` | KB list, current KB detail, file management |

### Interview question sources (3 tabs in InterviewView)

1. **题库出题** — Local hardcoded question bank (`src/data/questions/`). `selectQuestions()` in `index.js` does stratified random sampling. Four presets: `frontend`, `js-core`, `vue-special`, `css-html`.
2. **文件出题** — User uploads a file → parsed client-side → `POST /api/questions/generate` → AI generates questions from content (or `POST /api/questions/generate-by-role` for a target job title).
3. **知识库出题** — User selects a knowledge base → `POST /api/knowledge/:id/generate` → server aggregates all KB files → AI generates questions.

### Interview evaluation modes

- **Single-score** (`/api/interview/score`): One answer → one score object. Temperature 0.3.
- **Deep evaluation** (`/api/interview/evaluate`): Multi-round follow-up. AI returns `{ action: "follow_up" | "complete", ... }`. Up to 3 rounds of follow-up questions before forcing a final score.

### Knowledge base system

File-system storage at `server/data/knowledge/`. Structure: `index.json` (KB list) + `{kb-id}/meta.json` (file metadata) + `{kb-id}/files/{file-id}.txt` (plain text). Files are parsed client-side by `docParser.js`, then sent as text to the server.

### Chat: abort & regenerate

`ChatInput.vue` holds the send/stop `activeController`. `MessageArea.vue`'s regenerate creates its own controller and registers it via `chatStore.setRegenerateAbort()`. Both abort paths converge: the ChatInput stop button calls `abortCurrentRequest()` → `chatStore.abortRegenerate()`. During regenerate, `chatStore.isRegenerating` = true, making `ChatInput.isBusy` true, so the send button becomes a red stop button (same UX as normal send).

### Key component patterns

- **`<Modal>`** — Reusable confirm/cancel modal used by AppSidebar, MessageArea, KnowledgeView, StatsDashboard
- **`<AppLayout>`** — Suspense boundary with spinner fallback around `router-view`
- **`MarkdownContent`** — Renders AI markdown with syntax-highlighted code blocks and copy buttons
- **Sidebar search** — 200ms debounce on `searchQuery` → `debouncedQuery`, with an X clear button
- **Undo delete** — Deleted message turns show a 5-second undo toast, auto-clears

### CSS conventions

Global `.thin-scrollbar` class in `src/assets/theme.css` (replaces per-component duplicates). Frosted glass panels use `bg-background/80 backdrop-blur-md`. Score colors follow thresholds: >=8 emerald, >=5 amber, <5 red.
