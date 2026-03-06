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
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - AI 聊天` : "AI 聊天";
});

export default router;
