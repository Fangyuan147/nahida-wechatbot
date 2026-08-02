const balanceUrl = 'https://api.moonshot.cn/v1/users/me/balance'
const lowThreshold = 1.0
const cacheTtlMs = 5 * 60 * 1000

let cachedBalance = null
let cacheTimestamp = 0
let pendingRequest = null
let lastNotifiedAt = 0

async function fetchBalance() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(balanceUrl, {
      signal: controller.signal,
      headers: { Authorization: 'Bearer ' + (process.env.KIMI_API_KEY || '') },
    })
    const data = await response.json()
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return Number(data?.available_balance ?? data?.balance ?? -1)
  } finally {
    clearTimeout(timer)
  }
}

export async function getKimiBalance() {
  const now = Date.now()
  if (cachedBalance !== null && now - cacheTimestamp < cacheTtlMs) return cachedBalance
  if (pendingRequest) return pendingRequest
  pendingRequest = (async () => {
    try {
      cachedBalance = await fetchBalance()
      cacheTimestamp = Date.now()
      return cachedBalance
    } catch (error) {
      console.warn('[balance] fetch failed:', error?.message || error)
      return cachedBalance ?? -1
    } finally { pendingRequest = null }
  })()
  return pendingRequest
}

export async function checkAndNotifyLowBalance(target) {
  if (!target || Date.now() - lastNotifiedAt < 30 * 60 * 1000) return
  try {
    const balance = await getKimiBalance()
    if (balance >= 0 && balance < lowThreshold) {
      await target.say('宝宝，我的 API 余额只剩 ' + balance.toFixed(2) + ' 元了，要注意充值哦。')
      lastNotifiedAt = Date.now()
    }
  } catch (error) { console.warn('[balance] notify check failed:', error?.message || error) }
}
