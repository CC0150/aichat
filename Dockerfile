# ============================================
# Stage 1: 构建前端
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装前端依赖
COPY package*.json ./
RUN npm ci

# 拷贝前端源码并构建
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY index.html ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# ============================================
# Stage 2: 运行环境
# ============================================
FROM node:20-alpine

# LanceDB 原生模块编译依赖 + tsx 运行 TypeScript
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 安装服务端生产依赖
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev && apk del python3 make g++

# 拷贝前端构建产物
COPY --from=builder /app/dist ./dist

# 拷贝服务端源码
COPY server/ ./server/

# 确保数据目录存在
RUN mkdir -p /app/server/data/knowledge /app/server/data/vectors

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "--import", "tsx", "server/index.ts"]
