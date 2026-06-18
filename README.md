# Intervy - AI 面试助手

基于 Vue 3 + Express 的全栈 AI 聊天应用，专注于前端开发工程师面试练习。提供 AI 自由对话、AI 模拟面试、知识库管理和面试历史统计等功能。

## 功能特性

- **AI 对话** — 基于 DeepSeek 大模型的实时流式聊天（SSE），支持多会话管理、消息编辑、重新生成、撤销删除
- **AI 模拟面试** — 三种出题方式：内置题库（HTML/CSS/JS/Vue/React/工程化）、文件上传出题（PDF/Word/文本）、知识库出题。支持多轮追问深度评估，自动评分并导出面试报告
- **知识库管理** — 创建知识库、上传文档（PDF/Word/TXT），基于知识库内容生成面试题
- **面试统计** — 历史面试记录仪表盘，雷达图展示知识点得分分布，支持 Markdown/文本/JSON 格式导出
- **深色/浅色主题** — 支持主题切换，默认深色模式
- **移动端适配** — 响应式布局，侧边栏可折叠

## 技术栈

### 前端

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 + Pinia + Vue Router |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 图标 | @iconify/vue (Lucide) |
| 虚拟滚动 | vue3-virtual-scroller |
| 图表 | Chart.js |
| Markdown | markdown-it + highlight.js |
| 文档解析 | pdfjs-dist + mammoth |
| 工具提示 | floating-vue |

### 后端

| 类别 | 技术 |
|------|------|
| 框架 | Express 4 |
| AI SDK | OpenAI SDK v6（兼容 DeepSeek API） |
| 安全 | helmet + cors + express-rate-limit |
| 压缩 | compression |

## 项目结构

```
aichat/
├── index.html                         # 入口 HTML
├── package.json                       # 前端依赖
├── vite.config.js                     # Vite 配置（代理 /api → :3001）
├── tailwind.config.js                 # Tailwind 配置
├── src/
│   ├── main.js                        # 应用入口
│   ├── App.vue                        # 根组件
│   ├── router/index.js                # 路由（Chat / Interview / Stats / Knowledge）
│   ├── stores/                        # Pinia 状态管理（持久化到 localStorage）
│   │   ├── app.js                     #   主题、侧边栏、模型选择
│   │   ├── chat.js                    #   聊天会话、消息管理
│   │   ├── interview.js               #   面试流程、评分、历史
│   │   └── knowledge.js               #   知识库管理
│   ├── views/                         # 页面视图
│   │   ├── ChatView.vue               #   聊天页
│   │   ├── InterviewView.vue          #   面试页
│   │   ├── StatsView.vue              #   统计页
│   │   └── KnowledgeView.vue          #   知识库页
│   ├── components/                    # 公共组件
│   │   ├── AppLayout.vue              #   布局框架
│   │   ├── AppSidebar.vue             #   侧边栏
│   │   ├── ChatHeader.vue             #   聊天顶栏
│   │   ├── ChatInput.vue              #   消息输入框
│   │   ├── MessageArea.vue            #   消息列表（虚拟滚动）
│   │   ├── MarkdownContent.vue        #   Markdown 渲染
│   │   ├── Modal.vue                  #   通用模态框
│   │   └── interview/                 #   面试相关组件
│   ├── composables/                   # 组合式函数
│   ├── utils/                         # 工具函数（API 封装、文件解析、Token 计数等）
│   └── data/questions/                # 内置面试题库
├── server/
│   ├── package.json                   # 后端依赖
│   ├── index.js                       # 服务入口
│   ├── .env                           # 环境变量（API Key 等）
│   ├── config/index.js                # OpenAI 客户端配置
│   ├── middleware/index.js            # 中间件（CORS、安全、限流）
│   ├── routes/                        # API 路由
│   ├── services/                      # AI 调用服务
│   ├── utils/                         # 服务端工具
│   └── data/knowledge/                # 知识库文件存储
└── test/
    └── smoke.test.js                  # 冒烟测试
```

## 快速开始

### 环境要求

- Node.js 18+
- DeepSeek API Key（或其他 OpenAI 兼容的 API）

### 安装

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..
```

### 配置

在 `server/.env` 中配置 API 密钥：

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
| `DEEPSEEK_MODEL` | 默认模型 | `deepseek-v4-flash` |
| `PORT` | 后端服务端口 | `3001` |

支持的模型：`deepseek-v4-flash`、`deepseek-v4-pro`

### 运行

需要同时启动前后端两个服务：

**终端 1 — 启动后端：**

```bash
cd server
npm run dev    # nodemon 热重载
```

**终端 2 — 启动前端：**

```bash
npm run dev    # Vite 开发服务器，默认 http://localhost:5173
```

Vite 会将 `/api` 请求代理到 `localhost:3001`，因此前后端必须同时运行。

### 构建

```bash
npm run build      # 输出到 dist/
npm run preview    # 预览构建结果
```

## API 接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/chat` | POST | SSE 流式聊天 |
| `/api/interview/score` | POST | 单题评分 |
| `/api/interview/evaluate` | POST | 多轮深度评估 |
| `/api/questions/generate` | POST | 根据内容生成题目 |
| `/api/questions/generate-by-role` | POST | 根据岗位生成题目 |
| `/api/knowledge` | GET/POST | 知识库列表 / 创建 |
| `/api/knowledge/:id` | GET/DELETE | 知识库详情 / 删除 |
| `/api/knowledge/:id/files` | POST | 上传文件到知识库 |
| `/api/knowledge/:id/files/:fileId` | DELETE | 删除知识库文件 |
| `/api/knowledge/:id/generate` | POST | 基于知识库生成题目 |

限流：所有 `/api` 路由限制 30 请求/分钟/IP

## 其他

- UI 语言为中文（zh-CN）
- 面试题库位于 `src/data/questions/`，包含 HTML、CSS、JavaScript、Vue、React、工程化六个分类
- 知识库数据存储在 `server/data/knowledge/`（文件系统，无需数据库）
- 所有 Pinia store 自动持久化到 localStorage

## License

MIT
