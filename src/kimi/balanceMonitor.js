import axios from 'axios'
import dotenv from 'dotenv'
const env = { ...process.env, ...(dotenv.config().parsed || {}) }

const balanceUrl = 'https://api.moonshot.cn/v1/users/me/balance'
const lowThreshold = 1.0
const cacheTtlMs = 5 * 60 * 1000

let cachedBalance = null
let cacheTimestamp = 0
let pendingRequest = null
let lastNotifiedAt = 0

async function fetchBalance() {
  const res = await axios.get(balanceUrl, {
    timeout: 8000,
    headers: { Authorization: 'Bearer ' + env.KIMI_API_KEY },
  })
  return Number(res.data?.available_balance ?? res.data?.balance ?? -1)
}

export async function getKimiBalance() {
  const now = Date.now()
  if (cachedBalance !== null && now - cacheTimestamp < cacheTtlMs) return cachedBalance

  if (pendingRequest) {
    console.log('[balance] waiting for in-flight request')
    return pendingRequest
  }

  pendingRequest = (async () => {
    try {
      cachedBalance = await fetchBalance()
      cacheTimestamp = Date.now()
      console.log('[balance] fetched:', cachedBalance)
      return cachedBalance
    } catch (error) {
      console.warn('[balance] fetch failed:', error?.message || error)
      pendingRequest = null
      return cachedBalance ?? -1
    } finally {
      pendingRequest = null
    }
  })()

  return pendingRequest
}

export async function checkAndNotifyLowBalance(target) {
  if (!target) return
  const now = Date.now()
  if (now - lastNotifiedAt < 30 * 60 * 1000) return

  try {
    const balance = await getKimiBalance()
    if (balance >= 0 && balance < lowThreshold) {
      await target.say('宝宝，我的 API 余额只剩 ' + balance.toFixed(2) + ' 元了，要注意充值哦。')
      lastNotifiedAt = now
    }
  } catch (error) {
    console.warn('[balance] notify check failed:', error?.message || error)
  }
}
