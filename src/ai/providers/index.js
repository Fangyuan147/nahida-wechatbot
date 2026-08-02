export async function callAiProvider(serviceType = 'Kimi', prompt, history = []) {
  if (serviceType === 'GPT' || serviceType === 'ChatGPT') {
    const { getGptReply } = await import('../../openai/index.js')
    return getGptReply(prompt, history)
  }
  const { getKimiReply } = await import('../../kimi/index.js')
  return getKimiReply(prompt, history)
}
