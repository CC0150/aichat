<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
// highlight.js 代码高亮主题（深色）
import 'highlight.js/styles/github-dark.css'

const props = defineProps({
  content: { type: String, default: '' },
})

const rootRef = ref(null)

const md = new MarkdownIt({ html: false, linkify: true })

// 代码块：高亮 + 复制按钮（原始代码存于 data-code-base64）
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const lang = (token.info.trim().split(/\s+/)[0] || 'text').replace(/^language-/, '')
  const code = token.content
  const highlighted =
    lang && hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang }).value
      : md.utils.escapeHtml(code)
  const codeBase64 = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(code))) : ''
  return `
    <div class="code-block-wrapper">
      <button type="button" class="code-block-copy-btn" data-code-base64="${codeBase64}" title="复制代码">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>复制</span>
      </button>
      <pre class="hljs rounded-lg border border-border p-4 text-sm overflow-x-auto"><code class="language-${lang}">${highlighted}</code></pre>
    </div>
  `.trim()
}

const html = computed(() => md.render(props.content || ''))

function handleCopyCode(e) {
  const btn = e.target.closest('.code-block-copy-btn')
  if (!btn) return
  const b64 = btn.getAttribute('data-code-base64')
  if (!b64) return
  try {
    const text = decodeURIComponent(escape(typeof atob !== 'undefined' ? atob(b64) : ''))
    navigator.clipboard.writeText(text)
    const span = btn.querySelector('span')
    if (span) {
      const old = span.textContent
      span.textContent = '已复制'
      setTimeout(() => { span.textContent = old }, 1500)
    }
  } catch (_) {}
}

onMounted(() => {
  rootRef.value?.addEventListener('click', handleCopyCode)
})

onUnmounted(() => {
  rootRef.value?.removeEventListener('click', handleCopyCode)
})
</script>

<template>
  <div
    ref="rootRef"
    class="markdown-body prose prose-invert max-w-none dark:prose-invert"
    :class="$style.root"
    v-html="html"
  />
</template>

<style module>
.root :global(.code-block-wrapper) {
  @apply relative my-2;
}
.root :global(.code-block-copy-btn) {
  @apply absolute right-2 top-2 flex items-center gap-1 rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-text-secondary hover:bg-surface-input hover:text-text-primary;
}
.root :global(.code-block-wrapper pre) {
  @apply rounded-lg border border-border p-4 pr-14 text-sm;
}
.root :global(pre code) {
  @apply bg-transparent p-0;
}
.root :global(code) {
  @apply rounded bg-surface-elevated px-1.5 py-0.5 text-sm;
}
.root :global(p) {
  @apply my-2;
}
.root :global(ul),
.root :global(ol) {
  @apply my-2 pl-6;
}
.root :global(blockquote) {
  @apply border-l-4 border-primary-muted pl-4 italic text-text-secondary;
}
.root :global(a) {
  @apply text-primary underline;
}
</style>
