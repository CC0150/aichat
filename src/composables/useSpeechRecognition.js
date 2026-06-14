import { ref } from "vue";

/**
 * 语音输入 composable：基于 Web Speech API 的语音转文字
 * 适用于 Chrome、Edge、Safari 等支持 Web Speech API 的浏览器
 *
 * @param {Object} options
 * @param {(text: string) => void} [options.onResult] - 识别到文字时的回调，由调用方将文字追加到输入框等
 * @returns {{ isRecording, supported, init, stop, toggle }}
 */
export function useSpeechRecognition(options = {}) {
  const { onResult } = options;

  // 是否正在录音，用于 UI 展示（如按钮高亮）
  const isRecording = ref(false);
  // 当前浏览器是否支持语音识别
  const supported = ref(false);
  // Web Speech API 的识别实例，init 成功后才有值
  let recognition = null;

  /**
   * 初始化语音识别：创建 Recognition 实例并注册事件
   * 应在组件 onMounted 时调用
   */
  function init() {
    // 兼容标准前缀与 webkit 前缀（Safari）
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "zh-CN"; // 识别语言：中文
    rec.continuous = true; // 持续识别，直到用户主动停止
    rec.interimResults = false; // 不返回中间结果，避免输入框内容闪烁

    // 开始录音时
    rec.onstart = () => {
      isRecording.value = true;
    };

    // 识别到语音结果时
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          // 只处理最终结果，跳过中间猜测
          const text = event.results[i][0].transcript;
          onResult?.(text);
        }
      }
    };

    // 识别出错时（如无麦克风权限、未检测到声音）
    rec.onerror = (event) => {
      console.warn("语音识别出错:", event.error);
      // 权限拒绝或无声时，提前结束录音状态
      if (event.error === "not-allowed" || event.error === "no-speech") {
        isRecording.value = false;
      }
    };

    // 识别会话结束时（用户停止或出错）
    rec.onend = () => {
      isRecording.value = false;
    };

    recognition = rec;
    supported.value = true;
  }

  /**
   * 停止当前录音
   * 应在组件 onUnmounted 时调用，避免离开页面后仍在录音
   */
  function stop() {
    if (recognition && isRecording.value) {
      recognition.stop();
    }
  }

  /**
   * 切换录音状态：未录音则开始，已录音则停止
   * @returns {boolean} 是否支持语音输入，false 时调用方应提示用户
   */
  function toggle() {
    if (!recognition) {
      return false;
    }
    if (isRecording.value) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn("语音识别启动失败，可能正在运行中", e);
      }
    }
    return true;
  }

  return {
    isRecording,
    supported,
    init,
    stop,
    toggle,
  };
}
