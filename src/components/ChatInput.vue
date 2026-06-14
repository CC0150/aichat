<script setup>
import { Icon } from "@iconify/vue";
import { ref, computed, onMounted, onUnmounted, TransitionGroup } from "vue";
import { useRouter } from "vue-router";
import { useChatStore } from "@/stores/chat";
import { useAppStore } from "@/stores/app";
import { requestChatStream, autoResize as autoResizeTextarea } from "@/utils";
import { buildMessagesWithContext } from "@/utils/messageBuilder";
import { parseFile } from "@/utils/docParser";
import { useSpeechRecognition } from "@/composables/useSpeechRecognition";
import { watch } from "vue";

const input = ref("");
const router = useRouter();
const chatStore = useChatStore();
const appStore = useAppStore();
const isSending = ref(false);
let activeController = null;
const textareaRef = ref(null);
const isModelMenuOpen = ref(false);

// 有文本时才允许发送（图片和附件不能单独发送）
const canSend = computed(() => !!input.value?.trim());

// 附件解析相关（PDF / Word / 文本类）
const fileInputRef = ref(null);
// 单个附件：{ id, name, text, type: 'pdf' | 'word' }
const attachments = ref([]);
const isParsingAttachment = ref(false);

const MAX_CONTEXT_CHARS = 8000;
const MAX_ATTACHMENTS = 5;

// 图片上传相关
const imageInputRef = ref(null);
// 单张图片：{ id, name, url, file }
const images = ref([]);
const MAX_IMAGES = 5;

/**
 * 触发隐藏的文件选择框，用于选择 PDF / Word 附件
 */
function triggerFileSelect() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

/**
 * 处理附件选择变更事件：解析 PDF / Word / 文本类文件，并填充到 attachments
 */
async function handleFileChange(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  isParsingAttachment.value = true;
  const remaining = MAX_ATTACHMENTS - attachments.value.length;
  if (remaining <= 0) {
    console.warn(`最多只能添加 ${MAX_ATTACHMENTS} 个附件`);
    isParsingAttachment.value = false;
    event.target.value = "";
    return;
  }

  const filesToProcess = files.slice(0, remaining);

  for (const file of filesToProcess) {
    try {
      const parsed = await parseFile(file);
      if (parsed.text) {
        attachments.value.push({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: parsed.name,
          text: parsed.text,
          type: parsed.type,
        });
      }
    } catch (err) {
      console.error(err);
      alert(err?.message || `解析文件「${file.name}」失败，请稍后重试。`);
    }
  }

  // 清空 input 的值，方便下次选择同一个文件
  event.target.value = "";
  isParsingAttachment.value = false;
}

/**
 * 清空所有附件上下文与选择状态
 */
function clearAttachment() {
  attachments.value = [];
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
}

/** 根据附件名返回图标与颜色类 */
function getAttachmentIcon(att) {
  const name = (att?.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return { icon: "lucide:file-text", class: "text-red-500" };
  if (name.endsWith(".docx") || name.endsWith(".doc")) return { icon: "lucide:file-text", class: "text-blue-500" };
  return { icon: "lucide:file", class: "text-text-muted" };
}

/**
 * 从附件列表中移除指定附件
 */
function removeAttachment(id) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
  if (!attachments.value.length && fileInputRef.value) {
    fileInputRef.value.value = "";
  }
}

/**
 * 从图片列表中移除指定图片，并释放对应的本地预览 URL
 */
function removeImage(id) {
  const img = images.value.find((i) => i.id === id);
  if (img && img.url) {
    URL.revokeObjectURL(img.url);
  }
  images.value = images.value.filter((i) => i.id !== id);
  if (!images.value.length && imageInputRef.value) {
    imageInputRef.value.value = "";
  }
}

/**
 * 清空所有已选择的图片，并释放本地预览 URL
 */
function clearImages() {
  // 不再 revoke 已发出的图片 URL，避免历史消息预览报 ERR_FILE_NOT_FOUND
  images.value = [];
  if (imageInputRef.value) {
    imageInputRef.value.value = "";
  }
}

/**
 * 选择当前使用的模型（更新 appStore.currentModelId）
 */
function selectModel(id) {
  appStore.setCurrentModelId(id);
  isModelMenuOpen.value = false;
}

/**
 * 自适应调整 textarea 高度
 */
function autoResize(el) {
  autoResizeTextarea(el, 200);
}

/**
 * 输入事件处理：更新高度
 */
function onInput(e) {
  autoResize(e.target);
}

/**
 * 触发隐藏的图片选择框（上传图片）
 */
function triggerImageSelect() {
  if (imageInputRef.value) {
    imageInputRef.value.click();
  }
}

/**
 * 处理图片选择变更事件：将图片加入 images 列表
 */
