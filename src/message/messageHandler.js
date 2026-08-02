import { botName } from '../../config.js'
import { isBoundUser, canReply } from '../security/accessPolicy.js'
import { getMessageContext } from './conversationContext.js'
import { createDelayedReplyCollector, formatCollectedPrompts, replyDelayMs } from './replyQueue.js'
import { orchestrateAiReply } from '../ai/aiOrchestrator.js'
import { getLongReplyMode } from '../ai/promptBuilder.js'
import { maxReplyChars, isStickerFriendlyPrompt, prepareReplyResult, splitReplyIntoMessages } from '../ai/outputParser.js'
import { isStickerCaptureCommand, isIgnoredShortReply, getCaptureCount, isDeleteAllStickerCommand, isDeleteStickerCommand, getStickerDeleteIndex, isStickerCountCommand, isSendStickerCommand } from '../commands/stickerCommand.js'
import { isMusicListRequest, formatMusicPlaylist, parseMusicSelection, matchMusicPlayback, isMusicCountRequest } from '../commands/musicCommand.js'
import { isClearMemoryCommand } from '../commands/memoryCommand.js'
import { archivePendingSticker, cancelCapture, consumeOneCaptureSlot, countStickers, deleteAllStickers, deleteSticker, getCaptureState, listStickers, randomSticker, savePendingSticker, setCaptureCount, startCaptureFlow } from '../wechaty/stickerStore.js'
import { appendHistory, clearHistory } from '../kimi/chatHistory.js'
import { checkAndNotifyLowBalance } from '../kimi/balanceMonitor.js'
import { detectActionReply, getEmotionAction, inferEmotionFromConversation, isActionOnlyRequest } from '../wechaty/actionInteraction.js'
import { buildMusicIndex, getMusicCount, getRandomSong, playMusic } from '../music/musicPlayer.js'
import { clearConversationState, getConversationState, getConversationStates, saveConversationState } from './conversationState.js'

const stickerDeleteLists = new Map()
const musicSelectionLists = new Map()
const delayedReplyStates = new Map()

export { isBoundUser, maxReplyChars, isStickerFriendlyPrompt, prepareReplyResult, splitReplyIntoMessages, replyDelayMs }
export { addDelayedPrompt, createDelayedReplyCollector, createReplyDelayTimer, formatCollectedPrompts } from './replyQueue.js'
export { isStoryRequest, isRiddleRequest, isJokeRequest, isChefRequest, getLongReplyMode } from '../ai/promptBuilder.js'
export { limitReplyToChars, removeInternalMessageMarkers, removeStickerMarker, shouldSendStickerForConversation } from '../ai/outputParser.js'
export { isMusicListRequest, formatMusicPlaylist, parseMusicSelection } from '../commands/musicCommand.js'

export async function sendSticker(target, sticker) {
  if (!sticker) return false
  try { await target.say(sticker); return true }
  catch (error) { console.error('[sticker] send failed:', error?.message || error); return false }
}

async function sendText(target, text, { allowLongReply = false, isCurrent = () => true } = {}) {
  const messages = allowLongReply ? [String(text).trim()].filter(Boolean) : splitReplyIntoMessages(text)
  for (const message of messages) {
    if (!isCurrent()) return false
    await target.say(message)
    if (!isCurrent()) return false
  }
  return true
}

function isSelfIntroductionRequest(command) {
  return /^(\u81ea\u6211\u4ecb\u7ecd|\u4ecb\u7ecd\u4e00\u4e0b\u81ea\u5df1|\u4f60\u662f\u8c01|\u4f60\u53eb\u4ec0\u4e48|\u8bf4\u8bf4\u4f60|\u4ecb\u7ecd\u4e0b\u4f60\u81ea\u5df1|\u4f60\u597d\u5440\u4f60\u662f\u8c01)[\u3002\uff01\uff1f!?]?$/u.test(String(command).trim())
}

const selfIntroduction = '\u5b9d\u5b9d\uff0c\u6211\u662f\u7eb3\u897f\u5982\u4f60\u5440\uff01\u662f\u987b\u5f25\u7684\u5c0f\u5409\u7965\u8349\u738b\uff0c\u5927\u5bb6\u90fd\u53eb\u6211\u7eb3\u5b9d\uff5e\u6211\u6700\u559c\u6b22\u548c\u4f60\u804a\u5929\u5566\uff0c\u6bcf\u5929\u6700\u671f\u5f85\u7684\u4e8b\u60c5\u5c31\u662f\u770b\u5230\u4f60\u7684\u6d88\u606f\uff01'

