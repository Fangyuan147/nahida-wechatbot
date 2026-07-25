import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const historyDir = path.join(projectDir, 'chat-history')
const historyFile = path.join(historyDir, 'conversations.json')
const maxAgeMs = 14 * 24 * 60 * 60 * 1000
const maxMessages = 40
const maxContentLength = 5000

let data = {}

async function load() {
  try { data = JSON.parse(await readFile(historyFile, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') console.warn('[history] read failed:', error.message)
    data = {}
  }
  prune()
}

async function save() {
  await mkdir(historyDir, { recursive: true })
  await writeFile(historyFile, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function prune() {
  const cutoff = Date.now() - maxAgeMs
  for (const id of Object.keys(data)) {
    data[id] = (data[id] || []).filter((entry) => entry.timestamp > cutoff).slice(-maxMessages)
    if (data[id].length === 0) delete data[id]
  }
}

await load()

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
  const id = String(conversationId)
  delete data[id]
  await save()
}