async function handleImageChange(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  await addImagesFromFiles(files);
  event.target.value = "";
}

/**
 * 将一批图片文件加入 images 列表（受数量上限约束）
 */
async function addImagesFromFiles(files) {
  const remaining = MAX_IMAGES - images.value.length;
  if (remaining <= 0) {
    console.warn(`最多只能上传 ${MAX_IMAGES} 张图片`);
    return;
  }

  const filesToUse = files.slice(0, remaining);

  for (const file of filesToUse) {
    if (!file.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(file);
    images.value.push({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      url,
      file,
    });
  }
}

/**
 * 处理粘贴事件：从剪贴板中提取图片并加入 images
 */
async function handlePaste(e) {
  const items = e.clipboardData?.items;
  if (!items || !items.length) return;

  const imageFiles = [];
  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }

  if (imageFiles.length) {
    await addImagesFromFiles(imageFiles);
  }
}

/**
 * 处理 Enter 键：Enter 发送，Shift+Enter 换行
 */
function onEnterKey(e) {
  if (e.shiftKey) {
    // Shift+Enter：换行，保持默认行为
    return;
  }
  e.preventDefault();
  onSendOrStop();
}

/**
 * 从输入框触发发送：必须有文本才能发送，图片和附件仅作为补充
 */
async function send() {
  if (isSending.value) return;

  const text = input.value?.trim();
  if (!text) return;

  await sendMessage(text);
  if (textareaRef.value) {
    textareaRef.value.style.height = "";
  }
}

function isAbortError(err) {
  return (
    err?.name === "AbortError" ||
    err?.code === "ABORT_ERR" ||
    /aborted|abort/i.test(String(err?.message || ""))
  );
}

/**
 * 中止当前正在进行的 API 请求，并重置发送状态
 */
function abortCurrentRequest() {
  if (activeController) {
    try {
      activeController.abort();
    } catch (_) {}
    activeController = null;
  }
  isSending.value = false;
}

function onSendOrStop() {
  if (isSending.value) {
    abortCurrentRequest();
    return;
  }
  send();
}

/**
 * 真正的发送入口：支持多轮上下文、附件文本和多张图片（多模态）
 * 可被父组件通过 defineExpose 调用
 */
// 从外部调用发送消息（同时支持附件文本与多张图片）
async function sendMessage(content) {
  if (isSending.value) return;

  const raw = typeof content === "string" ? content : "";
  const text = raw.trim();
  if (!text) return;

  isSending.value = true;
  input.value = "";

  // 创建本次请求的 AbortController，并记录到组件作用域
  const controller = new AbortController();
  activeController = controller;

  const hasAttachments = attachments.value.length > 0;
  const hasImages = images.value.length > 0;
  if (hasAttachments || hasImages) {
    const attachmentSnapshots = attachments.value.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      text: a.text,
    }));
    const imageSnapshots = images.value.map((img) => ({
      id: img.id,
      name: img.name,
      url: img.url,
    }));
    chatStore.addMessage("user", {
      text,
      attachments: attachmentSnapshots,
      images: imageSnapshots,
    });
  } else {
    chatStore.addMessage("user", text);
  }

  // 跳转到对应聊天页面
  if (chatStore.currentChatId) {
    router.replace({
      name: "ChatById",
      params: { id: chatStore.currentChatId },
    });
  }

  // 添加空的 assistant 消息占位
  chatStore.addMessage("assistant", "");

  try {
    // 构造带有附件和图片上下文的完整 messages 列表
    const { messages } = await buildMessagesWithContext({
      history: chatStore.currentMessages,
      text,
      attachments: attachments.value,
      images: images.value,
      maxContextChars: MAX_CONTEXT_CHARS,
      supportsVision: appStore.currentModel?.supportsVision ?? false,
    });

    if (controller.signal.aborted) return;

    const modelConfig = appStore.currentModel;

    if (controller.signal.aborted) return;

    await requestChatStream({
      model: modelConfig.model,
      messages,
      onChunk: (chunk) => chatStore.appendToLastMessage(chunk),
      onError: (msg) => chatStore.setLastAssistantMessage(`错误：${msg}`),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      // 用户手动停止或请求被取消：不展示错误，只在需要时补一条提示
      const last =
        chatStore.currentMessages[chatStore.currentMessages.length - 1];
      if (
        last &&
        last.role === "assistant" &&
        (!last.content || !String(last.content).trim())
      ) {
        chatStore.setLastAssistantMessage("（已停止生成）");
      }
    } else {
      console.error("API 调用失败:", error);
      chatStore.setLastAssistantMessage(`错误：${error.message}`);
    }
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
    isSending.value = false;
    // AI 回复结束后清理附件与图片
    clearAttachment();
    clearImages();
  }
}

