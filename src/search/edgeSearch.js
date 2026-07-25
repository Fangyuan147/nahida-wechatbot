import { spawn } from 'node:child_process'
import { mkdir, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const cacheDir = path.join(os.tmpdir(), 'nahida-edge-search')

async function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ]
  for (const candidate of candidates) {
    try { const { stat } = await import('node:fs/promises'); await stat(candidate); return candidate } catch (error) { /* not found */ }
  }
  return 'msedge'
}

export async function searchWithEdge(query) {
  const edgePath = await findEdge()
  await mkdir(cacheDir, { recursive: true })
  const userDataDir = path.join(cacheDir, 'profile_' + Date.now())

  const encodedQuery = encodeURIComponent(String(query).trim())
  const searchUrl = 'https://www.bing.com/search?q=' + encodedQuery + '&setlang=zh-cn'

  return new Promise((resolve, reject) => {
    const child = spawn(edgePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--user-data-dir=' + userDataDir,
      '--dump-dom',
      searchUrl,
    ], { timeout: 15000, windowsHide: true })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('close', async (code) => {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {})

      if (code !== 0) {
        console.warn('[search] Edge exited with code ' + code)
        return resolve('')
      }

      const results = []
      const snippetRegex = /<li[^>]*class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
      let match
      while ((match = snippetRegex.exec(stdout)) !== null && results.length < 5) {
        const title = match[2].replace(/<[^>]+>/g, '').trim()
        const snippet = match[3].replace(/<[^>]+>/g, '').trim()
        if (title && snippet) results.push(title + ': ' + snippet)
      }

      if (results.length === 0) {
        const altRegex = /<p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/gi
        let altMatch
        while ((altMatch = altRegex.exec(stdout)) !== null && results.length < 5) {
          const text = altMatch[1].replace(/<[^>]+>/g, '').trim()
          if (text && text.length > 20) results.push('搜索摘要: ' + text)
        }
      }

      resolve(results.join('\n').slice(0, 3000))
    })

    child.on('error', (error) => {
      console.warn('[search] Edge spawn failed:', error.message)
      resolve('')
    })
  })
}
