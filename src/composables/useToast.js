import { ref } from 'vue'

/**
 * 轻量 toast 通知
 *
 * 用法：
 *   const { toast, showToast } = useToast()
 *   在模板里放 <Transition name="fade"><div v-if="toast">...</div></Transition>
 *   showToast('操作成功') / showToast('操作失败', 'error')
 */

export function useToast() {
  const message = ref('')
  const type = ref('success') // 'success' | 'error'
  let timer = null

  function showToast(msg, t = 'success', duration = 3000) {
    if (timer) clearTimeout(timer)
    message.value = msg
    type.value = t
    timer = setTimeout(() => {
      message.value = ''
    }, duration)
  }

  return { toast: message, toastType: type, showToast }
}
