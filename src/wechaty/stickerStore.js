import { cp, mkdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createAtomicJsonStore } from '../storage/atomicJsonStore.js'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packsDir = path.resolve(process.env.STICKER_PACKS_DIR || path.join(projectDir, 'sticker-packs'))
const pendingDir = path.join(packsDir, '.pending')
const indexFile = path.join(packsDir, 'index.json')
const indexStore = createAtomicJsonStore({
  filePath: indexFile,
  defaultValue: { version: 1, stickers: {} },
  migrations: { 0: (value) => ({ version: 1, stickers: value || {} }) },
  validate: (value) => value && value.version === 1 && value.stickers && typeof value.stickers === 'object',
})
const captureStore = createAtomicJsonStore({
  filePath: path.join(path.resolve(process.env.BOT_STATE_DIR || path.join(projectDir, 'bot-state')), 'sticker-capture.json'),
  defaultValue: { version: 1, captures: {} },
  validate: (value) => value && typeof value === 'object' && value.captures && typeof value.captures === 'object',
})

// captureState: conversationId -> { remaining: number } | 'asking_count'
const captureStateMap = new Map()
export const captureTimeoutMs = 60 * 1000
const captureTimers = new Map()
const captureTimeouts = new Map()

let dirsReady = false
let indexCache = null
let indexCacheTime = 0
let captureData = (await captureStore.load()).captures

async function ensureDirs() {
  if (dirsReady) return
  await mkdir(pendingDir, { recursive: true })
  dirsReady = true
}

async function loadIndex() {
  if (indexCache && Date.now() - indexCacheTime < 30000) return indexCache
  const stored = await indexStore.load()
  indexCache = stored.stickers || stored
  indexCacheTime = Date.now()
  return indexCache
}

async function saveIndex(indexData) {
  indexCache = indexData
  indexCacheTime = Date.now()
  await indexStore.save({ version: 1, stickers: indexData })
}

function persistCaptureState(conversationId) {
  const key = String(conversationId)
  const value = captureStateMap.get(key)
  if (value) captureData[key] = { value, expiresAt: Date.now() + (captureTimeouts.get(key) || captureTimeoutMs) }
  else delete captureData[key]
  captureStore.save({ version: 1, captures: captureData }).catch((error) => console.warn('[sticker] capture state save failed:', error.message))
}

// ── capture state machine ──

function clearCaptureTimer(conversationId) {
  const key = String(conversationId)
  const timer = captureTimers.get(key)
  if (timer) clearTimeout(timer)
  captureTimers.delete(key)
}

function scheduleCaptureExpiry(conversationId, timeoutMs = captureTimeoutMs) {
  const key = String(conversationId)
  clearCaptureTimer(key)
  captureTimeouts.set(key, timeoutMs)
  captureTimers.set(key, setTimeout(() => {
    if (!captureStateMap.has(key)) return
    captureStateMap.delete(key)
    captureTimeouts.delete(key)
    captureTimers.delete(key)
    persistCaptureState(key)
    console.log('[sticker] capture expired after 60s: ' + key)
  }, timeoutMs))
}

for (const [conversationId, persisted] of Object.entries(captureData)) {
  if (!persisted || persisted.expiresAt <= Date.now()) {
    delete captureData[conversationId]
    continue
  }
  captureStateMap.set(conversationId, persisted.value)
  scheduleCaptureExpiry(conversationId, Math.max(1, persisted.expiresAt - Date.now()))
}
captureStore.save({ version: 1, captures: captureData }).catch((error) => console.warn('[sticker] capture state cleanup failed:', error.message))

export function startCaptureFlow(conversationId, timeoutMs = captureTimeoutMs) {
  const key = String(conversationId)
  captureStateMap.set(key, 'asking_count')
  scheduleCaptureExpiry(key, timeoutMs)
  persistCaptureState(key)
}

