# Intervy - AI 面试助手

基于 Vue 3 + Express 的全栈 AI 应用，专注于前端开发工程师面试练习。支持 AI 自由对话、AI 模拟面试、知识库管理和面试历史统计。

## 功能特性

- **AI 对话** — 基于 DeepSeek 的实时流式聊天（SSE），支持多会话管理、消息编辑、重新生成、撤销删除（5 秒内可恢复）
- **AI 模拟面试** — 三种出题方式：内置题库（HTML/CSS/JS/Vue/React/工程化，6 类共 4 种预设）、文件上传出题（PDF/Word/TXT）、知识库出题。支持多轮追问深度评估，自动评分并导出面试报告
- **知识库管理** — 创建知识库、上传文档（PDF/Word/TXT），基于知识库内容 AI 生成面试题
- **面试统计** — 历史面试记录仪表盘，雷达图展示知识点得分分布，支持 Markdown / 文本 / JSON 格式导出
- **深色/浅色主题** — 支持主题切换，防闪烁启动
- **移动端适配** — 响应式布局，侧边栏可折叠，移动端抽屉菜单

## 技术栈

### 前端

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API) + Pinia + Vue Router 4 |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS 3 + CSS 变量主题系统 |
| 状态持久化 | pinia-plugin-persistedstate（自动同步 localStorage） |
| 虚拟滚动 | vue3-virtual-scroller（RecycleScroller） |
| 图表 | Chart.js（雷达图 + 柱状图） |
| Markdown | markdown-it + highlight.js（代码高亮 + 复制按钮） |
| 文档解析 | pdfjs-dist（PDF）+ mammoth（Word） |
| 语音输入 | Web Speech API（中文 zh-CN） |
| 工具提示 | floating-vue |

### 后端

| 类别 | 技术 |
|------|------|
| 框架 | Express 4 |
| AI SDK | OpenAI SDK v6（兼容协议，对接 DeepSeek API） |
| AI 模型 | `deepseek-v4-flash`（默认）/ `deepseek-v4-pro`，仅两种可用 |
| 安全 | helmet + cors + express-rate-limit（30 次/分钟/IP） |
| 压缩 | compression |
| 存储 | 文件系统（`server/data/knowledge/`，无需数据库） |

## 项目结构

