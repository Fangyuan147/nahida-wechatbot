import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAtomicJsonStore } from '../storage/atomicJsonStore.js'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const historyStore = createAtomicJsonStore({
  filePath: path.join(projectDir, 'chat-history', 'conversations.json'),
  defaultValue: { version: 1, conversations: {} },
  migrations: { 0: (value) => ({ version: 1, conversations: value || {} }) },
  validate: (value) => value && value.version === 1 && value.conversations && typeof value.conversations === 'object',
})
const maxAgeMs = 14 * 24 * 60 * 60 * 1000
const maxMessages = 40
const maxContentLength = 5000

let data = (await historyStore.load()).conversations

function prune() {
  const cutoff = Date.now() - maxAgeMs
  for (const id of Object.keys(data)) {
    data[id] = (Array.isArray(data[id]) ? data[id] : [])
      .filter((entry) => Number(entry.timestamp) > cutoff)
      .slice(-maxMessages)
    if (data[id].length === 0) delete data[id]
  }
}

async function save() {
  prune()
  await historyStore.save({ version: 1, conversations: data })
}

export async function getHistory(conversationId) {
  const id = String(conversationId)
  prune()
  return (data[id] || []).map(({ role, content }) => ({ role, content: String(content).slice(0, maxContentLength) }))
}

export async function appendHistory(conversationId, entries) {
  const id = String(conversationId)
  const now = Date.now()
  if (!data[id]) data[id] = []
  for (const entry of entries) {
    if (!entry || !entry.role || !entry.content) continue
    data[id].push({ role: entry.role, content: String(entry.content).slice(0, maxContentLength), timestamp: now })
  }
  data[id] = data[id].slice(-maxMessages)
  await save()
}

export async function clearHistory(conversationId) {
  delete data[String(conversationId)]
  await save()
}
