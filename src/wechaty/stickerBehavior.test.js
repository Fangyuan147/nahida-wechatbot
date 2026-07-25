import assert from 'node:assert/strict'
import test from 'node:test'
import { isStickerFriendlyPrompt, limitReplyToChars, removeStickerMarker, shouldSendStickerForConversation } from './sendMessage.js'

test('sends a sticker for an affectionate prompt even when Kimi omits its marker', () => {
  assert.equal(isStickerFriendlyPrompt('\u62b1\u62b1\u6211'), true)
  assert.equal(shouldSendStickerForConversation('\u62b1\u62b1\u6211'), true)
})

test('does not send a sticker for an ordinary question', () => {
  assert.equal(shouldSendStickerForConversation('\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837\uff1f'), false)
})

test('removes whitespace-tolerant internal sticker markers before sending text', () => {
  assert.equal(removeStickerMarker('[[ SEND_STICKER ]]\u597d\u5440'), '\u597d\u5440')
})

test('keeps the selected reply within 50 characters at sentence boundaries', () => {
  const reply = limitReplyToChars('\u7b2c\u4e00\u53e5\u8bdd\u3002\u8fd9\u662f\u7b2c\u4e8c\u53e5\u8bdd\uff01\u8fd9\u662f\u7b2c\u4e09\u53e5\u8bdd\uff1f')
  assert.equal(reply, '\u7b2c\u4e00\u53e5\u8bdd\u3002\u8fd9\u662f\u7b2c\u4e8c\u53e5\u8bdd\uff01\u8fd9\u662f\u7b2c\u4e09\u53e5\u8bdd\uff1f')
  assert.ok(Array.from(reply).length <= 50)
})

test('bounds one malformed long sentence as a final fallback', () => {
  const reply = limitReplyToChars('\u8fd9'.repeat(60))
  assert.equal(Array.from(reply).length, 50)
  assert.equal(reply.endsWith('\u3002'), true)
})
