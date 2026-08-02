import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createAtomicJsonStore({ filePath, defaultValue, currentVersion = 1, migrations = {}, validate = () => true }) {
  const backupPath = filePath + '.bak'
  let writeQueue = Promise.resolve()
  let loaded = false
  let value = cloneJson(defaultValue)

  async function parse(file) {
    return JSON.parse(await readFile(file, 'utf8'))
  }

  function normalize(rawValue) {
    let nextValue = rawValue
    let version = Number(nextValue?.version || 0)
    while (version < currentVersion) {
      const migrate = migrations[version]
      if (typeof migrate !== 'function') throw new Error('missing JSON migration for version ' + version)
      nextValue = migrate(nextValue)
      version = Number(nextValue?.version || version + 1)
    }
    if (!validate(nextValue)) throw new Error('invalid JSON data shape')
    return nextValue
  }

  async function writeAtomic(nextValue, { makeBackup = true } = {}) {
    const serialized = JSON.stringify(nextValue, null, 2) + '\n'
    const tempPath = filePath + '.tmp-' + process.pid + '-' + Date.now()
    await mkdir(path.dirname(filePath), { recursive: true })
    if (makeBackup) {
      try { await copyFile(filePath, backupPath) }
      catch (error) {
        if (error.code !== 'ENOENT') console.warn('[storage] backup refresh skipped: ' + filePath, error.message)
      }
    }
    try {
      await writeFile(tempPath, serialized, 'utf8')
      await rename(tempPath, filePath)
    } finally {
      await unlink(tempPath).catch(() => {})
    }
  }

  async function load() {
    if (loaded) return cloneJson(value)
    loaded = true
    await mkdir(path.dirname(filePath), { recursive: true })
    try {
      value = normalize(await parse(filePath))
    } catch (error) {
      if (error.code === 'ENOENT') value = cloneJson(defaultValue)
      else {
        try {
          value = normalize(await parse(backupPath))
          await writeAtomic(value, { makeBackup: false })
          console.warn('[storage] restored damaged JSON from backup: ' + filePath)
        } catch (backupError) {
          value = cloneJson(defaultValue)
          console.warn('[storage] JSON reset after primary and backup failure: ' + filePath, backupError.message)
        }
      }
    }
    return cloneJson(value)
  }

  async function save(nextValue = value) {
    const snapshot = cloneJson(nextValue)
    const write = writeQueue.catch(() => {}).then(async () => {
      await writeAtomic(snapshot)
      value = snapshot
      loaded = true
    })
    writeQueue = write
    return write
  }

  return { load, save, get value() { return cloneJson(value) } }
}
