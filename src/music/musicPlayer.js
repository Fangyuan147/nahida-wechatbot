import { readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const kugouExe = process.env.KUGOU_EXE || 'C:\\Program Files\\KuGou\\KGMusic\\KuGou.exe'

const musicDirs = [
  path.join(os.homedir(), 'Music'),
  path.join(os.homedir(), 'Music', 'KuGou'),
  path.join(os.homedir(), 'Downloads'),
  ...(process.env.MUSIC_DIRS ? process.env.MUSIC_DIRS.split(';').map((dir) => dir.trim()).filter(Boolean) : []),
]

const audioExtensions = new Set(['.mp3', '.flac', '.wav', '.m4a', '.wma', '.ogg', '.ape', '.aac', '.wav'])

let musicIndex = []
let lastScanTime = 0
const scanTtlMs = 2 * 60 * 1000
let kugouCloseTimer = null
let launchedKugouPid = null

async function scanDirectory(dir, results = []) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await scanDirectory(fullPath, results)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (audioExtensions.has(ext)) {
          results.push({
            filename: entry.name,
            name: path.basename(entry.name, ext),
            path: fullPath,
            size: 0,
          })
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
      console.warn('[music] scan dir failed:', dir, error.message)
    }
  }
  return results
}

export async function buildMusicIndex(force = false) {
  const now = Date.now()
  if (!force && musicIndex.length > 0 && now - lastScanTime < scanTtlMs) {
    return musicIndex
  }

  console.log('[music] scanning local music files...')
  const results = []
  for (const dir of musicDirs) {
    await scanDirectory(dir, results)
  }

  for (const item of results) {
    try { item.size = (await stat(item.path)).size } catch (e) { /* ignore */ }
  }

  musicIndex = results
  lastScanTime = now
  console.log('[music] scan complete: ' + results.length + ' files found')
  return musicIndex
}

function searchMusic(query) {
  if (!query || musicIndex.length === 0) return []
  const q = String(query).toLowerCase().trim()

  const scored = musicIndex.map((item) => {
    const name = item.name.toLowerCase()
    let score = 0
    if (name === q) score = 100
    else if (name.includes(q)) score = 80
    else {
      const words = q.split(/\s+/)
      const matched = words.filter((w) => name.includes(w))
      score = (matched.length / words.length) * 60
    }
    return { ...item, score }
  })

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export function hasMusic() {
  return musicIndex.length > 0
}

export function getMusicCount() {
  return musicIndex.length
}

async function readFlacDurationMs(filePath) {
  const handle = await open(filePath, 'r')
  try {
    const header = Buffer.alloc(42)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    if (bytesRead < 42 || header.toString('ascii', 0, 4) !== 'fLaC' || (header[4] & 0x7f) !== 0) return 0
    const sampleRate = (header[18] << 12) | (header[19] << 4) | (header[20] >> 4)
    const totalSamples = ((header[21] & 0x0f) * 0x100000000)
      + (header[22] << 24) + (header[23] << 16) + (header[24] << 8) + header[25]
    return sampleRate && totalSamples ? Math.ceil((totalSamples / sampleRate) * 1000) : 0
  } finally {
    await handle.close()
  }
}

export async function getAudioDurationMs(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.flac') return 0
  try { return await readFlacDurationMs(filePath) }
  catch (error) { console.warn('[music] duration read failed:', error.message); return 0 }
}

async function closeKugou() {
  const pid = launchedKugouPid
  launchedKugouPid = null
  if (!pid) return false
  try {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    return true
  } catch (error) {
    console.warn('[music] own KuGou process close failed:', error.message)
    return false
  }
}

export function scheduleKugouClose(durationMs) {
  if (kugouCloseTimer) clearTimeout(kugouCloseTimer)
  if (!durationMs) return
  kugouCloseTimer = setTimeout(async () => {
    kugouCloseTimer = null
    const closed = await closeKugou()
    console.log('[music] playback ended; KuGou close ' + (closed ? 'requested' : 'failed'))
  }, durationMs + 1000)
}

export async function playMusic(query) {
  await buildMusicIndex()

  const results = searchMusic(query)
  if (results.length === 0) return { success: false, message: '唔……本地没有找到这首歌，宝宝是不是还没下载呀？' }

  const song = results[0]

  return new Promise((resolve) => {
    let settled = false
    const fail = (message, error) => {
      if (settled) return
      settled = true
      if (error) console.warn('[music] KuGou spawn failed:', error.message)
      resolve({ success: false, message })
    }

    try {
      // Pass the file directly to KuGou; Windows has no reliable .flac association here.
      const child = spawn(kugouExe, [song.path], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      })
      launchedKugouPid = child.pid || null

      child.once('error', (error) => fail('酷狗音乐启动失败了，宝宝检查一下是不是没有安装呀？', error))
      child.unref()

      setTimeout(() => {
        if (settled) return
        settled = true
        getAudioDurationMs(song.path).then((durationMs) => {
          scheduleKugouClose(durationMs)
          console.log('[music] scheduled KuGou close in ' + (durationMs ? durationMs + 1000 : 'unknown') + 'ms')
        })
        resolve({
          success: true,
          song: song.name,
          path: song.path,
          message: '好呀，酷狗已经打开，正在播放「' + song.name + '」～',
        })
      }, 1000)
    } catch (error) {
      fail('播放出错了，宝宝等会再试试吧。', error)
    }
  })
}

export async function getRandomSong() {
  await buildMusicIndex()
  if (musicIndex.length === 0) return null
  return musicIndex[Math.floor(Math.random() * musicIndex.length)]
}
