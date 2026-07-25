import { cp, mkdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packsDir = path.join(projectDir, 'sticker-packs')
const pendingDir = path.join(packsDir, '.pending')
const indexFile = path.join(packsDir, 'index.json')

// captureState: conversationId -> { remaining: number } | 'asking_count'
const captureStateMap = new Map()
const pendingTtlMs = 10 * 60 * 1000

let dirsReady = false
let indexCache = null
let indexCacheTime = 0

async function ensureDirs() {
  if (dirsReady) return
  await mkdir(pendingDir, { recursive: true })
  dirsReady = true
}

async function loadIndex() {
  if (indexCache && Date.now() - indexCacheTime < 30000) return indexCache
  try {
    indexCache = JSON.parse(await readFile(indexFile, 'utf8'))
    indexCacheTime = Date.now()
    return indexCache
  } catch (error) {
    if (error.code === 'ENOENT') { indexCache = {}; return indexCache }
    console.warn('[sticker] index read failed:', error.message)
    return indexCache || {}
  }
}

async function saveIndex(indexData) {
  indexCache = indexData
  indexCacheTime = Date.now()
  await writeFile(indexFile, JSON.stringify(indexData, null, 2) + '\n', 'utf8')
}

// ── capture state machine ──

export function startCaptureFlow(conversationId) {
  captureStateMap.set(String(conversationId), 'asking_count')
}

export function setCaptureCount(conversationId, count) {
  const n = Math.max(1, Math.min(Number(count) || 1, 20))
  captureStateMap.set(String(conversationId), { remaining: n, total: n })
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
    return state.total  // last one — return total for the "done" message
  }
  return state.remaining + 1  // return how many left INCLUDING this one
}

export function cancelCapture(conversationId) {
  captureStateMap.delete(String(conversationId))
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

  await cp(pendingPath, targetPath)
  await rm(pendingPath, { force: true })

  const index = await loadIndex()
  index[filename] = { created: Date.now(), tags: Array.isArray(tags) ? tags : [], conversationId }
  await saveIndex(index)
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
    affectionate: ['撒娇', '贴贴', '抱抱', '亲亲', '黏人', '可爱', '爱心', '喜欢'],
    spoiled: ['撒娇', '卖萌', '可爱', '委屈', '求求', '拜托'],
    happy: ['开心', '笑', '庆祝', '加油', '嗨', '耶'],
    sad: ['难过', '哭', '委屈', '伤心'],
    angry: ['生气', '怒', '凶', '不理你'],
    shy: ['害羞', '脸红', '不好意思'],
    surprised: ['惊讶', '震惊', '吓', '愣'],
  }

  let candidates = validFiles
  if (emotion && emotionTags[emotion]) {
    const tags = emotionTags[emotion]
    const matched = candidates.filter((name) => {
      const entry = index[name]
      return entry?.tags?.length ? entry.tags.some((t) => tags.includes(t)) : false
    })
    if (matched.length > 0) candidates = matched
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