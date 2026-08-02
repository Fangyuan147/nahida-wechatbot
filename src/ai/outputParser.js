import { extractEmotion, inferEmotionFromConversation, removeEmotionMarkers } from '../wechaty/actionInteraction.js'

export const maxReplyChars = 30
const stickerMarker = /(?:\[\[\s*SEND_STICKER\s*\]\]|\[\s*SEND_STICKER\s*\]|【\s*SEND_STICKER\s*】)/iu
const stickerCleanup = /(?:\[\[\s*SEND_STICKER\s*\]\]|\[\s*SEND_STICKER\s*\]|【\s*SEND_STICKER\s*】)/giu
const messageMarker = /(?:\u6d88\u606f|\u4fe1\u606f)\s*\d+\s*[\uff1a:罕]/giu
// Keep sticker sends opt-in: emotion words alone describe the conversation, not a request for an image.
const stickerPrompt = /(?:\u8868\u60c5\u5305|\u8868\u60c5|\u56fe\u7247|\u7167\u7247|\u53d1\u4e2a\u56fe|\u6765\u4e2a\u56fe|\u53d1\u5f20\u56fe|\u53d1\u56fe\u7247|\u53d1\u7167\u7247)|(?:\u6492\u5a07|\u5356\u840c|\u4eb2\u4eb2|\u4eb2\u4e00\u4e2a|\u62b1\u62b1|\u62b1\u4e00\u4e2a|\u8d34\u8d34|\u8e6d\u8e6d|\u6478\u6478\u5934|\u6478\u5934|\u628a[^\u3002\uff01\uff1f!?]{0,8}\u5934[^\u3002\uff01\uff1f!?]{0,8}(?:\u8db4|\u9760)|\u8db4\u5728\u6211\u817f\u4e0a|\u9760\u5728\u6211\u6000\u91cc|\u94bb\u8fdb\u6211\u6000\u91cc|\u54c4\u6211|\u5b89\u6170\u6211)/u
export function isStickerFriendlyPrompt(prompt) { return stickerPrompt.test(String(prompt)) }
export function shouldSendStickerForConversation(prompt) { return isStickerFriendlyPrompt(prompt) }
export function removeStickerMarker(text = '') { return String(text).replace(stickerCleanup, '').trim() }
export function removeInternalMessageMarkers(text = '') { return String(text).replace(messageMarker, '').trim() }
export function splitReplyIntoMessages(reply = '') {
  const normalized = String(reply).replace(/\s+/gu, ' ').trim()
  if (!normalized) return []
  const sentences = []
  let current = ''
  for (const character of Array.from(normalized)) {
    current += character
    if ('\u3002\uff01\uff1f'.includes(character)) { sentences.push(current.trim()); current = '' }
  }
  if (current.trim()) sentences.push(current.trim())
  return sentences.flatMap((sentence) => {
    const chars = Array.from(sentence)
    const chunks = []
    for (let offset = 0; offset < chars.length; offset += maxReplyChars) chunks.push(chars.slice(offset, offset + maxReplyChars).join(''))
    return chunks.filter(Boolean)
  })
}
export function limitReplyToChars(reply = '', limit = maxReplyChars) {
  const normalized = String(reply).replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  const sentences = normalized.match(/[^\u3002\uff01\uff1f!?]+[\u3002\uff01\uff1f!?]?/gu) || [normalized]
  let selected = ''
  for (const sentence of sentences) {
    const candidate = selected + sentence.trim()
    if (Array.from(candidate).length <= limit) selected = candidate
    else break
  }
  if (selected) return selected.trim()
  const chars = Array.from(normalized)
  if (limit <= 1) return chars.slice(0, limit).join('')
  return chars.slice(0, limit - 1).join('') + '\u3002'
}

function cleanStickerReply(reply, shouldSendSticker) {
  if (!shouldSendSticker) return reply
  const unavailablePattern = /(不能|无法|没法|发不了|暂时发不出|还不能|只能想象)[^。！？!?\n]{0,30}(发送|发出|发个|表情包|图片)/u
  return unavailablePattern.test(reply) ? '好呀，给你一张。' : reply
}
export function prepareReplyResult(result = '', prompt = '', { allowModelSticker = false, allowLongReply = false } = {}) {
  const modelResult = String(result)
  const modelRequestedSticker = stickerMarker.test(modelResult)
  const shouldSendSticker = shouldSendStickerForConversation(prompt)
    || (allowModelSticker && modelRequestedSticker)
  const emotion = inferEmotionFromConversation(prompt) || extractEmotion(modelResult) || (shouldSendSticker ? 'affectionate' : null)
  const plainResult = removeEmotionMarkers(removeInternalMessageMarkers(removeStickerMarker(modelResult)))
  const replyText = cleanStickerReply(plainResult, shouldSendSticker)
  const reply = allowLongReply
    ? (replyText || (shouldSendSticker ? '好呀，给你。' : ''))
    : limitReplyToChars(replyText || (shouldSendSticker ? '好呀，给你。' : ''))
  return { emotion, modelRequestedSticker, shouldSendSticker, reply }
}
