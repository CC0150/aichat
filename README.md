# AI 聊天 - 仿 Gemini 布局

基于 Vue 3 (Script Setup)、Tailwind CSS、Pinia、Vue Router 的 AI 聊天应用基础布局。

## 功能

- **侧边栏（可折叠）**：新建对话、历史记录列表、设置入口；桌面端可折叠，移动端为抽屉
- **主界面**：顶部栏、中间消息区、底部圆角输入框与推荐操作
- **响应式**：桌面端双栏，移动端侧边栏抽屉 + 遮罩
- **主题**：`src/assets/theme.css` 定义 CSS 变量，支持深色模式（默认深色）
- **图标**：使用 [@iconify/vue](https://iconify.design/docs/icon-components/vue/)（Lucide 等）

## 技术栈

- Vue 3 (Composition API + `<script setup>`)
- Vite 5
- Vue Router 4
- Pinia
- Tailwind CSS 3
- @iconify/vue

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 切换深色/浅色

在 `index.html` 的 `<html>` 上添加或移除 `class="dark"` 即可，或在设置页点击「深色模式」切换（需自行接好逻辑）。

## 目录结构

```
src/
├── assets/theme.css    # 主题 CSS 变量（深色模式）
├── components/         # 布局与 UI 组件
├── router/             # Vue Router
├── stores/             # Pinia（app、chat）
└── views/              # 页面（Chat、Settings）
```
