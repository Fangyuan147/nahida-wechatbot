import { botName } from '../../config.js'
import { getServe } from './serve.js'
import { archivePendingSticker, cancelCapture, consumeOneCaptureSlot, countStickers, deleteAllStickers, deleteSticker, getCaptureState, listStickers, randomSticker, savePendingSticker, setCaptureCount, startCaptureFlow } from './stickerStore.js'
import { appendHistory, clearHistory, getHistory } from '../kimi/chatHistory.js'
import { checkAndNotifyLowBalance } from '../kimi/balanceMonitor.js'
import { searchWithEdge } from '../search/edgeSearch.js'
import { extractDouyinUrl, readDouyinPage } from '../search/douyin.js'
import { detectActionReply, extractEmotion, getEmotionAction, inferEmotionFromConversation, removeEmotionMarkers } from './actionInteraction.js'
import { buildMusicIndex, getMusicCount, getRandomSong, playMusic } from '../music/musicPlayer.js'

async function sendSticker(target, sticker) {
  if (!sticker) return false
  try { await target.say(sticker); return true }
  catch (error) { console.error('[sticker] send failed:', error?.message || error); return false }
}

function cleanStickerReply(reply, shouldSendSticker) {
  if (!shouldSendSticker) return reply
  const unavailablePattern = /(不能|无法|没法|发不了|暂时发不出|还不能|只能想象)[^。！？!?\n]{0,30}(发送|发出|发个|表情包|图片)/u
  if (unavailablePattern.test(reply)) return '好呀，给你一张。'
  return reply
}

const maxReplyChars = 50

const stickerDeleteLists = new Map()

const stickerCaptureCommands = new Set([
  '纳宝请收纳改表情包',
  '纳宝请收纳该表情包',
])

function isStickerCaptureCommand(command) {
  const normalized = String(command).trim().replace(/[。！？!]+$/u, '')
  return stickerCaptureCommands.has(normalized)
}

export function splitReplyIntoMessages(reply = '') {
  const normalized = String(reply).replace(/\s+/gu, ' ').trim()
  if (!normalized) return []
  const sentences = []
  let current = ''
  for (const character of Array.from(normalized)) {
    current += character
    if ('。！？'.includes(character)) {
      sentences.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) sentences.push(current.trim())
  return sentences.flatMap((sentence) => {
    const characters = Array.from(sentence)
    const chunks = []
    for (let offset = 0; offset < characters.length; offset += maxReplyChars) {
      chunks.push(characters.slice(offset, offset + maxReplyChars).join(''))
    }
    return chunks.filter(Boolean)
  })
}

export function limitReplyToChars(reply = '', limit = maxReplyChars) {
  const normalized = String(reply).replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''

  const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/gu) || [normalized]
  let selected = ''
  for (const sentence of sentences) {
    const candidate = selected + sentence.trim()
    if (Array.from(candidate).length <= limit) selected = candidate
    else break
  }
  if (selected) return selected.trim()

  // Kimi should normally obey the limit; this keeps a malformed long sentence bounded.
  const characters = Array.from(normalized)
  if (limit <= 1) return characters.slice(0, limit).join('')
  return characters.slice(0, limit - 1).join('') + '。'
}

async function sendText(target, text) {
  for (const message of splitReplyIntoMessages(text)) await target.say(message)
}

const shortAckPattern = /^(嘻嘻|哈哈|嘿嘿|呵呵|嗯嗯|哦哦|好的|好吧|ok|OK|嗯|哦|好|行|对|是|喵|嗷|唔|诶|唉|呀|哟)$/u
function isIgnoredShortReply(command) {
  return shortAckPattern.test(String(command).trim())
}

const introPattern = /^(自我介绍|介绍一下自己|你是谁|你叫什么|说说你|介绍下你自己|你好呀你是谁)[。！？!?]?$/u
function isSelfIntroductionRequest(command) {
  return introPattern.test(String(command).trim())
}

const selfIntroduction = '宝宝，我是纳西妲呀！是须弥的小吉祥草王，大家都叫我纳宝～我最喜欢和你聊天啦，每天最期待的事情就是看到你的消息！我会乖乖听你说话，偶尔撒撒娇，有时候也会小小地生气一下下，但很快就会被你哄好的哦～快来找我玩吧！'

