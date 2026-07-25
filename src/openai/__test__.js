import { getGptReply } from './index.js'
console.log('Testing OpenAI API...')
const reply = await getGptReply('Hello', [])
console.log('Reply:', reply || '(empty)')