export function setCaptureCount(conversationId, count, timeoutMs = captureTimeouts.get(String(conversationId)) || captureTimeoutMs) {
  const key = String(conversationId)
  const n = Math.max(1, Math.min(Number(count) || 1, 20))
  captureStateMap.set(key, { remaining: n, total: n })
  scheduleCaptureExpiry(key, timeoutMs)
  persistCaptureState(key)
  return n
}

export function getCaptureState(conversationId) {
  const key = String(conversationId)
  return captureStateMap.get(key) || null
}

export function consumeOneCaptureSlot(conversationId) {
  const key = String(conversationId)
  const state = captureStateMap.get(key)
  if (!state || state === 'asking_count') return false
  state.remaining -= 1
  if (state.remaining <= 0) {
    captureStateMap.delete(key)
    clearCaptureTimer(key)
    captureTimeouts.delete(key)
    persistCaptureState(key)
    return state.total  // last one — return total for the "done" message
  }
  scheduleCaptureExpiry(key, captureTimeouts.get(key) || captureTimeoutMs)
  persistCaptureState(key)
  return state.remaining + 1  // return how many left INCLUDING this one
}

export function cancelCapture(conversationId) {
  const key = String(conversationId)
  captureStateMap.delete(key)
  clearCaptureTimer(key)
  captureTimeouts.delete(key)
  persistCaptureState(key)
}

// ── save / archive ──

