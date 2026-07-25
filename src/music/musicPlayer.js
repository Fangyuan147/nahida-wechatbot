import { readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const kugouExe = 'C:\\Program Files\\KuGou\\KGMusic\\KuGou.exe'

const musicDirs = [
  path.join(os.homedir(), 'Music'),
  path.join(os.homedir(), 'Music', 'KuGou'),
  path.join(os.homedir(), 'Downloads'),
]

const audioExtensions = new Set(['.mp3', '.flac', '.wav', '.m4a', '.wma', '.ogg', '.ape', '.aac', '.wav'])

let musicIndex = []
let lastScanTime = 0
const scanTtlMs = 2 * 60 * 1000

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

export async function playMusic(query) {
  await buildMusicIndex()

  const results = searchMusic(query)
  if (results.length === 0) return { success: false, message: '唔……本地没有找到这首歌，宝宝是不是还没下载呀？' }

  const song = results[0]

  return new Promise((resolve) => {
    try {
      const child = spawn(kugouExe, [song.path], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })

      child.on('error', (error) => {
        console.warn('[music] KuGou spawn failed:', error.message)
        resolve({ success: false, message: '酷狗音乐启动失败了，宝宝检查一下是不是没有安装呀？' })
      })

      child.unref()

      setTimeout(() => {
        resolve({
          success: true,
          song: song.name,
          path: song.path,
          message: '好呀，正在给你播放「' + song.name + '」～',
        })
      }, 1000)
    } catch (error) {
      console.warn('[music] play failed:', error.message)
      resolve({ success: false, message: '播放出错了，宝宝等会再试试吧。' })
    }
  })
}

export async function getRandomSong() {
  await buildMusicIndex()
  if (musicIndex.length === 0) return null
  return musicIndex[Math.floor(Math.random() * musicIndex.length)]
}
