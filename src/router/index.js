import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Chat",
    component: () => import("@/views/ChatView.vue"),
    meta: { title: "对话" },
  },
  {
    path: "/chat/:id?",
    name: "ChatById",
    component: () => import("@/views/ChatView.vue"),
    meta: { title: "对话" },
  },
  {
    path: "/interview",
    name: "Interview",
    component: () => import("@/views/InterviewView.vue"),
    meta: { title: "AI 面试" },
  },
  {
    path: "/stats",
    name: "Stats",
    component: () => import("@/views/StatsView.vue"),
    meta: { title: "面试记录" },
  },
  {
    path: "/knowledge",
    name: "Knowledge",
    component: () => import("@/views/KnowledgeView.vue"),
    meta: { title: "知识库" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - Intervy` : "Intervy";
});

export default router;
