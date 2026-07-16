# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Frontend (Vite dev server, port 5173 by default)
npm run dev

# Backend (Express, port 3001) — MUST run separately from ./server
cd server && npm run dev     # nodemon, auto-restart
cd server && npm start       # production, no auto-restart

# Lint / format
npm run lint                 # ESLint check
npm run format               # Prettier write

# Smoke test (requires running server on port 3001)
node test/smoke.test.js
```

Both servers must run simultaneously. Vite proxies `/api` to `localhost:3001` (see `vite.config.js`), matching the server default port configured in `server/.env`.

The server reads its config from `server/.env` (not the repo root's `.env.local`):
```
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1   # default
DEEPSEEK_MODEL=deepseek-v4-flash                 # default
PORT=3001                                        # default (falls back to 8787 if unset)
```

Only two models are accepted: `deepseek-v4-flash` and `deepseek-v4-pro` (enforced by `sanitizeModel()` in `server/config/index.js`). Any other model name silently falls back to `DEEPSEEK_MODEL`.

### Server boot sequence (`server/index.js`)

1. `dotenv.config()` loads `server/.env`
2. Config validation — warns if `DEEPSEEK_API_KEY` is missing but does not exit
3. `setupMiddleware(app)` — compression → helmet → cors → body parser → rate limiter
4. `setupRoutes(app)` — mounts all route handlers
5. `setupErrorHandler(app)` — global error handler (must be last)
6. `app.listen(PORT)` — starts listening

### Frontend dependencies note

`node-fetch` is listed in `package.json` dependencies but is not imported anywhere in `src/`. It's a vestigial dependency that can be safely removed.

## Architecture

This is a Vue 3 + Express AI chat app focused on front-end developer interview practice. The frontend is a SPA (Vite + Pinia + Vue Router + Tailwind). The backend is a proxy that forwards chat and interview requests to the DeepSeek API via the OpenAI SDK (v6, `server/config/index.js`).

### Path alias

Vite resolves `@` → `src/` (configured in `vite.config.js`). All frontend imports use this alias (e.g. `@/utils/chatApi.js`, `@/components/Modal.vue`).

### Bootstrap sequence (`src/main.js`)

1. **Pinia** created with `pinia-plugin-persistedstate` (all stores auto-persist to localStorage)
2. **Safari ITP compat**: `safeLocalStorage` wrapper catches errors from localStorage access in private browsing mode, exposed as `window.__safeLocalStorage__`
3. **Theme flash prevention**: Before Vue mounts, reads `localStorage.getItem('app')` to set `html.dark` class immediately — avoids a white flash in dark mode
4. **Plugin registration order**: Pinia → Router → FloatingVue (custom tooltip theme, 200ms show delay) → VueVirtualScroller → mount
5. **Router `afterEach`** sets `document.title = '... - Intervy'` from route `meta.title`

### Routes

Six frontend routes (all lazy-loaded via `() => import(...)`, with `meta.title` → `document.title = '... - Intervy'`):
`/` and `/chat/:id?` → `ChatView`, `/interview` → `InterviewView`, `/stats` → `StatsView`, `/knowledge` → `KnowledgeView`.

Server routes registered in `server/routes/index.js`:
| Mount | File | Purpose |
|-------|------|---------|
| `/api/chat` | `chat.js` | SSE streaming chat |
| `/api/interview` | `interview.js` | AI scoring + deep evaluation + Agent-driven evaluation |
| `/api/questions` | `questions.js` | AI question generation (from file content or target role) |
| `/api/knowledge` | `knowledge.js` | Knowledge base CRUD + file upload + KB-based question generation + Agent-driven question generation + reindex |
| `/api/rag` | `rag.js` | SSE streaming RAG search against knowledge base vectors |
| `/health` | `health.js` | Health check |

### Server middleware (`server/middleware/index.js`)

Applied in order: `compression()` → `helmet()` (with CSP for iconify) → `cors("*")` → `express.json(5mb)` → rate limiter (30 req/min per IP on `/api`) → global error handler.

Also exports `writeSSEHeaders(res)` — writes SSE response headers (`text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`) plus a 2048-char anti-buffer padding comment. Used by the chat route before streaming begins.

### AI interaction modes

1. **SSE streaming** (`POST /api/chat`): Used for free chat. Server streams `data: {"content": "..."}\n\n` chunks, terminated by `data: [DONE]\n\n`. Client reads via `fetch` + `ReadableStream` (`src/utils/chatApi.js`).
2. **Non-streaming JSON** (`POST /api/interview/score`, `/evaluate`, `/api/questions/generate`, `/api/knowledge/:id/generate`): Uses `server/services/aiCompletions.js` → `callAI()` which centralizes the `openai.chat.completions.create` → `extractJson` → `JSON.parse` pipeline. All error handling delegates to `server/services/errorHandler.js` → `handleAIError()`.

### Server services (`server/services/`)

| File | Purpose |
|------|---------|
| `deepseek.js` | `streamChat(model, messages)` — async generator that yields content chunks from OpenAI SDK streaming |
| `aiCompletions.js` | `callAI()` — non-streaming `openai.chat.completions.create` → `extractJson` → `JSON.parse` pipeline |
| `errorHandler.js` | `handleAIError()` — centralized AI error classification and sanitized error response |
| `agent.js` | `runInterviewEvaluate()` — Agent-driven interview evaluation (tool-use loop); `agentGenerateQuestions()` — Agent-driven KB question generation; `reindexKB()` — re-chunk + re-embed all files in a KB |
| `chunker.js` | `chunkText(text, { chunkSize, overlap })` — sliding-window text chunking on semantic boundaries (sentence-ending punctuation, newlines) |
| `embedding.js` | `getEmbedding(input)` — OpenAI-compatible embeddings API call (supports single string or batch array) |
| `vectorStore.js` | LanceDB vector storage: `addChunks()`, `search()`, `deleteByKB()`, `deleteByFile()`, `count()` |
| `rag.js` | `ragQuery(userQuery, { kbId, model, topK })` — async generator: embed → search → assemble context → streamChat |

All server AI calls flow through one of three paths: `deepseek.js` for SSE streaming, `aiCompletions.js` for JSON responses, `agent.js` for tool-use agent loops.

### Server utilities (`server/utils/`)

| File | Purpose |
|------|---------|
| `parseJson.js` | `extractJson(raw)` — strips markdown fences, finds first valid `{}` or `[]` block |
| `validate.js` | `sanitizeString`, `clampNumber`, `validateEnum` — input sanitization for all routes |
| `constants.js` | `DIFFICULTY_MAP` — shared difficulty labels |
| `agentLoop.js` | `agentLoop({ tools, executeTool, model, system, messages, maxSteps })` — generic LLM + tool-call loop: call LLM → execute tools → feed results back → repeat until text response or maxSteps |
| `normalizeText.js` | `normalizeText(text)` — cleans PDF parse artifacts (control chars, CJK inter-character spaces, page markers) |

### Frontend shared utilities (`src/utils/`)

| File | Purpose |
|------|---------|
| `apiClient.js` | `apiRequest(url, options)` — unified fetch wrapper with network error handling and JSON parsing. Used by both `interviewApi.js` and `knowledgeApi.js` |
| `chatApi.js` | `requestChatStream()` — SSE streaming via fetch + ReadableStream. Also re-exports `isAbortError` |
| `interviewApi.js` | `requestScore()`, `requestEvaluate()`, `requestAgentEvaluate()`, `requestGenerateQuestions()`, `requestGenerateQuestionsByRole()` — typed wrappers over `apiClient` for all interview endpoints |
| `knowledgeApi.js` | `fetchKnowledgeBases()`, `createKnowledgeBase()`, `deleteKnowledgeBase()`, `updateKnowledgeBase()`, `fetchKnowledgeBase()`, `uploadFileToKB()`, `deleteFileFromKB()`, `generateFromKB()`, `agentGenerateFromKB()`, `reindexKB()` — typed wrappers for all KB CRUD + Agent + reindex endpoints |
| `interviewHelpers.js` | `getScoreColor`, `getScoreBg`, `getScoreBgSolid`, `getScoreLabel`, `getCategoryStats()`, `getRecordWeakPoints()`, `difficultyMap`, `difficultyColor` — shared score/difficulty display helpers and per-record stat computation |
| `sseClient.js` | `requestSSEStream(url, body, { onChunk, onError, signal })` — generic SSE stream reader, extracted from chatApi for RAG and Agent reuse |
| `ragApi.js` | `requestRagStream({ query, kbId, model, onChunk, onError, signal })` — thin wrapper over SSE client for RAG search |
| `interviewExport.js` | `exportRecords(records, format)` — exports interview records to Markdown/plain text/JSON, triggers browser download |
| `tokenCounter.js` | `estimateTokens(text)`, `estimateMessagesTokens(messages)` — CJK/English aware token counting (~0.6 vs ~0.25 tokens/char) |
| `modelConfig.js` | Model definitions (all DeepSeek, none support vision) |
| `messageBuilder.js` | `buildMessagesWithContext()` — assembles messages array with file/image context, applies char limits |
| `docParser.js` | Client-side file parsing: PDF (pdfjs-dist, lazily imported), Word (mammoth), text |
| `textarea.js` | `autoResize(el, maxHeight)` — auto-grow textarea height |
| `index.js` | Re-exports: `modelOptions`, `getModelById`, `requestChatStream`, `autoResize`, `isAbortError` |

### Stores (Pinia, all persisted to localStorage)

| Store | Key state |
|-------|----------|
| `app` | Theme, sidebar state, current model selection |
| `chat` | `history[]`, `messagesByChatId{}`, `currentChatId`, `undoState`, `isRegenerating`, `setRegenerateAbort`/`abortRegenerate` — auto-titles from first message, eviction at 50 chats / 200 messages per chat |
| `interview` | Phase machine (`idle` → `answering` → `scoring` → `feedback` → `finished`), question bank, scores, deep-mode conversations, history (persisted), `kbId` for Agent-enhanced evaluation |
| `knowledge` | KB list, current KB detail, file management, CRUD + `updateKB()` + reindex |

### Interview question sources (3 tabs in InterviewView)

1. **题库出题** — Local hardcoded question bank (`src/data/questions/`). Six category files: `html.js`, `css.js`, `js.js`, `vue.js`, `react.js`, `engineering.js` — each exports an array of question objects (`{ id, category, difficulty, knowledgePoints, question }`). `index.js` aggregates them into `allQuestions`, `questionsByCategory`, and exports `selectQuestions()` for stratified random sampling (40% easy / 40% medium / 20% hard when difficulty is `'all'`; uniform random when a single difficulty is selected; falls back to random fill if a difficulty tier is underpopulated). Four presets: `frontend` (all 6 categories, 10 questions), `js-core` (6), `vue-special` (5), `css-html` (6).
2. **知识库出题** — User selects a knowledge base or uploads a file (auto-creates a temp KB) → `POST /api/knowledge/:id/generate` or `POST /api/knowledge/:id/agent-generate` (Agent-driven: searches KB first, then generates questions). Supports an "Agent 出题" checkbox toggle.

### Interview evaluation modes

- **Single-score** (`/api/interview/score`): One answer → one score object. Temperature 0.3. Returns `{ score, correctness, completeness, clarity, feedback, improvedAnswer }`.
- **Deep evaluation** (`/api/interview/evaluate`): Multi-round follow-up. AI returns `{ action: "follow_up" | "complete", ... }`. Up to 3 rounds of follow-up questions before forcing a final score.
- **Agent-driven evaluation** (`/api/interview/agent-evaluate`): Uses `agent.js` → `agentLoop`. LLM has access to `searchKnowledgeBase`, `gradeAnswer`, `generateQuestion` tools. Auto-searches KB (if provided), grades answers, and decides follow-up vs complete. Max 5 tool-call steps.

### Interview result display components (`src/components/interview/`)

| File | Purpose |
|------|---------|
| `InterviewSession.vue` | Live Q&A flow: answer input → code editor → submit → AI scoring → feedback |
| `StatsDashboard.vue` | History analytics: 3 stat cards (count/avg/best) → score trend bar chart → dual-pane record list + inline detail |
| `ScoreBadge.vue` | Colored score badge (sm/md/lg, optional `/10` denominator + text label). Used by all interview components |
| `ConversationThread.vue` | Multi-round chat bubbles (user right/primary, AI left/surface). Supports compact mode |
| `QuestionReviewCard.vue` | Single-question review: question → user answer or conversation → AI feedback → reference answer. Shared by InterviewSession, InterviewView, StatsDashboard |
| `DualPaneLayout.vue` | Responsive split layout (desktop: side-by-side, mobile: stacked with collapsible left panel). Used by InterviewView finished + StatsDashboard list/detail |

### InterviewView finished result (dual-pane)

After completing an interview (phase `'finished'`), the view switches to a `DualPaneLayout`:
- **Left pane (~32%)**: Question navigator — numbered list with `ScoreBadge` mini badges + difficulty labels. Click to select. Bottom section has "再来一次", export dropdown (md/txt), and "返回 AI 对话".
- **Right pane (~68%)**: Selected question detail via `QuestionReviewCard` (shows user's actual answer), plus total score hero card and weak knowledge point tags at top.

### Knowledge base system

File-system storage at `server/data/knowledge/`. Structure: `index.json` (KB list) + `{kb-id}/meta.json` (file metadata) + `{kb-id}/files/{file-id}.txt` (plain text). Files are parsed client-side by `docParser.js`, then sent as text to the server.

On file upload, the server runs an async RAG pipeline: `chunkText()` → `getEmbedding()` → `addChunks()` (into LanceDB at `server/data/vectors/`). Reindexing (`POST /api/knowledge/:id/reindex`) re-runs this pipeline for all files in a KB, deleting old vectors first.

KB names and descriptions are editable via `PATCH /api/knowledge/:id`. The detail view has inline edit controls (pencil icon toggles name/description inputs, ✓ save / ✕ cancel).

### Chat: abort & regenerate

`ChatInput.vue` holds the send/stop `activeController`. `MessageArea.vue`'s regenerate creates its own controller and registers it via `chatStore.setRegenerateAbort()`. Both abort paths converge: the ChatInput stop button calls `abortCurrentRequest()` → `chatStore.abortRegenerate()`. During regenerate, `chatStore.isRegenerating` = true, making `ChatInput.isBusy` true, so the send button becomes a red stop button (same UX as normal send).

### Key component patterns

- **`<Modal>`** — Reusable confirm/cancel modal used by AppSidebar, MessageArea, KnowledgeView, StatsDashboard
- **`<AppLayout>`** — Suspense boundary with spinner fallback around `router-view`
- **`MarkdownContent`** — Renders AI markdown with syntax-highlighted code blocks and copy buttons (uses `markdown-it` + `highlight.js`)
- **Sidebar search** — 200ms debounce on `searchQuery` → `debouncedQuery`, with an X clear button
- **Undo delete** — Deleted message turns show a 5-second undo toast, auto-clears

### Virtual scrolling (`src/composables/useVirtualScrollHeight.js`)

Messages use `vue3-virtual-scroller`'s `<RecycleScroller>` for DOM-efficient rendering. The composable manages item heights:

- **`sizeMap`** is a plain `Map` (non-reactive) to avoid triggering full recomputation of the virtual list
- **`observeItem(el, id)`** is a `:ref` callback — `RecycleScroller` calls it when items mount/unmount. It creates a `ResizeObserver` per item and schedules height updates
- **`schedule()`/`flush()`** batch height changes via RAF with a 160ms throttle, then **mutate `virtualMessages` items in-place** (set `.size` on existing objects) so the array reference stays stable and `RecycleScroller` doesn't full-rebuild
- `estimateMessageHeight()` provides initial height guesses (CJK-aware char counting + image overhead) before ResizeObserver measurements kick in

### Voice input (`src/composables/useSpeechRecognition.js`)

Web Speech API composable for Chinese (`zh-CN`) voice-to-text. Used by `ChatInput.vue`:

- `init()` — creates `SpeechRecognition` instance (with `webkitSpeechRecognition` fallback for Safari), sets `continuous: true`, `interimResults: false`. Call in `onMounted`.
- `toggle()` — start/stop recording. Returns `false` if browser doesn't support it.
- `stop()` — called in `onUnmounted` to clean up.
- `isRecording` / `supported` — reactive refs for UI state.

### Model selection flow

`modelConfig.js` defines two models: `deepseek-v4-flash` (default) and `deepseek-v4-pro`. Neither supports vision. The `app` store holds `currentModelId` (persisted). `ChatInput` reads `currentModel` from the store and passes it to API calls. On regenerate, `MessageArea` also reads from the same store. If localStorage contains an invalid model id, it falls back to the first option.

### Key dependencies

| Package | Purpose |
|---------|---------|
| `vue3-virtual-scroller` | DOM-efficient message list rendering (`<RecycleScroller>`) |
| `chart.js` | Radar/bar charts in StatsDashboard |
| `markdown-it` + `highlight.js` | AI response rendering with syntax-highlighted code blocks in `MarkdownContent` |
| `floating-vue` | Tooltip/dropdown components |
| `pdfjs-dist` | Client-side PDF text extraction (lazy-imported in `docParser.js`) |
| `mammoth` | Client-side Word (.docx) to HTML/text conversion |
| `pinia-plugin-persistedstate` | Auto-persist all Pinia stores to localStorage |
| `openai` (v6, server) | OpenAI SDK used against DeepSeek API |

### Theme system

`tailwind.config.js` maps named CSS variables to utility classes (`bg-background`, `text-primary`, `border-border`, `bg-surface`, etc.). The actual color values for light/dark are defined in `src/assets/theme.css` on `:root` and `.dark` selectors (`darkMode: 'class'`). Adding a new semantic color requires touching both files.

### CSS conventions

Global `.thin-scrollbar` class in `src/assets/theme.css` (replaces per-component duplicates). Frosted glass panels use `bg-background/80 backdrop-blur-md`. Score colors follow thresholds: >=8 emerald, >=5 amber, <5 red.
