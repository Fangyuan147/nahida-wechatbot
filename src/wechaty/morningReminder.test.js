import assert from 'node:assert/strict'
import test from 'node:test'

test('loads a contact before sending reminder text', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./morningReminder.js', import.meta.url), 'utf8')
  assert.match(source, /const contact = await bot\.Contact\.load\(id\)/u)
  assert.doesNotMatch(source, /await bot\.Contact\.load\(id\)\.say/u)
})

test('does not replay a missed morning reminder when the bot restarts', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('./morningReminder.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /if \(parts\.hour >= 11 && parts\.hour < 24\) await sendMorningMessage\(bot\)/u)
  assert.match(source, /scheduleNext\(bot\)\s*\n\s*scheduleInactivityCheck\(bot\)/u)
})
