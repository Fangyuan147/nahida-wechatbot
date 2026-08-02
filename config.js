import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(projectDir, '.env')

// Keep configuration loading independent from optional package links in node_modules.
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, '')
  }
}

function csv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

export const botName = process.env.BOT_NAME || '\u5b50\u519b'
// Production access uses stable WeChat contact IDs, never names or aliases.
export const boundUserIds = csv(process.env.BOUND_USER_IDS)
export const roomWhiteList = csv(process.env.ROOM_WHITELIST)
