import { getGptReply } from '../openai/index.js'
import { getKimiReply } from '../kimi/index.js'

const serveMap = {
  GPT: getGptReply,
  Kimi: getKimiReply,
  ChatGPT: getGptReply,
}

export function getServe(serviceType) {
  const fn = serveMap[serviceType] || serveMap.Kimi
  return async (prompt, history) => fn(prompt, history)
}
