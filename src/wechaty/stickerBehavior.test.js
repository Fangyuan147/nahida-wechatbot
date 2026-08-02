import assert from 'node:assert/strict'
import test from 'node:test'
import { addDelayedPrompt, createDelayedReplyCollector, createReplyDelayTimer, formatCollectedPrompts, replyDelayMs } from '../message/replyQueue.js'
import { formatMusicPlaylist, isMusicListRequest, parseMusicSelection } from '../commands/musicCommand.js'
import { getLongReplyMode, isChefRequest, isJokeRequest, isRiddleRequest, isStoryRequest } from '../ai/promptBuilder.js'
import { canReply, isBoundPrivateUser, isBoundUser } from '../security/accessPolicy.js'
import { isStickerFriendlyPrompt, limitReplyToChars, maxReplyChars, prepareReplyResult, removeInternalMessageMarkers, removeStickerMarker, shouldSendStickerForConversation } from '../ai/outputParser.js'
import { sendSticker } from '../message/messageHandler.js'
import { isActionOnlyRequest } from './actionInteraction.js'
import { getAudioDurationMs } from '../music/musicPlayer.js'
import { cancelCapture, captureTimeoutMs, consumeOneCaptureSlot, getCaptureState, setCaptureCount, startCaptureFlow } from './stickerStore.js'

test('only accepts the configured bound contact id', () => {
  const boundId = 'wxid_test_bound'
  const boundName = String.fromCodePoint(0x82cf, 0x5b50, 0x519b)
  const secondBoundName = String.fromCodePoint(0x575a, 0x6301)
  assert.equal(isBoundUser({ id: () => boundId }, [boundId]), true)
  assert.equal(isBoundUser({ name: () => boundName }, [boundId]), false)
  assert.equal(isBoundUser({ alias: () => boundName }, [boundId]), false)
  assert.equal(isBoundUser({ id: () => 'wxid_other', name: () => secondBoundName }, [boundId]), false)
})

test('does not authorize a private contact by display name', () => {
  const changedId = '@changed_after_login'
  assert.equal(isBoundPrivateUser({ id: () => changedId, name: () => '\u575a\u6301' }, []), false)
  assert.equal(canReply({ talkerId: changedId, talker: { id: () => changedId, name: () => '\u575a\u6301' }, isRoom: false }, { boundUserIds: [], boundUserNames: ['\u575a\u6301'] }), false)
})

test('does not use the private recovery name to authorize group messages', () => {
  assert.equal(canReply({ talkerId: '@changed_after_login', talker: { name: () => '\u575a\u6301' }, isRoom: true, roomId: 'room_test', mentionedBot: true }, { boundUserIds: [], boundUserNames: ['\u575a\u6301'], roomWhiteList: ['room_test'] }), false)
})

test('keeps mixed action and chat in one delayed conversation', () => {
  assert.equal(isActionOnlyRequest('\u62b1\u62b1'), true)
  assert.equal(isActionOnlyRequest('\u62b1\u62b1\uff0c\u6211\u4eca\u5929\u6709\u70b9\u96be\u8fc7'), false)
  assert.equal(isActionOnlyRequest('\u6478\u6478\u5934\uff0c\u7136\u540e\u8ddf\u6211\u804a\u5929'), false)
})


test('sends a sticker for an affectionate prompt even when Kimi omits its marker', () => {
  assert.equal(isStickerFriendlyPrompt('\u62b1\u62b1\u6211'), true)
  assert.equal(shouldSendStickerForConversation('\u62b1\u62b1\u6211'), true)
})

test('does not send a sticker just because Kimi labels ordinary chat with an emotion', () => {
  const result = prepareReplyResult('\u666e\u901a\u56de\u7b54[[affectionate]]', '\u4f60\u5728\u5e72\u561b\u5440')
  assert.equal(result.shouldSendSticker, false)
  assert.equal(result.emotion, 'affectionate')
  assert.equal(result.reply, '\u666e\u901a\u56de\u7b54')
})

