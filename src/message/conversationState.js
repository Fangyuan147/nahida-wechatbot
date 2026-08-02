import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAtomicJsonStore } from '../storage/atomicJsonStore.js'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const stateStore = createAtomicJsonStore({
  filePath: path.join(path.resolve(process.env.BOT_STATE_DIR || path.join(projectDir, 'bot-state')), 'conversations.json'),
  defaultValue: { version: 1, conversations: {} },
  validate: (value) => value && typeof value === 'object' && value.conversations && typeof value.conversations === 'object',
})

let state = await stateStore.load()

function normalizeId(conversationId) { return String(conversationId) }

export function getConversationState(conversationId) {
  return state.conversations[normalizeId(conversationId)] || null
}

export async function saveConversationState(conversationId, patch) {
  const id = normalizeId(conversationId)
  state.conversations[id] = { ...(state.conversations[id] || {}), ...patch, updatedAt: Date.now() }
  await stateStore.save(state)
  return state.conversations[id]
}

export async function clearConversationState(conversationId, fields = null) {
  const id = normalizeId(conversationId)
  if (!state.conversations[id]) return
  if (!fields) delete state.conversations[id]
  else {
    for (const field of fields) delete state.conversations[id][field]
    if (Object.keys(state.conversations[id]).length <= 1) delete state.conversations[id]
  }
  await stateStore.save(state)
}

export function getConversationStates() { return structuredClone(state.conversations) }
