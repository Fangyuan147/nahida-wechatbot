import { callAiProvider } from '../ai/providers/index.js'

export function getServe(serviceType) {
  return async (prompt, history) => callAiProvider(serviceType, prompt, history)
}