```
aichat/
├── index.html                         # Vite 入口 HTML
├── vite.config.js                     # ★ Vite 配置：@ 别名、/api 代理到 :3001
├── tailwind.config.js                 # Tailwind 主题（CSS 变量映射）
├── package.json                       # 前端依赖
│
├── src/                               # ===== 前端 =====
│   ├── main.js                        # ★ 应用入口：Pinia→Router→FloatingVue→VirtualScroll→mount
│   ├── App.vue                        # 根组件
│   ├── router/
│   │   └── index.js                   # ★ 5 个路由（全懒加载），meta.title 控制标签页标题
│   ├── stores/                        # ★ Pinia 状态管理（全部持久化到 localStorage）
│   │   ├── app.js                     #   主题 / 侧边栏 / 当前模型选择
│   │   ├── chat.js                    #   聊天会话 / 消息管理 / 撤销删除 / 重新生成
│   │   ├── interview.js               #   面试状态机 / 评分 / 追问 / 历史记录
│   │   └── knowledge.js               #   知识库 CRUD 前端状态
│   ├── views/
│   │   ├── ChatView.vue               #   自由对话页
│   │   ├── InterviewView.vue          #   AI 面试页（配置→答题→结果→追问）
│   │   ├── StatsView.vue              #   面试统计页（雷达图 / 柱状图）
│   │   └── KnowledgeView.vue          #   知识库管理页
│   ├── components/
│   │   ├── AppLayout.vue              #   布局框架（侧边栏 + 主内容区）
│   │   ├── AppSidebar.vue             #   侧边栏（会话列表 / 搜索 / 新建）
│   │   ├── ChatHeader.vue             #   聊天顶栏
│   │   ├── ChatInput.vue              #   消息输入框（模型切换 / 语音输入 / 发送/停止）
│   │   ├── MessageArea.vue            #   消息列表（虚拟滚动 + 重新生成 + 删除）
│   │   ├── MarkdownContent.vue        #   AI 回复 Markdown 渲染（代码高亮 + 一键复制）
│   │   ├── Modal.vue                  #   通用确认弹窗
│   │   └── interview/                 #   面试相关组件
│   │       ├── InterviewSession.vue   #   ★ 面试核心流程（答题→评分→追问）
│   │       └── ...                    #   配置面板 / 结果展示 / 统计仪表盘
│   ├── composables/
│   │   ├── useVirtualScrollHeight.js  #   ★ 虚拟滚动高度管理（ResizeObserver + 160ms 节流）
│   │   └── useSpeechRecognition.js    #   语音输入封装（Web Speech API）
│   ├── utils/
│   │   ├── chatApi.js                 #   ★ SSE 流式请求（fetch + ReadableStream + AbortController）
│   │   ├── apiClient.js               #   ★ 统一 fetch 封装（网络错误 + JSON 解析）
│   │   ├── interviewApi.js            #   面试 API（评分 / 追问 / 出题）
│   │   ├── knowledgeApi.js            #   知识库 API（CRUD + 文件管理 + 出题）
│   │   ├── interviewHelpers.js        #   评分颜色 / 难度标签
│   │   ├── interviewExport.js         #   面试记录导出（Markdown / 文本 / JSON）
│   │   ├── modelConfig.js             #   模型定义（仅 deepseek-v4-flash 和 pro，均不支持视觉）
│   │   ├── messageBuilder.js          #   构建 messages 数组（含 file/image 上下文）
│   │   ├── docParser.js               #   ★ 客户端文件解析（PDF/Word/TXT）
│   │   ├── tokenCounter.js            #   Token 估算（中文 ~0.6 / 英文 ~0.25 token/字符）
│   │   └── textarea.js                #   输入框自动高度
│   ├── assets/
│   │   └── theme.css                  #   ★ 主题 CSS 变量（:root 浅色 / .dark 深色）
│   └── data/
│       └── questions/                 # ★ 内置面试题库
│           ├── index.js               #   题库聚合 + selectQuestions（分层随机抽样）
│           ├── html.js / css.js / js.js / vue.js / react.js / engineering.js
│
├── server/                            # ===== 后端 =====
│   ├── index.js                       # ★ 服务入口（dotenv→中间件→路由→启动）
│   ├── .env                           # ★ 环境变量（API Key / 模型 / 端口）
│   ├── package.json                   # 后端依赖
│   ├── config/
│   │   └── index.js                   # ★ OpenAI SDK 实例 + 模型白名单 + sanitizeModel
│   ├── middleware/
│   │   └── index.js                   # ★ 中间件链 + writeSSEHeaders + 全局错误处理
│   ├── routes/
│   │   ├── index.js                   # ★ 路由注册中心（5 组路由）
│   │   ├── chat.js                    # ★ SSE 流式聊天 POST /api/chat
│   │   ├── interview.js               # ★ AI 评分 + 多轮追问 POST /api/interview/score|evaluate
│   │   ├── questions.js               # ★ AI 出题 POST /api/questions/generate|generate-by-role
│   │   ├── knowledge.js               # ★ 知识库 CRUD + 出题 POST /api/knowledge/...
│   │   └── health.js                  # 健康检查 GET /health
│   ├── services/
│   │   ├── deepseek.js                # ★ streamChat — 流式调 DeepSeek（AsyncGenerator）
│   │   ├── aiCompletions.js           # ★ callAI — 非流式调 DeepSeek → extractJson → JSON.parse
│   │   └── errorHandler.js            # ★ handleAIError — 统一 AI 错误响应
│   ├── utils/
│   │   ├── parseJson.js               # ★ extractJson — 从 AI 原始返回中提取 JSON 块
│   │   ├── validate.js                # ★ sanitizeString / validateEnum / clampNumber
│   │   └── constants.js               # DIFFICULTY_MAP（难度分布描述）
│   └── data/
│       └── knowledge/                 # ★ 知识库文件存储
│           ├── index.json             #   [{ id, name, fileCount, createdAt }, ...]
│           └── {kb-id}/
│               ├── meta.json          #   { id, name, files: [...] }
│               └── files/
│                   └── {file-id}.txt  #   纯文本内容
│
└── test/
    └── smoke.test.js                  # 冒烟测试
```

