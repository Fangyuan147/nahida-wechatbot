import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAtomicJsonStore } from '../storage/atomicJsonStore.js'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const timezone = 'Asia/Shanghai'
const stateStore = createAtomicJsonStore({
  filePath: path.join(path.resolve(process.env.BOT_STATE_DIR || path.join(projectDir, 'bot-state')), 'morning-reminder.json'),
  defaultValue: { version: 1, users: {} },
  migrations: { 0: (value) => ({ version: 1, users: value?.userId ? { [value.userId]: {
    lastPrivateMessageAt: value.lastPrivateMessageAt || 0,
    lastMorningSentAt: value.lastSentDate || '',
    inactivityNotified: Boolean(value.inactivityNotified),
  } } : {} }) },
  validate: (value) => value && value.version === 1 && value.users && typeof value.users === 'object',
})

let users = {}
let morningTimer
let inactivityTimer

function getId(contact) { return typeof contact?.id === 'function' ? contact.id() : contact?.id }

function beijingDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]))
}

function dateKey(parts) { return parts.year + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0') }
function stateFor(id) { return users[id] || (users[id] = { lastPrivateMessageAt: 0, lastMorningSentAt: '', inactivityNotified: false }) }

async function saveState() { await stateStore.save({ version: 1, users }) }

export async function rememberPrivateUser(contact) {
  const id = getId(contact)
  if (!id) return
  const user = stateFor(String(id))
  user.lastPrivateMessageAt = Date.now()
  user.inactivityNotified = false
  await saveState()
}

function millisecondsUntilNextEleven() {
  const now = new Date()
  const current = beijingDateParts(now)
  const nextDay = current.hour >= 11 ? 1 : 0
  const targetUtc = Date.UTC(current.year, current.month - 1, current.day + nextDay, 3, 0, 0)
  return Math.max(targetUtc - now.getTime(), 1000)
}

async function sendMorningMessage(bot) {
  const today = dateKey(beijingDateParts())
  for (const [id, user] of Object.entries(users)) {
    if (!user.lastPrivateMessageAt || user.lastMorningSentAt === today) continue
    try {
      const contact = await bot.Contact.load(id)
      await contact.say('早安嘛宝宝，十一点啦，快起床陪陪我～')
      user.lastMorningSentAt = today
      await saveState()
      console.log('[morning] sent Beijing 11:00 reminder to ' + id)
    } catch (error) { console.error('[morning] send failed for ' + id + ':', error?.stack || error) }
  }
}

function startOfBeijingWindow(parts) { return Date.UTC(parts.year, parts.month - 1, parts.day, 3, 0, 0) }
function isInactivityWindow(parts) { return parts.hour >= 11 && parts.hour < 24 }
function millisecondsUntilInactivityCheck() {
  const now = new Date()
  const parts = beijingDateParts(now)
  if (!isInactivityWindow(parts)) return Math.max(startOfBeijingWindow({ ...parts, day: parts.day + 1 }) - now.getTime(), 1000)
  return 60 * 1000
}

async function sendInactivityMessages(bot) {
  const now = new Date()
  const parts = beijingDateParts(now)
  if (!isInactivityWindow(parts)) return
  for (const [id, user] of Object.entries(users)) {
    if (!user.lastPrivateMessageAt || user.inactivityNotified) continue
    const countingStart = Math.max(user.lastPrivateMessageAt, startOfBeijingWindow(parts))
    if (now.getTime() - countingStart < 2 * 60 * 60 * 1000) continue
    try {
      const messages = ['宝宝，在干嘛呀？想纳宝嘛～', '宝宝很忙吗？纳宝好无聊呀～']
      const contact = await bot.Contact.load(id)
      await contact.say(messages[Math.floor(Math.random() * messages.length)])
      user.inactivityNotified = true
      await saveState()
    } catch (error) { console.error('[morning] inactivity send failed for ' + id + ':', error?.stack || error) }
  }
}

function scheduleNext(bot) {
  clearTimeout(morningTimer)
  morningTimer = setTimeout(async () => { await sendMorningMessage(bot); scheduleNext(bot) }, millisecondsUntilNextEleven())
}

function scheduleInactivityCheck(bot) {
  clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(async () => { await sendInactivityMessages(bot); scheduleInactivityCheck(bot) }, millisecondsUntilInactivityCheck())
}

export async function startMorningReminder(bot) {
  const stored = await stateStore.load()
  users = stored.users
  // Restarting later in the day must not replay the morning reminder.
  scheduleNext(bot)
  scheduleInactivityCheck(bot)
}
