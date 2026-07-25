import { getKimiReply } from './index.js'
const prompt = '你好，请用一句话介绍你自己。'
console.log('Testing Kimi API...')
const reply = await getKimiReply(prompt, [])
console.log('Reply:', reply || '(empty)')
console.log('Test done.')
