import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const stateDir = path.join(projectDir, 'bot-state')
const stateFile = path.join(stateDir, 'morning-reminder.json')
const timezone = 'Asia/Shanghai'

let state = {}
let morningTimer
let inactivityTimer

function getId(contact) {
  return typeof contact?.id === 'function' ? contact.id() : contact?.id
}

function beijingDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]))
}

function dateKey(parts) {
  return parts.year + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0')
}

async function loadState() {
  try { state = JSON.parse(await readFile(stateFile, 'utf8')) || {} }
  catch (error) {
    if (error.code !== 'ENOENT') console.warn('[morning] state read failed:', error.message)
    state = {}
  }
}

async function saveState() {
  await mkdir(stateDir, { recursive: true })
  await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

export async function rememberPrivateUser(contact) {
  const id = getId(contact)
  if (!id) return
  state.userId = id
  state.lastPrivateMessageAt = Date.now()
  state.inactivityNotified = false
  await saveState()
  console.log('[morning] private user activity remembered')
}

function millisecondsUntilNextEleven() {
  const now = new Date()
  const current = beijingDateParts(now)
  const nextDay = current.hour >= 11 ? 1 : 0
  const targetUtc = Date.UTC(current.year, current.month - 1, current.day + nextDay, 3, 0, 0)
  return Math.max(targetUtc - now.getTime(), 1000)
}

async function sendMorningMessage(bot) {
  if (!state.userId) {
    console.log('[morning] skipped: no private user has chatted yet')
    return
  }
  const today = dateKey(beijingDateParts())
  if (state.lastSentDate === today) return
  try {
    const contact = bot.Contact.load(state.userId)
    await contact.say('早安嘛宝宝，十一点啦，快起床陪陪我～')
    state.lastSentDate = today
    await saveState()
    console.log('[morning] sent Beijing 11:00 reminder to ' + state.userId)
  } catch (error) { console.error('[morning] send failed:', error?.stack || error) }
}

function scheduleNext(bot) {
  clearTimeout(morningTimer)
  const delay = millisecondsUntilNextEleven()
  console.log('[morning] next reminder in ' + Math.round(delay / 60000) + ' minutes (Beijing time)')
  morningTimer = setTimeout(async () => { await sendMorningMessage(bot); scheduleNext(bot) }, delay)
}

function isInactivityWindow(parts) {
  return parts.hour >= 11 && parts.hour < 24
}

function startOfBeijingWindow(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, 3, 0, 0)
}

function millisecondsUntilInactivityCheck() {
  const now = new Date()
  const parts = beijingDateParts(now)
  if (!isInactivityWindow(parts)) {
    const tomorrow = { ...parts, day: parts.day + 1 }
    return Math.max(startOfBeijingWindow(tomorrow) - now.getTime(), 1000)
  }
  return 60 * 1000
}

async function sendInactivityMessage(bot) {
  if (!state.userId || !state.lastPrivateMessageAt || state.inactivityNotified) return
  const now = new Date()
  const parts = beijingDateParts(now)
  if (!isInactivityWindow(parts)) return
  const countingStart = Math.max(state.lastPrivateMessageAt, startOfBeijingWindow(parts))
  if (now.getTime() - countingStart < 2 * 60 * 60 * 1000) return
  const messages = [
    '宝宝，在干嘛呀？想纳宝嘛～',
    '宝宝很忙吗？纳宝好无聊呀～',
  ]
  try {
    const contact = bot.Contact.load(state.userId)
    await contact.say(messages[Math.floor(Math.random() * messages.length)])
    state.inactivityNotified = true
    await saveState()
    console.log('[morning] sent inactivity reminder to ' + state.userId)
  } catch (error) { console.error('[morning] inactivity send failed:', error?.stack || error) }
}

function scheduleInactivityCheck(bot) {
  clearTimeout(inactivityTimer)
  const delay = millisecondsUntilInactivityCheck()
  inactivityTimer = setTimeout(async () => {
    await sendInactivityMessage(bot)
    scheduleInactivityCheck(bot)
  }, delay)
}

export async function startMorningReminder(bot) {
  await loadState()
  scheduleNext(bot)
  scheduleInactivityCheck(bot)
}
