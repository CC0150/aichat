<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const props = defineProps({
  content: { type: String, default: '' },
})

const rootRef = ref(null)

const md = new MarkdownIt({ html: false, linkify: true })

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
      <div class="code-block-header">
        <span class="code-block-lang">${lang}</span>
        <button type="button" class="code-block-copy-btn" data-code-base64="${codeBase64}" title="Copy code">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          <span>Copy</span>
        </button>
      </div>
      <pre class="hljs"><code class="language-${lang}">${highlighted}</code></pre>
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
      span.textContent = 'Copied'
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
    class="markdown-body prose max-w-none text-[15px] leading-relaxed"
    :class="$style.root"
    v-html="html"
  />
</template>

<style module>
.root :global(.code-block-wrapper) {
  @apply my-3 overflow-hidden rounded-xl border border-border;
}
.root :global(.code-block-header) {
  @apply flex items-center justify-between border-b border-border bg-surface-input px-4 py-2;
}
.root :global(.code-block-lang) {
  @apply text-[11px] font-medium uppercase tracking-wider text-text-muted;
}
.root :global(.code-block-copy-btn) {
  @apply flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-text-primary;
}
.root :global(.code-block-wrapper pre) {
  @apply m-0 rounded-none border-0 bg-transparent p-4 text-[13px] leading-relaxed;
}
.root :global(pre code) {
  @apply bg-transparent p-0 text-[13px];
}
.root :global(code) {
  @apply rounded-md bg-surface-input px-1.5 py-0.5 text-[13px] font-medium text-primary;
}
.root :global(p) {
  @apply my-2 leading-relaxed;
}
.root :global(ul),
.root :global(ol) {
  @apply my-2 pl-6 leading-relaxed;
}
.root :global(blockquote) {
  @apply my-3 border-l-[3px] border-primary-muted pl-4 italic text-text-secondary;
}
.root :global(a) {
  @apply font-medium text-primary underline decoration-primary-muted underline-offset-2 transition-colors hover:decoration-primary;
}
.root :global(h1),
.root :global(h2),
.root :global(h3),
.root :global(h4) {
  @apply mt-4 mb-2 font-semibold tracking-tight text-text-primary;
}
.root :global(hr) {
  @apply my-4 border-border;
}
.root :global(table) {
  @apply my-3 w-full overflow-hidden rounded-lg border border-border;
}
.root :global(th) {
  @apply bg-surface-input px-4 py-2 text-left text-[13px] font-semibold text-text-primary;
}
.root :global(td) {
  @apply border-t border-border px-4 py-2 text-[13px] text-text-secondary;
}
</style>
