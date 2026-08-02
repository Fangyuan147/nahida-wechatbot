export const replyDelayMs = 5 * 1000


export function addDelayedPrompt(state, prompt) {
  const prompts = Array.isArray(state?.prompts) ? state.prompts : []
  return { ...state, prompts: [...prompts, String(prompt)] }
}

export function createReplyDelayTimer(onElapsed, delayMs = replyDelayMs) {
  let timer = null
  return {
    restart() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        Promise.resolve(onElapsed()).catch((error) => console.error('[message] delayed timer callback failed:', error?.stack || error))
      }, delayMs)
    },
    cancel() { if (timer) clearTimeout(timer); timer = null },
  }
}

export function createDelayedReplyCollector(onFlush, onIdle = () => {}, delayMs = replyDelayMs) {
  let prompts = [], running = false, cancelled = false, markerCount = 0
  const timer = createReplyDelayTimer(() => flush(), delayMs)
  async function flush() {
    if (cancelled || running || prompts.length === 0) return
    running = true
    const batchMarker = markerCount
    const batch = prompts
    prompts = []
    try {
      const completed = await onFlush(batch, batchMarker, () => markerCount === batchMarker)
      if (completed === false) prompts = [...batch, ...prompts]
    } catch (error) {
      prompts = [...batch, ...prompts]
      throw error
    } finally {
      running = false
      if (prompts.length > 0) timer.restart()
      else { markerCount = 0; onIdle() }
    }
  }
  return {
    add(prompt) { if (!cancelled) { markerCount += 1; prompts.push(String(prompt)); timer.restart() } },
    cancel() { cancelled = true; prompts = []; timer.cancel() },
    getPendingCount() { return prompts.length },
    getVersion() { return markerCount },
    getMarkerCount() { return markerCount },
    isRunning() { return running },
  }
}

export function formatCollectedPrompts(prompts = []) {
  return prompts.map((prompt) => String(prompt).trim()).filter(Boolean).join('\n')
}
