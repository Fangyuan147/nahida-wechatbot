import assert from 'node:assert/strict'
import test from 'node:test'
import { formatProcessError, isRecoverableWechat4uError } from './wechat4uCompatibility.js'

test('recognizes legacy WeChat4u assertion and contact lookup errors', () => {
  assert.equal(isRecoverableWechat4uError(new Error("assert ('1101' == 0)")), true)
  assert.equal(isRecoverableWechat4uError(new Error("assert ('1102' == 0)")), true)
  assert.equal(isRecoverableWechat4uError(new Error("assert ('-1' == 0)")), true)
  assert.equal(isRecoverableWechat4uError(new Error('batchGetContact failed')), true)
})

test('does not classify unrelated failures as recoverable', () => {
  const error = new Error('Kimi request failed')
  assert.equal(isRecoverableWechat4uError(error), false)
  assert.match(formatProcessError(error), /^Kimi request failed/u)
})
