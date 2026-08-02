import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { clearConversationState, saveConversationState } from './conversationState.js'

function readStateInNewProcess(conversationId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      "import { getConversationState } from './src/message/conversationState.js'; process.stdout.write(JSON.stringify(getConversationState(process.argv[1])));",
      conversationId,
    ], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(stderr || 'state reader exited with code ' + code))
      else resolve(JSON.parse(stdout))
    })
  })
}

test('persists delayed messages so a new process can recover them', async () => {
  const conversationId = 'private:restart-recovery-test'
  await saveConversationState(conversationId, {
    pendingMessages: ['第一条消息', '第二条消息'],
    mode: null,
  })
  try {
    const restored = await readStateInNewProcess(conversationId)
    assert.deepEqual(restored.pendingMessages, ['第一条消息', '第二条消息'])
  } finally {
    await clearConversationState(conversationId)
  }
})