test('requires an explicit sticker or interaction intent', () => {
  assert.equal(shouldSendStickerForConversation('\u4eca\u5929\u5f88\u53ef\u7231'), false)
  assert.equal(shouldSendStickerForConversation('\u6211\u5f88\u60f3\u4f60'), false)
  assert.equal(shouldSendStickerForConversation('\u62b1\u62b1\u6211'), true)
  assert.equal(shouldSendStickerForConversation('\u6765\uff0c\u628a\u4f60\u7684\u5934\u8db4\u6211\u817f\u4e0a'), true)
  assert.equal(shouldSendStickerForConversation('\u53d1\u4e2a\u8868\u60c5\u5305'), true)
})

test('requires the bound contact, room, and mention for group replies', () => {
  const base = { talkerId: 'wxid_test_bound', roomId: 'room_test', isRoom: true }
  assert.equal(canReply({ ...base, mentionedBot: true }, { boundUserIds: ['wxid_test_bound'], roomWhiteList: ['room_test'] }), true)
  assert.equal(canReply({ ...base, mentionedBot: false }, { boundUserIds: ['wxid_test_bound'], roomWhiteList: ['room_test'] }), false)
  assert.equal(canReply({ ...base, mentionedBot: true, roomId: 'room_other' }, { boundUserIds: ['wxid_test_bound'], roomWhiteList: ['room_test'] }), false)
  assert.equal(canReply({ ...base, mentionedBot: true, talkerId: 'wxid_other' }, { boundUserIds: ['wxid_test_bound'], roomWhiteList: ['room_test'] }), false)
})

test('does not send a sticker for an ordinary question', () => {
  assert.equal(shouldSendStickerForConversation('\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837\uff1f'), false)
})

test('removes whitespace-tolerant internal sticker markers before sending text', () => {
  assert.equal(removeStickerMarker('[[ SEND_STICKER ]]\u597d\u5440'), '\u597d\u5440')
  assert.equal(removeStickerMarker('[SEND_STICKER]\u597d\u5440'), '\u597d\u5440')
  assert.equal(removeStickerMarker('\u597d\u5440 [ SEND_STICKER ]'), '\u597d\u5440')
})

test('removes bare emotion markers and turns them into a stored sticker action', () => {
  const result = prepareReplyResult('\u62b1\u62b1~[[affectionate]]', '\u62b1\u62b1\u6211')
  assert.equal(result.emotion, 'affectionate')
  assert.equal(result.shouldSendSticker, true)
  assert.equal(result.reply, '\u62b1\u62b1~')
  assert.equal(result.reply.includes('affectionate'), false)
})

test('keeps the selected reply within 30 characters at sentence boundaries', () => {
  assert.equal(maxReplyChars, 30)
  const reply = limitReplyToChars('\u7b2c\u4e00\u53e5\u8be6\u7ec6\u8bf4\u660e\u4e86\u8fd9\u4e2a\u89c6\u9891\u7684\u6700\u91cd\u8981\u5185\u5bb9\u548c\u4e3b\u9898\u3002\u7b2c\u4e8c\u53e5\u8fd8\u6709\u66f4\u591a\u7ec6\u8282\u4fe1\u606f\uff01')
  assert.ok(Array.from(reply).length <= 30)
  assert.equal(reply.endsWith('\u3002') || reply.endsWith('\uff01') || reply.endsWith('\uff1f'), true)
})

test('bounds one malformed long sentence as a final fallback', () => {
  const reply = limitReplyToChars('\u8fd9'.repeat(60))
  assert.equal(Array.from(reply).length, 30)
  assert.equal(reply.endsWith('\u3002'), true)
})

test('sends a stored sticker file through the target message API', async () => {
  const sticker = { toFile: async () => {} }
  const sent = []
  const ok = await sendSticker({ say: async (value) => sent.push(value) }, sticker)
  assert.equal(ok, true)
  assert.equal(sent.length, 1)
  assert.equal(typeof sent[0].toFile, 'function')
})