// 语音输入
const {
  isRecording,
  init: initSpeechRecognition,
  stop: stopSpeechRecognition,
  toggle: toggleSpeechRecognition,
} = useSpeechRecognition({
  onResult(text) {
    input.value = input.value + text;
    if (textareaRef.value) {
      autoResize(textareaRef.value);
    }
  },
});

function toggleRecording() {
  if (!toggleSpeechRecognition()) {
    alert(
      "当前浏览器不支持语音输入功能，请使用最新版的 Chrome、Edge 或 Safari 浏览器。",
    );
  }
}

// 在组件挂载时初始化
onMounted(() => {
  initSpeechRecognition();
  window.addEventListener("beforeunload", handleBeforeUnload);
});

// 在组件卸载时清理
onUnmounted(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  if (activeController) {
    try {
      activeController.abort();
    } catch (_) {}
    activeController = null;
  }
  isSending.value = false;
  stopSpeechRecognition();
});
// 用于记录切换到图片模型之前的原模型 ID，以便图片清空后恢复
const previousModelId = ref(null);

/**
 * 自动切换模型逻辑
 */
watch(
  () => images.value.length,
  (newCount, oldCount) => {
    // 当从 0 张图片变为有图片时
    if (newCount > 0 && oldCount === 0) {
      // 如果当前模型不支持视觉，则进行切换
      if (!appStore.currentModel.supportsVision) {
        previousModelId.value = appStore.currentModelId; // 记录当前模型
        appStore.setCurrentModelId("qwen-vl"); // 切换到 Qwen VL
        console.log("检测到图片，已自动切换到视觉模型：Qwen3-VL");
      }
    }
    // 当图片被清空时（如果你希望清空后恢复原来的模型）
    else if (newCount === 0 && oldCount > 0) {
      if (previousModelId.value) {
        appStore.setCurrentModelId(previousModelId.value);
        previousModelId.value = null;
        console.log("图片已清空，已恢复原模型");
      }
    }
  },
);

// 监控对话切换：切换对话时中止正在进行的请求
watch(
  () => chatStore.currentChatId,
  (newId, oldId) => {
    if (
      oldId != null &&
      newId != null &&
      oldId !== newId &&
      isSending.value
    ) {
      abortCurrentRequest();
    }
  },
);

// 页面关闭/刷新时中止请求
function handleBeforeUnload() {
  if (isSending.value && activeController) {
    activeController.abort();
  }
}

// 导出方法供父组件调用
defineExpose({
  sendMessage,
});
</script>