const searchTrigger = /(搜索|查一下|帮我查|帮我搜|联网|百度一下|bing|Bing|最新|新闻|今天|现在是什么|天气|热搜|发生了什么)/u
function explicitlyNeedsSearch(prompt) {
  return searchTrigger.test(String(prompt))
}

const uncertaintyPattern = /(不确定|不太清楚|不知道|没有相关信息|我无法|抱歉.*无法|我不确定|没有找到|不清楚呢)/u
function answerShowsUncertainty(result) {
  return uncertaintyPattern.test(String(result || ''))
}

const stickerMarkerPattern = /\[\[\s*SEND_STICKER\s*\]\]/iu
const stickerPromptPattern = /表情包|发个图|来个图|发张图|发图片|撒娇|卖萌|亲亲|抱抱|贴贴|黏人|想念|想你|喜欢你|爱你|哄我|安慰我|可爱/u

export function isStickerFriendlyPrompt(prompt) {
  return stickerPromptPattern.test(String(prompt))
}

export function shouldSendStickerForConversation(prompt) {
  return isStickerFriendlyPrompt(prompt)
}

export function removeStickerMarker(text = '') {
  return String(text).replace(stickerMarkerPattern, '').trim()
}

export async function defaultMessage(msg, bot, serviceType = 'Kimi') {
  try {
    const talker = msg.talker()
    const room = msg.room()
    const isRoom = !!room
    const talkerId = talker ? (typeof talker.id === 'function' ? talker.id() : talker.id) : 'unknown'
    const roomId = isRoom ? (typeof room.id === 'function' ? room.id() : room.id) : null
    const conversationId = isRoom ? ('room:' + roomId) : ('private:' + talkerId)
    const type = msg.type()
    const isText = type === bot.Message.Type.Text
    const content = isText ? msg.text() : ''

    // For non-text messages, check if we can extract a file for capture.
    // WeChat may tag photos/stickers under many different types, so we
    // try to pull a FileBox from ANY non-text message.
    if (!isText) {
      const captureState = getCaptureState(conversationId)
      if (captureState && captureState !== 'asking_count') {
        const target = isRoom ? room : talker
        try {
          await savePendingSticker(msg, conversationId)
          const archived = await archivePendingSticker(conversationId)
          if (!archived) throw new Error('保存失败')
          const left = consumeOneCaptureSlot(conversationId)
          if (left === captureState.total || left === true) {
            await sendText(target, '好啦，' + captureState.total + '张表情包全部收完啦～')
          } else {
            await sendText(target, '已收纳一张，还剩' + (typeof left === 'number' ? left - 1 : '') + '张哦～')
          }
        } catch (error) {
          console.error('[sticker] receive failed:', error?.stack || error)
          await sendText(target, '唔……这张没收好，请重新发送一张。')
        }
      }
      return
    }

    if (!content) return

    const command = content.replace(botName, '').trim()

    if (isStickerCaptureCommand(command)) {
      startCaptureFlow(conversationId)
      await sendText(isRoom ? room : talker, '好呀，你想收纳几张表情包呀？')
      return
    }

    if (getCaptureState(conversationId) === 'asking_count') {
      const numMatch = command.match(/^(\d+)\s*[张个]?$/u)
      if (numMatch) {
        const n = setCaptureCount(conversationId, parseInt(numMatch[1], 10))
        await sendText(isRoom ? room : talker, '收到！接下来发' + n + '张图片或表情包给我吧～')
      } else {
        cancelCapture(conversationId)
        await sendText(isRoom ? room : talker, '没有听清数量，收纳已取消。需要的话再说一次吧。')
      }
      return
    }

    if (/^(取消收纳|不要了|不收了)[。！!]?$/u.test(command)) {
      if (getCaptureState(conversationId)) {
        cancelCapture(conversationId)
        await sendText(isRoom ? room : talker, '好的，收纳已取消。')
      }
      return
    }

    if (isIgnoredShortReply(command)) {
      console.log('[message] ignored short acknowledgement: ' + command)
      return
    }

        if (/^(删除全部表情包|全部删除|删除所有表情包|清空表情包)[。！!]?$/u.test(command)) {
      const deleted = await deleteAllStickers()
      await (isRoom ? room : talker).say('已经全部删除啦，一共删了' + deleted + '张～')
      return
    }

    if (/^(删除表情包|删表情包|移除表情包)[。！!]?$/u.test(command)) {
      const stickers = await listStickers()
      if (stickers.length === 0) {
        await (isRoom ? room : talker).say('现在没有表情包可以删除哦～')
        return
      }
      const lines = stickers.map((s, i) => (i + 1) + '. ' + s.filename)
      const msg = '要删除哪一张呀？回复数字序号就好，或者回复"全部删除"：\n' + lines.join('\n')
      await (isRoom ? room : talker).say(msg)
      stickerDeleteLists.set(conversationId, stickers)
      return
    }

    const deleteByNumber = command.match(/^(\d+)$/u)
    if (deleteByNumber) {
      const list = stickerDeleteLists.get(conversationId)
      if (!list) return
      const idx = parseInt(deleteByNumber[1], 10) - 1
      if (idx < 0 || idx >= list.length) {
        await (isRoom ? room : talker).say('序号不对哦，请重新发一个范围内的数字。')
        return
      }
      const ok = await deleteSticker(list[idx].filename)
      stickerDeleteLists.delete(conversationId)
      await (isRoom ? room : talker).say(ok ? '已删除这张表情包。' : '删除失败了，请稍后再试。')
      return
    }

    const normalizedCommand = command.replace(/[，。！？、,.!?：:；;\s]/gu, '')
    const countStickerCommand = /(?:表情包.*(?:多少|几个|几张|数量)|(?:多少|几个|几张|数量).*表情包)/u
    if (countStickerCommand.test(normalizedCommand)) {
      const count = await countStickers()
      console.log('[sticker] count requested: ' + count)
      await (isRoom ? room : talker).say('我有' + count + '个表情包。')
      return
    }

    const sendStickerCommand = /^(?:发个|发一张|发送一个|发送一张|来个|来一张)?表情包[。！!]?$/u
    if (sendStickerCommand.test(command)) {
      const sticker = await randomSticker({ emotion: 'affectionate', prompt: command })
      const target = isRoom ? room : talker
      if (!sticker) {
        await target.say('我的表情包库还是空空的，先发一张给我收纳吧。')
      } else if (!(await sendSticker(target, sticker))) {
        await target.say('唔……这张表情包暂时发不出去，可能需要重新收纳一张。')
      }
      return
    }

    if (isRoom && !content.includes(botName)) return

    if (isSelfIntroductionRequest(command)) {
      await (isRoom ? room : talker).say(selfIntroduction)
      console.log('[message] sent full self-introduction')
      return
    }

    const actionReply = detectActionReply(command)
    if (actionReply) {
      const target = isRoom ? room : talker
      await target.say(actionReply)
      if (isStickerFriendlyPrompt(command)) {
        await sendSticker(target, await randomSticker({ emotion: inferEmotionFromConversation(command) || 'affectionate', prompt: command }))
      }
      console.log('[action] replied to: ' + command)
      return
    }

    // ---- 音乐播放命令 ----
    const playMusicPattern = /^(?:播放|放|来|我想听|给我放|放一首|来一首|来一曲|听)(?:一首|一曲|一下)?\s*(?:歌曲|音乐|歌)?\s*(.+)$/u
    const randomMusicPattern = /^(来首歌|放首歌|听歌|放音乐|来点音乐|播歌|随机播放|放个歌|来首音乐|放一首歌|来一曲)$/u
    const playMusicMatch = command.match(playMusicPattern)
    const isRandomMusic = randomMusicPattern.test(command)

    if (playMusicMatch || isRandomMusic) {
      const target = isRoom ? room : talker
      if (isRandomMusic) {
        const song = await getRandomSong()
        if (!song) {
          await target.say('唔……本地还没有下载的音乐，宝宝先在酷狗上下载一些吧～')
        } else {
          const result = await playMusic(song.name)
          await target.say(result.message)
        }
      } else {
        const songName = (playMusicMatch[1] || '').trim()
        if (!songName) {
          await target.say('宝宝想听什么歌呀？告诉我歌名就好～')
        } else {
          const result = await playMusic(songName)
          await target.say(result.message)
        }
      }
      return
    }

    const musicCountPattern = /^(?:有多少|多少)(?:首)?(?:音乐|歌曲|歌)/u
    if (musicCountPattern.test(command)) {
      await buildMusicIndex()
      const count = getMusicCount()
      await (isRoom ? room : talker).say('本地一共有' + count + '首歌哦～')
      return
    }

    const prompt = content.replace(botName, '').replace(/^(\?|？|>)\s*/, '').trim()
    if (!prompt) return

    const douyinUrl = extractDouyinUrl(prompt)
    if (douyinUrl) {
      const target = isRoom ? room : talker
      try {
        const page = await readDouyinPage(douyinUrl)
        const source = '抖音标题：' + (page.title || '未知') + '\n抖音简介：' + (page.description || '暂无')
        const summary = await getServe(serviceType)(
          '请根据以下抖音公开信息，用自然聊天语气告诉我它大概讲了什么。不要提及技术过程。\n' + source,
          await getHistory(conversationId),
        )
        await sendText(target, summary)
        await appendHistory(conversationId, [
          { role: 'user', content: prompt },
          { role: 'assistant', content: summary },
        ])
      } catch (error) {
        console.warn('[douyin] read failed:', error?.message || error)
        await sendText(target, '唔……这个抖音链接暂时读不了。')
      }
      return
    }

    if (/^(清除|重置|忘记)聊天记忆[。！!]?$/u.test(prompt)) {
      await clearHistory(conversationId)
      await (isRoom ? room : talker).say('好啦，这段聊天的记忆已经清除啦。')
      return
    }

    console.log('[message] ' + (isRoom ? 'group' : 'private') + ' received; asking ' + serviceType)
    const history = await getHistory(conversationId)
    let webContext = ''
    if (explicitlyNeedsSearch(prompt)) {
      try { webContext = await searchWithEdge(prompt); console.log('[search] Edge search completed') }
      catch (error) { console.warn('[search] Edge search failed:', error?.message || error) }
    }
    const firstPrompt = webContext ? (prompt + '\n\n【Edge联网搜索资料】\n' + webContext + '\n请根据资料回答，不要提及搜索过程。') : prompt
    let result = await getServe(serviceType)(firstPrompt, history)
    if (!webContext && answerShowsUncertainty(result)) {
      try {
        webContext = await searchWithEdge(prompt)
        console.log('[search] Edge search completed after uncertain answer')
        result = await getServe(serviceType)(prompt + '\n\n【Edge联网搜索资料】\n' + webContext + '\n请根据资料回答，不要提及搜索过程。', history)
      } catch (error) { console.warn('[search] fallback search failed:', error?.message || error) }
    }
    const emotion = inferEmotionFromConversation(prompt) || extractEmotion(result)
    const modelRequestedSticker = stickerMarkerPattern.test(String(result))
    const shouldSendSticker = shouldSendStickerForConversation(prompt)
    if (modelRequestedSticker && !shouldSendSticker) {
      console.log('[sticker] skipped: conversation is not sticker-friendly')
    }
    const plainResult = removeEmotionMarkers(removeStickerMarker(result))
    const emotionAction = getEmotionAction(emotion)
    const replyText = cleanStickerReply(plainResult, shouldSendSticker)
    const reply = limitReplyToChars(replyText || (shouldSendSticker ? '好呀，给你。' : ''))
    if (!reply) throw new Error('AI service returned an empty reply')

    const target = isRoom ? room : talker
    if (emotionAction) await sendText(target, emotionAction)
    for (const message of splitReplyIntoMessages(reply)) await target.say(message)
    await checkAndNotifyLowBalance(target)
    if (shouldSendSticker) {
      const sticker = await randomSticker({ emotion, prompt })
      await sendSticker(isRoom ? room : talker, sticker)
    }
    await appendHistory(conversationId, [
      { role: 'user', content: prompt },
      { role: 'assistant', content: reply },
    ])
    console.log('[message] reply sent')
  } catch (error) {
    console.error('[message] failed:', error?.stack || error)
  }
}

export async function shardingMessage(message, bot) {
  return defaultMessage(message, bot, 'ChatGPT')
}