test('processes a Douyin-style Kimi result with 30 characters and a sticker', () => {
  const result = prepareReplyResult('[[EMOTION:happy]]\u89c6\u9891\u91cc\u662f\u4e00\u4e2a\u53ef\u7231\u7684\u89d2\u8272\uff0c\u6b63\u5728\u505a\u6709\u8da3\u7684\u52a8\u4f5c\u3002[SEND_STICKER]', '抖音视频', { allowModelSticker: true })
  assert.equal(result.emotion, 'happy')
  assert.equal(result.shouldSendSticker, true)
  assert.equal(result.reply.includes('SEND_STICKER'), false)
  assert.ok(Array.from(result.reply).length <= 30)
})

test('does not send a model marker as a sticker during ordinary chat', () => {
  const result = prepareReplyResult('普通回答。[SEND_STICKER]', '\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837\uff1f')
  assert.equal(result.shouldSendSticker, false)
  assert.equal(result.reply.includes('SEND_STICKER'), false)
})

test('recognizes story requests and preserves a complete story beyond 30 characters', () => {
  assert.equal(isStoryRequest('宝宝，给我讲一个故事吧'), true)
  assert.equal(isStoryRequest('我想听故事'), true)
  assert.equal(isStoryRequest('今天天气怎么样？'), false)

  const story = '从前有一棵小树，它一直害怕冬天。后来它学会把落叶送给土地，春天终于长出了新芽，森林也重新热闹起来。'
  const result = prepareReplyResult(story, '给我讲一个故事', { allowLongReply: true })
  assert.equal(result.reply, story)
  assert.ok(Array.from(result.reply).length > maxReplyChars)
})

test('recognizes chef requests as complete long replies without matching ordinary chat', () => {
  assert.equal(isChefRequest('\u600e\u4e48\u505a\u5bab\u4fdd\u9e21\u4e01'), true)
  assert.equal(isChefRequest('\u7ed9\u6211\u4e00\u4efd\u86b9\u869f\u9762\u7684\u83dc\u8c31'), true)
  assert.equal(isChefRequest('\u6559\u6211\u505a\u756a\u8304\u7092\u86cb'), true)
  assert.equal(isChefRequest('\u4f60\u505a\u5f97\u5f88\u597d'), false)
  assert.equal(getLongReplyMode('\u600e\u4e48\u505a\u7ea2\u70e7\u8089'), 'chef')
})

test('recognizes riddle and joke requests as long replies', () => {
  assert.equal(isRiddleRequest('宝宝，给我猜个谜语'), true)
  assert.equal(isRiddleRequest('来一道脑筋急转弯'), true)
  assert.equal(isJokeRequest('讲个笑话给我听'), true)
  assert.equal(isJokeRequest('今天天气怎么样？'), false)
  assert.equal(getLongReplyMode('我想听一个故事'), 'story')
  assert.equal(getLongReplyMode('猜一个谜语吧'), 'riddle')
  assert.equal(getLongReplyMode('来个笑话'), 'joke')
  assert.equal(getLongReplyMode('你在干嘛？'), null)

  const longJoke = '小明去问老师为什么作业这么多，老师说因为知识不能只吃一口，结果小明决定先把书包吃掉。'
  const result = prepareReplyResult(longJoke, '讲个笑话', { allowLongReply: true })
  assert.equal(result.reply, longJoke)
  assert.ok(Array.from(result.reply).length > maxReplyChars)
})

