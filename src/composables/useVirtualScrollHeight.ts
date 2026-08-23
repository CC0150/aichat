import { ref, onUnmounted } from 'vue'

/**
 * DynamicScroller 增强 —— 解决流式场景下两个 DynamicScroller 自带能力也覆盖不了的盲区：
 *
 * 盲区 1 — 切对话首屏跳动：
 *   切到一个历史对话，DynamicScroller 还不知道各 item 高度 → 全部按 min-item-size 渲染，
 *   ResizeObserver 回调到达后逐个修正 → 页面剧烈跳动。这个 composable 在切对话后
 *   "等首帧测量完成再标记就绪"，上层可以在此期间隐藏内容或显示骨架。
 *
 * 盲区 2 — 流式输出滚动抖动：
 *   流式 chunk → DOM 高度变化 → scrollTo 触发，但 DynamicScroller 内部 ResizeObserver
 *   还没回调 → scrollHeight 是旧值 → 滚动不到位 → 下一帧 ResizeObserver 回调修正布局
 *   → 视觉上抖一下。双 RAF 给 DynamicScroller 一整帧时间完成测量，再读 scrollHeight 就准了。
 *
 * @param scrollerRef  DynamicScroller 组件的模板 ref
 */
export function useScrollStabilizer(scrollerRef: any) {
  /** 首屏渲染是否完成（切对话后首帧的高度测量全部完毕） */
  const ready = ref(false)

  /**
   * 安全滚动到底部 —— 双 RAF
   *
   * 第一帧：Vue 完成 DOM 更新，DynamicScroller 的 ResizeObserver 在此帧或之前触发回调
   * 第二帧：DynamicScroller 已完成内部测量和布局调整，此时 scrollHeight 是准确的
   */
  function scrollToBottomStable(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollerRef.value?.$el
        if (el) {
          el.scrollTop = el.scrollHeight
        }
      })
    })
  }

  /**
   * 切对话后标记"未就绪"，等 DynamicScroller 完成第一次高度测量再置为 true。
   *
   * 策略：DynamicScroller 完成所有 item 的 ResizeObserver 回调后，内部布局会稳定，
   * 此时 scroll 事件必然触发一次（即便是 scrollTop=0，DynamicScroller 内部也可能触发）。
   * 如果 scroller 本身没有滚动条（内容不足），用一个短 setTimeout 兜底。
   */
  function markReadyAfterFirstMeasure(): void {
    ready.value = false
    const el = scrollerRef.value?.$el
    if (!el) {
      ready.value = true
      return
    }

    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      ready.value = true
      el.removeEventListener('scroll', finish)
    }

    el.addEventListener('scroll', finish, { once: true })
    // 兜底：300ms 内没触发 scroll 事件 → 内容不足或 DynamicScroller 没重建 DOM，直接标记就绪
    setTimeout(finish, 300)
  }

  onUnmounted(() => {
    ready.value = false
  })

  return { ready, scrollToBottomStable, markReadyAfterFirstMeasure }
}