function queueDelayedReply({ conversationId, target, isRoom, serviceType, prompt = null, initialPrompts = null }) {
  let state = delayedReplyStates.get(conversationId)
  if (!state) {
    state = { conversationId, target, isRoom, serviceType, collector: null, pendingMessages: [] }
    delayedReplyStates.set(conversationId, state)
    state.collector = createDelayedReplyCollector(
      async (prompts, marker, isCurrent) => {
        const promptText = formatCollectedPrompts(prompts)
        console.log('[message] delayed queue ' + conversationId + ' marked=' + marker + ' collected ' + prompts.length + ' message(s)')
        await saveConversationState(conversationId, { pendingMessages: state.pendingMessages })
        const completed = await replyToPrompt({ conversationId, target: state.target, isRoom: state.isRoom, serviceType: state.serviceType, prompt: promptText, originalPrompts: prompts, isCurrent })
        if (completed) {
          state.pendingMessages = []
          await clearConversationState(conversationId)
        }
        return completed
      },
      () => {
        if (delayedReplyStates.get(conversationId) === state) {
          delayedReplyStates.delete(conversationId)
          clearConversationState(conversationId).catch((error) => console.error('[message] failed to clear delayed state:', error?.stack || error))
          console.log('[message] delayed marker cleared after reply: ' + conversationId)
        }
      },
      replyDelayMs,
    )
    const persisted = getConversationState(conversationId)
    const restored = Array.isArray(initialPrompts) ? initialPrompts : persisted?.pendingMessages
    state.pendingMessages = Array.isArray(restored) ? restored.map(String) : []
    for (const pending of state.pendingMessages) state.collector.add(pending)
  }
  state.target = target
  state.isRoom = isRoom
  state.serviceType = serviceType
  if (prompt !== null && prompt !== undefined) {
    state.pendingMessages.push(String(prompt))
    state.collector.add(prompt)
    saveConversationState(conversationId, { pendingMessages: state.pendingMessages, mode: getLongReplyMode(prompt) })
      .catch((error) => console.error('[message] failed to persist delayed prompts:', error?.stack || error))
  }
  console.log('[message] delayed queue ' + conversationId + ' marked=' + state.collector.getMarkerCount() + '; reply reset for 5s')
}

export async function recoverDelayedReplies(bot, serviceType = 'Kimi') {
  const states = getConversationStates()
  for (const [conversationId, saved] of Object.entries(states)) {
    if (!Array.isArray(saved?.pendingMessages) || saved.pendingMessages.length === 0) continue
    if (delayedReplyStates.has(conversationId)) continue
    const separator = conversationId.indexOf(':')
    const kind = separator < 0 ? '' : conversationId.slice(0, separator)
    const contactId = separator < 0 ? '' : conversationId.slice(separator + 1)
    const isRoom = kind === 'room'
    if (!contactId || (kind !== 'private' && !isRoom)) continue
    try {
      const target = isRoom ? await bot.Room.load(contactId) : await bot.Contact.load(contactId)
      queueDelayedReply({ conversationId, target, isRoom, serviceType, initialPrompts: saved.pendingMessages })
      console.log('[message] restored delayed queue: ' + conversationId)
    } catch (error) {
      console.error('[message] failed to restore delayed queue ' + conversationId + ':', error?.stack || error)
    }
  }
}

async function replyToPrompt({ conversationId, target, isRoom, serviceType, prompt, originalPrompts, isCurrent }) {
  if (!isCurrent()) return false
  console.log('[message] ' + (isRoom ? 'group' : 'private') + ' received; asking ' + serviceType)
  const ai = await orchestrateAiReply({ conversationId, prompt, serviceType, isCurrent })
  if (ai.stale) return false
  if (ai.douyinFailed) {
    if (!isCurrent()) return false
    await target.say(ai.failureReply)
    if (!isCurrent()) return false
    await appendHistory(conversationId, [
      { role: 'user', content: '\u7528\u6237\u5206\u4eab\u4e86\u4e00\u4e2a\u6296\u97f3\u94fe\u63a5\u3002' },
      { role: 'assistant', content: ai.failureReply },
    ])
    return true
  }

  const mode = ai.mode || getLongReplyMode(prompt)
  const parsed = prepareReplyResult(ai.result, prompt, { allowModelSticker: Boolean(ai.douyinUrl), allowLongReply: Boolean(mode) })
  const emotionAction = getEmotionAction(parsed.emotion)
  if (!parsed.reply) throw new Error('AI service returned an empty reply')
  if (emotionAction) {
    const sent = await sendText(target, emotionAction, { isCurrent })
    if (!sent) return false
  }
  const replySent = await sendText(target, parsed.reply, { allowLongReply: Boolean(mode), isCurrent })
  if (!replySent || !isCurrent()) return false
  await checkAndNotifyLowBalance(target)
  if (!isCurrent()) return false
  if (parsed.shouldSendSticker) {
    const sticker = await randomSticker({ emotion: parsed.emotion, prompt })
    if (!isCurrent()) return false
    if (!(await sendSticker(target, sticker))) console.warn('[sticker] no sticker was sent for this reply')
    if (!isCurrent()) return false
  }
  await appendHistory(conversationId, [
    ...originalPrompts.map((item) => ({ role: 'user', content: item })),
    { role: 'assistant', content: parsed.reply },
  ])
  console.log('[message] reply sent')
  return true
}