test('does not expose internal message numbering to Kimi or the user', () => {
  const collected = formatCollectedPrompts(['\u7eb3\u5b9d\u7eb3\u5b9d', '\u4f60\u597d\u53ef\u7231'])
  assert.equal(collected, '\u7eb3\u5b9d\u7eb3\u5b9d\n\u4f60\u597d\u53ef\u7231')
  assert.equal(removeInternalMessageMarkers('\u6d88\u606f1\uff1a\u5b9d\u5b9d\u597d\u5440\uff01'), '\u5b9d\u5b9d\u597d\u5440\uff01')
  const result = prepareReplyResult('\u6d88\u606f1\uff1a\u5b9d\u5b9d\u597d\u5440\uff01', '\u4f60\u597d')
  assert.equal(result.reply.includes('\u6d88\u606f1'), false)
})

test('numbers collected messages and preserves their order', () => {
  const state = addDelayedPrompt(addDelayedPrompt({ prompts: [] }, '\u7b2c\u4e00\u6761'), '\u7b2c\u4e8c\u6761')
  assert.deepEqual(state.prompts, ['\u7b2c\u4e00\u6761', '\u7b2c\u4e8c\u6761'])
  assert.equal(formatCollectedPrompts(state.prompts), '\u7b2c\u4e00\u6761\n\u7b2c\u4e8c\u6761')
})

test('increments the internal marker for every message without adding labels to Kimi text', () => {
  const collector = createDelayedReplyCollector(async () => {}, () => {}, 50)
  collector.add('第一条')
  assert.equal(collector.getMarkerCount(), 1)
  collector.add('第二条')
  assert.equal(collector.getMarkerCount(), 2)
  assert.equal(formatCollectedPrompts(['第一条', '第二条']), '第一条\n第二条')
  collector.cancel()
})

test('uses a 5-second delay and resets from the latest message', async () => {
  assert.equal(replyDelayMs, 5000)
  const elapsed = []
  const startedAt = Date.now()
  const timer = createReplyDelayTimer(() => elapsed.push(Date.now()), 35)
  timer.restart()
  await new Promise((resolve) => setTimeout(resolve, 15))
  timer.restart()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(elapsed.length, 0)
  await new Promise((resolve) => setTimeout(resolve, 35))
  assert.equal(elapsed.length, 1)
  assert.ok(elapsed[0] - startedAt >= 35)
  timer.cancel()
})

test('merges three messages into one delayed reply batch', async () => {
  const batches = []
  const collector = createDelayedReplyCollector(async (batch) => {
    batches.push(batch)
    await new Promise((resolve) => setTimeout(resolve, 15))
  }, () => {}, 25)
  collector.add('第一条')
  await new Promise((resolve) => setTimeout(resolve, 8))
  collector.add('第二条')
  await new Promise((resolve) => setTimeout(resolve, 8))
  collector.add('第三条')
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.deepEqual(batches, [['第一条', '第二条', '第三条']])
  assert.equal(collector.getPendingCount(), 0)
  collector.cancel()
})

test('sends one merged prompt to the Kimi boundary and clears markers after reply', async () => {
  const kimiPrompts = []
  const collector = createDelayedReplyCollector(async (batch, _marker, isCurrent) => {
    kimiPrompts.push(formatCollectedPrompts(batch))
    return isCurrent()
  }, () => {}, 15)

  collector.add('用户第一条')
  await new Promise((resolve) => setTimeout(resolve, 5))
  collector.add('用户第二条')
  await new Promise((resolve) => setTimeout(resolve, 5))
  collector.add('用户第三条')
  await new Promise((resolve) => setTimeout(resolve, 35))

  assert.deepEqual(kimiPrompts, ['用户第一条\n用户第二条\n用户第三条'])
  assert.equal(collector.getMarkerCount(), 0)
  assert.equal(collector.getPendingCount(), 0)
  collector.cancel()
})

