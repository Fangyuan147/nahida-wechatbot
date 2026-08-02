import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAtomicJsonStore } from './atomicJsonStore.js'

async function tempStore() {
  const directory = await fsTempDirectory()
  return { directory, filePath: path.join(directory, 'state.json') }
}

async function fsTempDirectory() {
  return (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(), 'wechat-bot-store-'))
}

test('migrates legacy JSON and writes the current version atomically', async () => {
  const { directory, filePath } = await tempStore()
  try {
    await writeFile(filePath, JSON.stringify({ legacy: 'value' }), 'utf8')
    const store = createAtomicJsonStore({
      filePath,
      defaultValue: { version: 1, values: {} },
      migrations: { 0: (value) => ({ version: 1, values: value }) },
      validate: (value) => value.version === 1 && typeof value.values === 'object',
    })
    assert.deepEqual(await store.load(), { version: 1, values: { legacy: 'value' } })
    await store.save({ version: 1, values: { next: true } })
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { version: 1, values: { next: true } })
    assert.equal(await readFile(filePath + '.bak', 'utf8'), JSON.stringify({ legacy: 'value' }))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('serializes concurrent saves without losing the latest snapshot', async () => {
  const { directory, filePath } = await tempStore()
  try {
    const store = createAtomicJsonStore({ filePath, defaultValue: { version: 1, value: 0 } })
    await Promise.all(Array.from({ length: 8 }, (_, value) => store.save({ version: 1, value })))
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    assert.equal(saved.value, 7)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('continues the write queue after one failed write', async () => {
  const { directory, filePath } = await tempStore()
  try {
    const store = createAtomicJsonStore({ filePath, defaultValue: { version: 1, value: 0 } })
    await mkdir(filePath)
    await assert.rejects(store.save({ version: 1, value: 1 }))
    await rm(filePath, { recursive: true, force: true })
    await store.save({ version: 1, value: 2 })
    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).value, 2)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('restores a damaged primary file from its backup', async () => {
  const { directory, filePath } = await tempStore()
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(filePath, '{ damaged', 'utf8')
    await writeFile(filePath + '.bak', JSON.stringify({ version: 1, value: 9 }), 'utf8')
    const store = createAtomicJsonStore({ filePath, defaultValue: { version: 1, value: 0 } })
    assert.deepEqual(await store.load(), { version: 1, value: 9 })
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { version: 1, value: 9 })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
