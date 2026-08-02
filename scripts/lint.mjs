import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'

async function sourceFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(fullPath))
    else if (entry.isFile() && fullPath.endsWith('.js')) files.push(fullPath)
  }
  return files
}

const files = await sourceFiles(path.resolve('src'))
for (const file of files) {
  const syntax = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (syntax.status !== 0) process.exit(syntax.status || 1)
  await readFile(file, 'utf8')
}

const wechatIndex = await readFile(path.resolve('src/wechaty/index.js'), 'utf8')
if (/api\.qrserver\.com|PuppetWechat4u\.prototype/u.test(wechatIndex)) {
  throw new Error('login flow contains an external QR endpoint or third-party prototype patch')
}
const workspaceConfig = await readFile(path.resolve('pnpm-workspace.yaml'), 'utf8')
if (/set this to true or false|allowBuilds:\s*$/mu.test(workspaceConfig) && /set this to true or false/u.test(workspaceConfig)) {
  throw new Error('pnpm build permissions must use explicit boolean values')
}
const musicSource = await readFile(path.resolve('src/music/musicPlayer.js'), 'utf8')
if (/taskkill\.exe['"]?,\s*\[['"]\/IM['"]/u.test(musicSource)) {
  throw new Error('music cleanup must terminate only the process started by the bot')
}