## 架构与数据流

### 整体数据流

```
浏览器 (Vue SPA)
  │
  ├─ 聊天: SSE 流式 → POST /api/chat → streamChat → DeepSeek API
  ├─ 评分: JSON     → POST /api/interview/score → callAI → DeepSeek API
  ├─ 追问: JSON     → POST /api/interview/evaluate → callAI → DeepSeek API
  ├─ 出题: JSON     → POST /api/questions/generate → callAI → DeepSeek API
  ├─ 知识库:JSON    → GET|POST|DELETE /api/knowledge/* → 文件系统
  └─ 统计: 读取 Pinia store（不请求后端）
         ↑
    Vite 代理 /api → localhost:3001
         ↑
    Express 中间件链:
      compression → helmet(CSP) → cors(*) → json(5MB) → 限流(30/min)
```

### AI 调用的两条路径

```
路径 A — 流式（聊天）:
  chat.js → streamChat(model, messages)
         → openai.chat.completions.create({ stream: true })
         → AsyncGenerator 逐块 yield
         → res.write(`data: {"content":"..."}\n\n`)
         → 最后 res.write("data: [DONE]\n\n")

路径 B — 非流式（评分 / 出题 / 追问）:
  interview.js / questions.js / knowledge.js
         → callAI({ model, prompt, temperature })
         → openai.chat.completions.create({ stream: false })
         → extractJson(raw)  ← 去除 markdown 包裹，提取 {} 或 []
         → JSON.parse()
```

### 四种 AI 交互模式

| 模式 | 接口 | 流式 | 用途 |
|------|------|:--:|------|
| SSE 聊天 | `POST /api/chat` | ✅ | 自由对话，逐 token 推送 |
| 单次评分 | `POST /api/interview/score` | ❌ | 一题一评，一次返回完整结果 |
| 多轮追问 | `POST /api/interview/evaluate` | ❌ | AI 决定追问或结束，最多 3 轮（硬编码） |
| AI 出题 | `POST /api/questions/generate` 等 | ❌ | 返回题目 JSON 数组 |

### 面试状态机（Interview Store）

```
idle → answering → scoring → feedback → answering（追问循环）→ ... → finished
         ↑          ↑                        │
         │          └── submitAnswer()        │
         └── goToQuestion() 可回到任意题     │
                                              │
                              所有题答完 → finishInterview() → 存入 history[]
```

### 消息管理（Chat Store）

- **会话列表**：`history[]`，最多保留 50 个会话，超出自动淘汰
- **消息存储**：`messagesByChatId`，每个会话最多 200 条消息
- **流式拼接**：SSE 每到一个 chunk → `appendToLastMessage(content)` 追加到当前 AI 消息末尾
- **撤销删除**：删除后 5 秒内可恢复（`undoState` + `setTimeout`）
- **重新生成**：独立 AbortController，与 ChatInput 的发送共享停止按钮

### 主题系统

双层设计，切换主题只需 `document.documentElement.classList.toggle('dark')`：

```
tailwind.config.js          → colors: { background: 'var(--color-background)' }
src/assets/theme.css        → :root { --color-background: #ffffff }
                            → .dark { --color-background: #0f172a }
```

启动时在 Vue 挂载前读取 localStorage 设置 `html.dark` class，防止浅色主题闪烁。

## 快速开始

### 环境要求

- Node.js 18+
- DeepSeek API Key

### 安装

```bash
npm install
cd server && npm install && cd ..
```

### 配置