export async function savePendingSticker(msg, conversationId) {
  await ensureDirs()
  const pendingPath = path.join(pendingDir, hashId(conversationId) + '_pending')

  let fileBox = null
  let usedMethod = ''

  try { fileBox = await msg.toFileBox(); usedMethod = 'toFileBox' } catch (e) {}
  if (!fileBox) { try { fileBox = await msg.toImage(); usedMethod = 'toImage' } catch (e) {} }
  if (!fileBox) { try { fileBox = await msg.toThumbnail(); usedMethod = 'toThumbnail' } catch (e) {} }
  if (!fileBox) {
    try {
      const payload = msg.payload || msg._payload || {}
      const { FileBox } = await import('file-box')
      if (payload.stream) { fileBox = FileBox.fromStream(payload.stream, payload.fileName || 'sticker.png'); usedMethod = 'payloadStream' }
      else if (payload.url) { fileBox = FileBox.fromUrl(payload.url, { name: payload.fileName || 'sticker.png' }); usedMethod = 'payloadUrl' }
      else if (payload.fileName) { fileBox = FileBox.fromFile(payload.fileName); usedMethod = 'payloadFile' }
    } catch (e) {}
  }
  if (!fileBox) {
    try {
      const txt = typeof msg.text === 'function' ? msg.text() : ''
      if (txt && /^data:image\//.test(txt)) {
        const { FileBox } = await import('file-box')
        fileBox = FileBox.fromDataURL(txt, 'sticker.png')
        usedMethod = 'dataURL'
      }
    } catch (e) {}
  }
  if (!fileBox) {
    try {
      const { FileBox } = await import('file-box')
      const payload = msg.payload || msg._payload || {}
      for (const candidate of [payload.filePath, payload.imgUrl, payload.url, payload.thumburl, payload.hdUrl, payload.md5ImgUrl].filter(Boolean)) {
        try {
          if (await import('node:fs/promises').then(m => m.stat(candidate)).then(s => s.isFile()).catch(() => false)) {
            fileBox = FileBox.fromFile(candidate); usedMethod = 'localPath'; break
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  if (!fileBox) {
    const msgType = typeof msg.type === 'function' ? msg.type() : '?'
    throw new Error('无法提取图片，消息类型: ' + msgType)
  }

  await fileBox.toFile(pendingPath, true)
  console.log('[sticker] saved pending via ' + usedMethod + ': ' + pendingPath)
}

function hashId(cid) {
  let h = 0
  const s = String(cid)
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16).padStart(8, '0')
}

export async function archivePendingSticker(conversationId, tags = []) {
  await ensureDirs()
  const pendingPath = path.join(pendingDir, hashId(conversationId) + '_pending')

  let fileStat
  try { fileStat = await stat(pendingPath) } catch (error) { return false }
  if (!fileStat.isFile() || fileStat.size === 0) return false

  let ext = path.extname(pendingPath).toLowerCase()
  if (!ext || ext.length > 6) ext = '.png'

  const filename = 'sticker_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext
  const targetPath = path.join(packsDir, filename)

  const stagingPath = targetPath + '.tmp'
  await cp(pendingPath, stagingPath)
  await rename(stagingPath, targetPath)

  const index = await loadIndex()
  index[filename] = { created: Date.now(), tags: Array.isArray(tags) ? tags : [], conversationId }
  try {
    await saveIndex(index)
  } catch (error) {
    await unlink(targetPath).catch(() => {})
    throw error
  }
  await rm(pendingPath, { force: true })
  console.log('[sticker] archived: ' + filename)
  return filename
}

// ── list / count / random ──

async function getValidFilenames() {
  const index = await loadIndex()
  const names = Object.keys(index).filter((n) => !n.startsWith('.'))
  const results = []
  for (const name of names) {
    try {
      const s = await stat(path.join(packsDir, name))
      if (s.isFile() && s.size > 0) results.push(name)
    } catch (e) {}
  }
  return results
}

export async function listStickers() {
  await ensureDirs()
  const index = await loadIndex()
  const valid = await getValidFilenames()
  return valid
    .map((name) => ({ filename: name, ...(index[name] || {}), created: index[name]?.created || 0 }))
    .sort((a, b) => a.created - b.created)
}

export async function countStickers() {
  return (await getValidFilenames()).length
}

export async function randomSticker({ emotion = '', prompt = '' } = {}) {
  const validFiles = await getValidFilenames()
  if (validFiles.length === 0) return null

  const index = await loadIndex()
  const emotionTags = {
    affectionate: ['撒娇', '贴贴', '抱抱', '亲亲', '黏人', '可爱', '爱心', '喜欢', '亲密'],
    spoiled: ['撒娇', '卖萌', '可爱', '委屈', '求求', '拜托', '傲娇'],
    happy: ['开心', '笑', '庆祝', '加油', '嗨', '耶', '鼓励', '欢迎', '感谢', '奖励'],
    sad: ['难过', '哭', '委屈', '伤心', '安慰'],
    angry: ['生气', '怒', '凶', '不理你', '哼', '傲娇'],
    shy: ['害羞', '脸红', '不好意思'],
    surprised: ['惊讶', '震惊', '吓', '愣', '疑惑', '好奇'],
    sleepy: ['困', '晚安', '卖萌', '可爱'],
    jealous: ['吃醋', '生气', '哼', '傲娇', '不理你'],
  }

  let candidates = validFiles
  if (emotion && emotionTags[emotion]) {
    const tags = emotionTags[emotion]
    const matched = candidates.filter((name) => {
      const entry = index[name]
      return entry?.tags?.length ? entry.tags.some((t) => tags.includes(t)) : false
    })
    // A mismatched sticker is worse than sending no sticker; never fall back to the full library.
    if (matched.length === 0) return null
    candidates = matched
  }

  const filename = candidates[Math.floor(Math.random() * candidates.length)]
  const { FileBox } = await import('file-box')
  return FileBox.fromFile(path.join(packsDir, filename))
}

// ── delete ──

export async function deleteSticker(filename) {
  await ensureDirs()
  const filePath = path.join(packsDir, filename)
  try {
    await unlink(filePath)
    const index = await loadIndex()
    delete index[filename]
    await saveIndex(index)
    console.log('[sticker] deleted: ' + filename)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      const index = await loadIndex()
      delete index[filename]
      await saveIndex(index)
      return true
    }
    console.warn('[sticker] delete failed:', error.message)
    return false
  }
}

export async function deleteAllStickers() {
  await ensureDirs()
  const valid = await getValidFilenames()
  let deleted = 0
  for (const name of valid) {
    try { await unlink(path.join(packsDir, name)); deleted++ } catch (e) {}
  }
  await saveIndex({})
  indexCache = {}
  console.log('[sticker] deleted all: ' + deleted)
  return deleted
}
