import { Configuration, OpenAIApi } from 'openai'

export async function getGptReply(prompt, history = []) {
  try {
    const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY || '' })
    const openai = new OpenAIApi(configuration)
    const messages = [
      { role: 'system', content: '你是纳西妲。' },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: String(prompt) },
    ]
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 512,
      temperature: 1.0,
    })
    return completion.data.choices?.[0]?.message?.content || ''
  } catch (error) {
    console.error('OpenAI request failed:', error?.message || error)
    return 'OpenAI 请求失败，请稍后再试。'
  }
}
