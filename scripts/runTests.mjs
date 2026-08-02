import { mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const env = {
  ...process.env,
  BOT_STATE_DIR: await mkdtemp(path.join(os.tmpdir(), 'wechat-bot-test-state-')),
  STICKER_PACKS_DIR: await mkdtemp(path.join(os.tmpdir(), 'wechat-bot-test-stickers-')),
}
const child = spawn(process.execPath, [
  '--test',
  'src/wechaty/stickerBehavior.test.js',
  'src/search/douyin.test.js',
  'src/storage/atomicJsonStore.test.js',
  'src/message/conversationState.test.js',
  'src/wechaty/morningReminder.test.js',
  'src/wechaty/wechat4uCompatibility.test.js',
  'src/commands/musicCommand.test.js',
  'src/ai/promptBuilder.test.js',
], { env, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code || 0)))
