import { WechatyBuilder, ScanStatus, log } from 'wechaty'
import qrTerminal from 'qrcode-terminal'
import { defaultMessage } from './sendMessage.js'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { rememberPrivateUser, startMorningReminder } from './morningReminder.js'
import PuppetWechat4u from 'wechaty-puppet-wechat4u'
const env = { ...process.env, ...(dotenv.config().parsed || {}) }
let contactLookupWarningShown = false

function disableUnreliableContactLookup() {
  const prototype = PuppetWechat4u.prototype
  if (prototype.__safeContactLookupPatched) return
  prototype.getContactsInfo = function getContactsInfoSafely() {
    const dropped = Array.isArray(this.unknownContactId) ? this.unknownContactId.splice(0, 40).length : 0
    if (dropped) console.warn('[wechaty] skipped ' + dropped + ' unreliable contact lookup request(s)')
  }
  const originalMonkeyPatch = prototype.monkeyPatch
  prototype.monkeyPatch = function safeMonkeyPatch(wechat4u) {
    originalMonkeyPatch.call(this, wechat4u)
    if (!wechat4u || typeof wechat4u.batchGetContact !== 'function' || wechat4u.__safeBatchGetContactPatched) return
    const originalBatchGetContact = wechat4u.batchGetContact.bind(wechat4u)
    wechat4u.batchGetContact = async (contacts) => {
      try { return await originalBatchGetContact(contacts) }
      catch (error) {
        if (String(error?.message || error).includes('-1 == 0')) {
          if (!contactLookupWarningShown) {
            console.warn('[wechaty] background contact lookup rejected; continuing without it')
            contactLookupWarningShown = true
          }
          return []
        }
        throw error
      }
    }
    Object.defineProperty(wechat4u, '__safeBatchGetContactPatched', { value: true })
  }
  Object.defineProperty(prototype, '__safeContactLookupPatched', { value: true })
}
disableUnreliableContactLookup()

const memoryCardPath = path.resolve('WechatEveryDay.memory-card.json')
if (fs.existsSync(memoryCardPath)) {
  console.log('[login] existing session cache found (' + fs.statSync(memoryCardPath).size + ' bytes); attempting reuse')
} else {
  console.log('[login] no session cache found; first run will require QR scan')
}

function onScan(qrcode, status) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    qrTerminal.generate(qrcode, { small: true })
    const qrcodeImageUrl = ['https://api.qrserver.com/v1/create-qr-code/?data=', encodeURIComponent(qrcode)].join('')
    console.log('onScan:', qrcodeImageUrl, ScanStatus[status], status)
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
    if (talker) await rememberPrivateUser(talker)
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

process.on('uncaughtException', (error) => {
  const msg = String(error?.message || error)
  if (msg.includes("1101' == 0") || msg.includes("1102' == 0") || msg.includes("'-1' == 0") || msg.includes('PuppetWechat4u')) {
    console.warn('[wechaty] suppressed assert from legacy puppet:', msg.substring(0, 120))
    return
  }
  console.error('uncaughtException', error?.stack || error)
})

const serviceType = 'Kimi'
const puppet = new PuppetWechat4u()
const bot = WechatyBuilder.build({ puppet, name: 'wechat-bot' })

bot.on('scan', onScan)
bot.on('login', onLogin)
bot.on('logout', onLogout)
bot.on('message', onMessage)
bot.on('error', onError)
bot.on('friendship', onFriendship)

if (!env.KIMI_API_KEY) {
  console.error('[boot] KIMI_API_KEY not found in .env; the bot cannot reply without it')
}

bot.start()
  .then(() => {
    console.log('[boot] Wechaty started with puppet ' + puppet.constructor.name + ', serviceType=' + serviceType)
    startMorningReminder(bot)
  })
  .catch((error) => {
    console.error('[boot] start failed:', error?.stack || error)
  })