test('requeues a stale batch when a new message arrives during processing', async () => {
  const batches = []
  const batchVersions = []
  let firstBatchStarted
  const firstBatchReady = new Promise((resolve) => { firstBatchStarted = resolve })
  const collector = createDelayedReplyCollector(async (batch, version, isCurrent) => {
    batches.push(batch)
    batchVersions.push(version)
    if (batches.length === 1) {
      firstBatchStarted()
      await new Promise((resolve) => setTimeout(resolve, 25))
      return isCurrent()
    }
    return isCurrent()
  }, () => {}, 10)

  collector.add('旧消息')
  await firstBatchReady
  collector.add('新消息')
  await new Promise((resolve) => setTimeout(resolve, 70))

  assert.deepEqual(batches, [['旧消息'], ['旧消息', '新消息']])
  assert.deepEqual(batchVersions, [1, 2])
  assert.equal(collector.getPendingCount(), 0)
  assert.equal(collector.getVersion(), 0)
  collector.cancel()
})

test('resets the message marker after a completed reply', async () => {
  const batches = []
  const collector = createDelayedReplyCollector(async (batch) => {
    batches.push(batch)
  }, () => {}, 10)

  collector.add('第一轮消息')
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(collector.getVersion(), 0)

  collector.add('下一轮消息')
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.deepEqual(batches, [['第一轮消息'], ['下一轮消息']])
  assert.equal(collector.getVersion(), 0)
  collector.cancel()
})

test('closes sticker capture after one minute without a sticker', async () => {
  assert.equal(captureTimeoutMs, 60000)
  const conversationId = 'capture-timeout-test'
  startCaptureFlow(conversationId, 35)
  assert.equal(getCaptureState(conversationId), 'asking_count')
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(getCaptureState(conversationId), null)
})

test('resets the capture timeout after each successfully received sticker', async () => {
  const conversationId = 'capture-reset-test'
  setCaptureCount(conversationId, 2, 35)
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(consumeOneCaptureSlot(conversationId), 2)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.notEqual(getCaptureState(conversationId), null)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(getCaptureState(conversationId), null)
  cancelCapture(conversationId)
})

test('recognizes music list requests and preserves the full playlist', () => {
  const songs = [
    { name: '\u6b4c\u66f21' },
    { name: '\u6b4c\u66f22' },
  ]
  assert.equal(isMusicListRequest('\u6709\u4ec0\u4e48\u6b4c\u53ef\u4ee5\u542c'), true)
  assert.equal(formatMusicPlaylist(songs), '\u5b9d\u5b9d\uff0c\u8fd9\u4e9b\u6b4c\u53ef\u4ee5\u542c\u54e6\uff5e\u56de\u590d\u5e8f\u53f7\u5c31\u64ad\u653e\uff1a\n1. \u6b4c\u66f21\n2. \u6b4c\u66f22')
})

test('plays the selected song by plain number or play-number wording', () => {
  const songs = [{ name: '\u6b4c\u66f21' }, { name: '\u6b4c\u66f22' }]
  assert.equal(parseMusicSelection('2', songs), songs[1])
  assert.equal(parseMusicSelection('\u64ad\u653e\u7b2c1\u9996', songs), songs[0])
  assert.equal(parseMusicSelection('3', songs), null)
})

test('reads FLAC duration without relying on a local KuGou download', async () => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const os = await import('node:os')
  const path = await import('node:path')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wechat-bot-flac-'))
  const filePath = path.join(directory, 'fixture.flac')
  const header = Buffer.alloc(42)
  header.write('fLaC', 0, 'ascii')
  header[4] = 0
  header[5] = 0
  header[6] = 0
  header[7] = 34
  const sampleRate = 44100
  const totalSamples = 44100
  header[18] = sampleRate >> 12
  header[19] = sampleRate >> 4
  header[20] = (sampleRate & 0x0f) << 4
  header[21] = (totalSamples / 0x100000000) & 0x0f
  header[22] = totalSamples >> 24
  header[23] = totalSamples >> 16
  header[24] = totalSamples >> 8
  header[25] = totalSamples
  await writeFile(filePath, header)
  const durationMs = await getAudioDurationMs(filePath)
  assert.ok(durationMs > 0)
  await rm(directory, { recursive: true, force: true })
})