在 `server/.env` 中配置：

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=3001
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（必填） | — |
| `DEEPSEEK_BASE_URL` | API 基础地址 | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 默认模型（仅 `deepseek-v4-flash` / `deepseek-v4-pro`） | `deepseek-v4-flash` |
| `PORT` | 后端服务端口 | `3001` |

### 运行

需要同时启动两个服务：

```bash
# 终端 1 — 后端（端口 3001）
cd server && npm run dev

# 终端 2 — 前端（端口 5173）
npm run dev
```

Vite 将 `/api` 请求代理到 `localhost:3001`（见 `vite.config.js`），前后端必须同时运行。

### 构建

```bash
npm run build       # 输出到 dist/
npm run preview     # 预览构建结果
```

## API 接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/chat` | POST | SSE 流式聊天，body: `{ model?, messages }` |
| `/api/interview/score` | POST | 单题评分，body: `{ question, userAnswer, answerPoints }` |
| `/api/interview/evaluate` | POST | 多轮追问深度评估，body: `{ question, answerPoints, conversationHistory }` |
| `/api/questions/generate` | POST | 根据内容 AI 生成面试题，body: `{ content, questionCount, difficulty? }` |
| `/api/questions/generate-by-role` | POST | 根据目标岗位 AI 生成面试题，body: `{ role, questionCount, difficulty? }` |
| `/api/knowledge` | GET | 获取所有知识库列表 |
| `/api/knowledge` | POST | 创建知识库，body: `{ name, description? }` |
| `/api/knowledge/:id` | GET | 获取知识库详情（含文件列表） |
| `/api/knowledge/:id` | DELETE | 删除知识库及其所有文件 |
| `/api/knowledge/:id/files` | POST | 上传文件到知识库，body: `{ name, type?, content }` |
| `/api/knowledge/:id/files/:fileId` | DELETE | 删除知识库中的文件 |
| `/api/knowledge/:id/generate` | POST | 基于知识库内容 AI 生成面试题 |

> 限流：所有 `/api` 路由限制 30 次请求/分钟/IP

## 面试题库

内置 6 个分类的面试题，位于 `src/data/questions/`：

| 文件 | 分类 | 预设 |
|------|------|------|
| `html.js` | HTML | |
| `css.js` | CSS | |
| `js.js` | JavaScript | |
| `vue.js` | Vue | |
| `react.js` | React | |
| `engineering.js` | 工程化 | |

4 种快捷预设：

| 预设 | 覆盖分类 | 题数 |
|------|---------|:--:|
| 前端综合 | 全部 6 类 | 10 |
| JS 核心 | JavaScript | 6 |
| Vue 专项 | Vue | 5 |
| HTML + CSS | HTML / CSS | 6 |

**分层抽样算法**（`selectQuestions`）：全难度模式下 40% easy + 40% medium + 20% hard，某难度不足时自动从其他难度随机补充。

## 知识库

文件存储结构（无需数据库）：

```
server/data/knowledge/
├── index.json              # 知识库索引
└── {kb-id}/
    ├── meta.json           # 元数据 + 文件列表
    └── files/
        ├── {file-id}.txt   # 文件纯文本
        └── ...
```

文件上传流程：前端 `docParser.js` 解析（PDF/Word/TXT）→ 纯文本 → `POST /api/knowledge/:id/files` → 服务端写入 `.txt`。

> 当前限制：文件内容超过 10,000 字符时会被硬截断。后续计划通过 RAG（检索增强生成）解决。

## 其他说明

- 前端 UI 语言为中文（zh-CN），Pinia store 全部自动持久化到 localStorage
- 两种模型可选：`deepseek-v4-flash`（默认，速度快）和 `deepseek-v4-pro`（更强推理）
- 前端兼容 Safari ITP（`safeLocalStorage`），语音输入兼容 Webkit 内核
- 主题切换防闪烁：Vue 挂载前即读取 localStorage 设置 `html.dark` class
- 评分颜色体系：≥8 绿色、5-7 琥珀色、<5 红色，全局统一

## License

MIT