<template>
  <div class="shrink-0 border-t border-border bg-background p-4">
    <!-- 输入框：上方文本域，下方左右控件 -->
    <div
      class="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-surface-input px-4 py-3 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
    >
      <!-- 附件预览区：位于 textarea 上方 -->
      <div
        v-if="isParsingAttachment || attachments.length"
        class="flex flex-col gap-2"
      >
        <div class="flex items-center justify-between text-xs text-text-muted">
          <span v-if="isParsingAttachment">正在解析附件内容……</span>
          <span v-else
            >已加载 {{ attachments.length }} 个附件（最多可添加
            {{ MAX_ATTACHMENTS }} 个）</span
          >
          <button
            v-if="!isParsingAttachment && attachments.length"
            type="button"
            class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10"
            @click="clearAttachment"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
            <span>清空全部</span>
          </button>
        </div>
        <TransitionGroup name="attachment-slide" tag="div" class="flex flex-wrap gap-2 mb-2">
            <!-- 解析中占位标签 -->
            <div
              v-if="isParsingAttachment"
              key="parsing"
              class="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated/80 backdrop-blur-sm px-2.5 py-1.5"
            >
              <Icon icon="lucide:loader-2" class="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" />
              <span class="text-xs font-medium text-text-muted">解析中...</span>
            </div>
            <!-- 附件标签（胶囊样式） -->
            <div
              v-for="att in attachments"
              :key="att.id"
              class="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated/80 backdrop-blur-sm px-2.5 py-1.5"
            >
              <Icon
                :icon="getAttachmentIcon(att).icon"
                :class="['h-3.5 w-3.5 shrink-0', getAttachmentIcon(att).class]"
              />
              <span class="max-w-[150px] truncate text-xs font-medium text-text-primary">{{
                att.name
              }}</span>
              <button
                type="button"
                class="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                @click="removeAttachment(att.id)"
                aria-label="移除附件"
              >
                <Icon icon="lucide:x" class="h-3 w-3" />
              </button>
            </div>
          </TransitionGroup>
      </div>
      <textarea
        ref="textareaRef"
        v-model="input"
        class="min-h-[50px] w-full resize-none bg-transparent py-1 text-text-primary placeholder:text-text-muted focus:outline-none transition-[height] duration-150 ease-out"
        rows="1"
        placeholder="问问 AIChat（Enter 发送，Shift+Enter 换行）"
        @keydown.enter="onEnterKey"
        @input="onInput"
        @paste="handlePaste"
      />
      <!-- 图片上传状态与缩略图 -->
      <div v-if="images.length" class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs text-text-muted">
          <span>已选择 {{ images.length }} 张图片（最多可上传 {{ MAX_IMAGES }} 张）</span>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-500 transition-colors hover:bg-red-500/10"
            @click="clearImages"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
            <span>清空图片</span>
          </button>
        </div>
        <TransitionGroup name="image-slide" tag="div" class="flex flex-wrap gap-2 mb-2">
          <div
            v-for="img in images"
            :key="img.id"
            class="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-surface-elevated/80 backdrop-blur-sm"
          >
            <img
              :src="img.url"
              :alt="img.name"
              class="h-full w-full object-cover"
            />
            <button
              type="button"
              class="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-text-muted shadow-md transition-colors hover:bg-red-500/10 hover:text-red-500"
              @click="removeImage(img.id)"
              aria-label="移除图片"
            >
              <Icon icon="lucide:x" class="h-3 w-3" />
            </button>
          </div>
        </TransitionGroup>
      </div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            aria-label="添加附件"
            v-tooltip="'添加附件（支持 PDF、Word、TXT、JSON、CSV）'"
            @click="triggerFileSelect"
          >
            <Icon icon="lucide:link" class="h-5 w-5" />
            <span class="text-sm">添加附件</span>
          </button>
          <!-- 隐藏的文件选择框：支持 PDF / docx / txt / json / csv -->
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            multiple
            accept=".pdf,.docx,.txt,.json,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/json,text/csv,application/vnd.ms-excel"
            @change="handleFileChange"
          />
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            aria-label="上传图片"
            v-tooltip="'上传图片（支持多张）'"
            @click="triggerImageSelect"
          >
            <Icon icon="lucide:image" class="h-5 w-5" />
            <span class="text-sm">上传图片</span>
          </button>
          <!-- 隐藏的图片选择框：支持多张图片 -->
          <input
            ref="imageInputRef"
            type="file"
            class="hidden"
            multiple
            accept="image/*"
            @change="handleImageChange"
          />
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors duration-200"
            :class="
              isRecording
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'text-text-muted hover:bg-surface-elevated hover:text-text-primary'
            "
            :aria-label="isRecording ? '停止录音' : '语音输入'"
            v-tooltip="isRecording ? '停止录音' : '语音输入'"
            @click="toggleRecording"
          >
            <Icon
              :icon="isRecording ? 'lucide:mic-off' : 'lucide:mic'"
              class="h-5 w-5"
            />
            <span class="text-sm">
              {{ isRecording ? "录音中..." : "语音" }}
            </span>
            <span v-if="isRecording" class="relative flex h-2 w-2 ml-1">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
              ></span>
              <span
                class="relative inline-flex rounded-full h-2 w-2 bg-red-500"
              ></span>
            </span>
          </button>
        </div>
        <div class="flex items-center gap-1">
          <!-- 模型切换按钮：显示当前模型名称 -->
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              v-tooltip="`当前模型：${appStore.currentModel.label}`"
              @click="isModelMenuOpen = !isModelMenuOpen"
            >
              <span>{{ appStore.currentModel.shortLabel }}</span>
              <Icon icon="lucide:chevron-down" class="h-4 w-4" />
            </button>
            <transition name="fade">
              <div
                v-if="isModelMenuOpen"
                class="absolute right-0 bottom-full z-20 mb-1 w-44 rounded-lg border border-border bg-surface-elevated p-1 shadow-lg"
              >
                <button
                  v-for="m in appStore.modelOptions"
                  :key="m.id"
                  type="button"
                  class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-input hover:text-text-primary"
                  @click="selectModel(m.id)"
                >
                  <span class="truncate">{{ m.label }}</span>
                  <Icon
                    v-if="m.id === appStore.currentModelId"
                    icon="lucide:check"
                    class="h-4 w-4 text-primary"
                  />
                </button>
              </div>
            </transition>
          </div>
          <button
            type="button"
            class="rounded-lg p-1.5 text-primary hover:bg-primary-muted disabled:opacity-50 disabled:pointer-events-none"
            :aria-label="isSending ? '停止生成' : '发送'"
            v-tooltip="
              isSending ? '停止生成' : '发送（Enter 发送，Shift+Enter 换行）'
            "
            @click="onSendOrStop"
            :disabled="!isSending && !canSend"
          >
            <Icon v-if="!isSending" icon="lucide:send" class="h-5 w-5" />

            <Icon v-else icon="lucide:square" class="h-5 w-5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