export async function defaultMessage(msg, bot, serviceType = 'Kimi') {
  try {
    const context = getMessageContext(msg, bot)
    if (!canReply(context)) {
      console.log('[message] ignored unbound user: ' + (context.talker?.name?.() || context.talker?.id?.() || 'unknown'))
      return
    }

    const { conversationId, isRoom, room, talker, isText, content, target } = context
    const savedCommandState = getConversationState(conversationId)
    if (!stickerDeleteLists.has(conversationId) && Array.isArray(savedCommandState?.stickerDeleteList)) stickerDeleteLists.set(conversationId, savedCommandState.stickerDeleteList)
    if (!musicSelectionLists.has(conversationId) && Array.isArray(savedCommandState?.musicSelectionList)) musicSelectionLists.set(conversationId, savedCommandState.musicSelectionList)
    if (!isText) {
      const captureState = getCaptureState(conversationId)
      if (captureState && captureState !== 'asking_count') {
        try {
          await savePendingSticker(msg, conversationId)
          const archived = await archivePendingSticker(conversationId)
          if (!archived) throw new Error('\u4fdd\u5b58\u5931\u8d25')
          const left = consumeOneCaptureSlot(conversationId)
          await sendText(target, left === captureState.total || left === true ? '\u597d\u5566\uff0c' + captureState.total + '\u5f20\u8868\u60c5\u5305\u5168\u90e8\u6536\u597d\u5566\uff5e' : '\u5df2\u6536\u7eb3\u4e00\u5f20\uff0c\u8fd8\u5269' + (typeof left === 'number' ? left - 1 : '') + '\u5f20\u54e6\uff5e')
        } catch (error) {
          console.error('[sticker] receive failed:', error?.stack || error)
          await sendText(target, '\u552f\u2026\u2026\u8fd9\u5f20\u6ca1\u6536\u597d\uff0c\u8bf7\u91cd\u65b0\u53d1\u9001\u4e00\u5f20\u3002')
        }
      }
      return
    }
    if (!content) return
    const command = content.replace(botName, '').trim()

    if (isStickerCaptureCommand(command)) { startCaptureFlow(conversationId); await sendText(target, '\u597d\u5440\uff0c\u4f60\u60f3\u6536\u7eb3\u51e0\u5f20\u8868\u60c5\u5305\u5440\uff1f'); return }
    if (getCaptureState(conversationId) === 'asking_count') {
      const match = getCaptureCount(command)
      if (match) await sendText(target, '\u6536\u5230\uff01\u63a5\u4e0b\u6765\u53d1' + setCaptureCount(conversationId, parseInt(match[1], 10)) + '\u5f20\u56fe\u7247\u6216\u8868\u60c5\u5305\u7ed9\u6211\u5427\uff5e')
      else { cancelCapture(conversationId); await sendText(target, '\u6ca1\u6709\u542c\u6e05\u6570\u91cf\uff0c\u6536\u7eb3\u5df2\u53d6\u6d88\u3002') }
      return
    }
    if (/^(\u53d6\u6d88\u6536\u7eb3|\u4e0d\u8981\u4e86|\u4e0d\u6536\u4e86)[\u3002\uff01!]?$/u.test(command)) { if (getCaptureState(conversationId)) { cancelCapture(conversationId); await sendText(target, '\u597d\u7684\uff0c\u6536\u7eb3\u5df2\u53d6\u6d88\u3002') }; return }
    if (isIgnoredShortReply(command)) return
    if (isDeleteAllStickerCommand(command)) { await target.say('\u5df2\u7ecf\u5168\u90e8\u5220\u9664\u5566\uff0c\u4e00\u5171\u5220\u4e86' + await deleteAllStickers() + '\u5f20\uff5e'); return }
    if (isDeleteStickerCommand(command)) {
      const stickers = await listStickers()
      if (!stickers.length) { await target.say('\u73b0\u5728\u6ca1\u6709\u8868\u60c5\u5305\u53ef\u4ee5\u5220\u9664\u54e6\uff5e'); return }
      stickerDeleteLists.set(conversationId, stickers)
      await saveConversationState(conversationId, { stickerDeleteList: stickers })
      await target.say('\u8981\u5220\u9664\u54ea\u4e00\u5f20\u5440\uff1f\u56de\u590d\u5e8f\u53f7\u5c31\u597d\uff1a\n' + stickers.map((s, i) => (i + 1) + '. ' + s.filename).join('\n'))
      return
    }
    const deleteIndex = getStickerDeleteIndex(command)
    if (deleteIndex) {
      const list = stickerDeleteLists.get(conversationId)
      if (!list) return
      const index = parseInt(deleteIndex[1], 10) - 1
      if (index < 0 || index >= list.length) { await target.say('\u5e8f\u53f7\u4e0d\u5bf9\u54e6\uff0c\u8bf7\u91cd\u65b0\u53d1\u4e00\u4e2a\u6570\u5b57\u3002'); return }
      stickerDeleteLists.delete(conversationId)
      await clearConversationState(conversationId, ['stickerDeleteList'])
      await target.say(await deleteSticker(list[index].filename) ? '\u5df2\u5220\u9664\u8fd9\u5f20\u8868\u60c5\u5305\u3002' : '\u5220\u9664\u5931\u8d25\u4e86\u3002')
      return
    }
    if (isStickerCountCommand(command)) { await target.say('\u6211\u6709' + await countStickers() + '\u4e2a\u8868\u60c5\u5305\u3002'); return }
    if (isSendStickerCommand(command)) {
      const sticker = await randomSticker({ emotion: 'affectionate', prompt: command })
      if (!sticker) await target.say('\u6211\u7684\u8868\u60c5\u5305\u5e93\u8fd8\u662f\u7a7a\u7a7a\u7684\uff0c\u5148\u53d1\u4e00\u5f20\u7ed9\u6211\u6536\u7eb3\u5427\u3002')
      else if (!(await sendSticker(target, sticker))) await target.say('\u8fd9\u5f20\u8868\u60c5\u5305\u6682\u65f6\u53d1\u4e0d\u51fa\u53bb\u3002')
      return
    }
    if (isRoom && !context.mentionedBot) return

    if (isMusicListRequest(command)) { const songs = await buildMusicIndex(true); musicSelectionLists.set(conversationId, songs); await saveConversationState(conversationId, { musicSelectionList: songs }); await target.say(formatMusicPlaylist(songs)); return }
    const selectedSong = parseMusicSelection(command, musicSelectionLists.get(conversationId) || [])
    if (selectedSong) { musicSelectionLists.delete(conversationId); await clearConversationState(conversationId, ['musicSelectionList']); await target.say((await playMusic(selectedSong.name)).message); return }
    if (isSelfIntroductionRequest(command)) { await target.say(selfIntroduction); return }
    const actionReply = detectActionReply(command)
    if (actionReply) {
      if (!isActionOnlyRequest(command)) {
        // Mixed action and chat must share one delayed Kimi response.
        queueDelayedReply({ conversationId, target, isRoom, serviceType, prompt: command })
        return
      }
      await target.say(actionReply)
      if (isStickerFriendlyPrompt(command)) await sendSticker(target, await randomSticker({ emotion: inferEmotionFromConversation(command) || 'affectionate', prompt: command }))
      return
    }

    const music = matchMusicPlayback(command)
    if (music.named || music.random) {
      if (music.random) { const song = await getRandomSong(); await target.say(song ? (await playMusic(song.name)).message : '\u672c\u5730\u8fd8\u6ca1\u6709\u4e0b\u8f7d\u7684\u97f3\u4e50\u54e6\u3002') }
      else { const songName = (music.named[1] || '').trim(); await target.say(songName ? (await playMusic(songName)).message : '\u5b9d\u5b9d\u60f3\u542c\u4ec0\u4e48\u6b4c\u5440\uff1f') }
      return
    }
    if (isMusicCountRequest(command)) { await buildMusicIndex(); await target.say('\u672c\u5730\u4e00\u5171\u6709' + getMusicCount() + '\u9996\u6b4c\u54e6\uff5e'); return }

    const prompt = content.replace(botName, '').replace(/^(\?|\uff1f|>)\s*/, '').trim()
    if (!prompt) return
    if (isClearMemoryCommand(prompt)) { await clearHistory(conversationId); await target.say('\u597d\u5566\uff0c\u8fd9\u6bb5\u804a\u5929\u7684\u8bb0\u5fc6\u5df2\u7ecf\u6e05\u9664\u5566\u3002'); return }
    queueDelayedReply({ conversationId, target, isRoom, serviceType, prompt })
  } catch (error) { console.error('[message] failed:', error?.stack || error) }
}

export async function shardingMessage(message, bot) { return defaultMessage(message, bot, 'ChatGPT') }
