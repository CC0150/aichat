export function autoResize(el: HTMLTextAreaElement, maxHeight: number): void {
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
}
