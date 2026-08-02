import { WechatyBuilder, ScanStatus, log } from 'wechaty'
import qrTerminal from 'qrcode-terminal'
import { defaultMessage, recoverDelayedReplies } from '../message/messageHandler.js'
import { canReply } from '../security/accessPolicy.js'
import { getMessageContext } from '../message/conversationContext.js'
import fs from 'node:fs'
import path from 'node:path'
import { rememberPrivateUser, startMorningReminder } from './morningReminder.js'
import PuppetWechat4u from 'wechaty-puppet-wechat4u'
import { formatProcessError, isRecoverableWechat4uError } from './wechat4uCompatibility.js'
const env = process.env
const memoryCardPath = path.resolve(env.MEMORY_CARD_PATH || 'WechatEveryDay.memory-card.json')
if (fs.existsSync(memoryCardPath)) {
  console.log('[login] existing session cache found (' + fs.statSync(memoryCardPath).size + ' bytes); attempting reuse')
} else {
  console.log('[login] no session cache found; first run will require QR scan')
}

function onScan(qrcode, status) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    qrTerminal.generate(qrcode, { small: true })
    // Keep the login credential local: never send or print the QR payload.
    console.log('[login] QR code displayed in the terminal:', ScanStatus[status], status)
  } else {
    log.info('onScan: %s(%s)', ScanStatus[status], status)
  }
}

function onLogin(user) {
  console.log('Contact<' + (user.name() || 'unknown') + '> has logged in')
  console.log('Current time:' + new Date().toString())
  console.log('Automatic robot chat mode has been activated')
}

function onLogout(user, reason) {
  console.log('Contact<' + (user.name() || 'unknown') + '> has logged out, reason:' + reason)
}

async function onMessage(msg) {
  if (msg.self()) return
  try {
    const talker = msg.talker()
    const context = getMessageContext(msg, bot)
    if (!canReply(context)) {
      console.log('[message] ignored message rejected by access policy: ' + (context.talkerId || 'unknown'))
      return
    }
    if (talker && !context.isRoom) await rememberPrivateUser(talker)
    await defaultMessage(msg, bot, 'Kimi')
  } catch (error) {
    console.error('[message] failed:', error?.stack || error)
  }
}

function onError(error) {
  console.error('[wechaty] error:', error?.stack || error)
}

function onFriendship(friendship) {
  console.log('[friendship] received from ' + (friendship.contact()?.name() || 'unknown'))
}

let reconnectAfterError

function handleProcessError(kind, error) {
  const details = formatProcessError(error)
  if (isRecoverableWechat4uError(error)) {
    console.warn('[wechaty] known WeChat4u compatibility error (' + kind + '), keeping session alive: ' + details)
    if (reconnectAfterError) reconnectAfterError(error)
    return
  }
  console.error('[wechaty] fatal ' + kind + '; stopping for process-manager restart:', details)
  process.exitCode = 1
  setTimeout(() => process.exit(1), 0).unref()
}

process.on('uncaughtException', (error) => handleProcessError('uncaught exception', error))
process.on('unhandledRejection', (reason) => handleProcessError('unhandled rejection', reason))

const serviceType = 'Kimi'
const puppet = new PuppetWechat4u()
const bot = WechatyBuilder.build({ puppet, name: 'wechat-bot' })

bot.on('scan', onScan)
bot.on('login', onLogin)
bot.on('logout', onLogout)
bot.on('message', onMessage)
bot.on('error', onError)
bot.on('friendship', onFriendship)

let reconnecting = false
reconnectAfterError = async function reconnectAfterErrorImpl(error) {
  if (reconnecting) return
  reconnecting = true
  try {
    console.error('[wechaty] connection error; attempting logout/reconnect:', error?.stack || error)
    await bot.logout().catch(() => {})
    await bot.start()
  } catch (reconnectError) {
    console.error('[wechaty] reconnect failed:', reconnectError?.stack || reconnectError)
  } finally {
    reconnecting = false
  }
}

bot.on('error', (error) => {
  const message = formatProcessError(error)
  if (isRecoverableWechat4uError(error) || /connection|socket|login|logout|puppet|wechat4u/i.test(message)) {
    reconnectAfterError(error)
  }
})

if (!env.KIMI_API_KEY) {
  console.error('[boot] KIMI_API_KEY not found in .env; the bot cannot reply without it')
}

bot.start()
  .then(async () => {
    console.log('[boot] Wechaty started with puppet ' + puppet.constructor.name + ', serviceType=' + serviceType)
    await recoverDelayedReplies(bot, serviceType)
    await startMorningReminder(bot)
  })
  .catch((error) => {
    console.error('[boot] start failed:', error?.stack || error)
    process.exitCode = 1
  })
