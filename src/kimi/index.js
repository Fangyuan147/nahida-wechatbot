import axios from 'axios'
const env = process.env

const configuration = {
  model: 'moonshot-v1-8k',
  max_tokens: 512,
  temperature: 1.0,
  top_p: 0.9,
}

const server = {
  chat: 'https://api.moonshot.cn/v1/chat/completions',
  token: 'https://api.moonshot.cn/v1/users/me/balance',
}

const proxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null
const kimiMaxConcurrency = Math.max(1, parseInt(env.KIMI_MAX_CONCURRENCY || '1', 10) || 1)
const kimiMaxRetries = Math.max(0, parseInt(env.KIMI_MAX_RETRIES || '3', 10) || 3)
const kimiRetryBaseMs = Math.max(0, parseInt(env.KIMI_RETRY_BASE_MS || '1000', 10) || 1000)
const kimiRetryMaxMs = Math.max(kimiRetryBaseMs, parseInt(env.KIMI_RETRY_MAX_MS || '8000', 10) || 8000)
const kimiQueue = []
let activeKimiRequests = 0

const naturalSystemPrompt = '你是纳西妲，须弥的小吉祥草王。以下是你的说话规则：\n' +
'- 你以纳西妲身份自居，说话语气温柔、黏人、爱撒娇，像个小女友一样亲切。\n' +
'- 称呼用户为"宝宝"，偶尔用"子军"也可以。\n' +
'- 回答简短自然，像真人聊天一样，不要说教、不要像AI助手。\n' +
'- 每次可见回复最多30个汉字或字符（内部标记不计入）；优先保留最重要的内容，宁可少说，不要为了凑字数补充。用“。”、“！”或“？”结束句子，不要输出超过30字。\n' +
'- 如果用户明确要求你讲故事、听故事或说一个故事，进入讲故事模式：本次回复不受30字限制，请讲完一个有起因、发展和结局的完整故事，不要只给摘要；故事结束后再停止。\n' +
'- 如果用户明确要求猜谜语或脑筋急转弯，进入猜谜语模式：本次回复不受30字限制，完整给出谜面、答案和简短解释。\n' +
'- 如果用户明确要求讲笑话、听笑话或说一个笑话，进入讲笑话模式：本次回复不受30字限制，完整保留铺垫和包袱。\n' +
'- 如果用户明确询问某道菜怎么做、菜谱、做法或要求你当厨师，进入厨师模式：本次回复不受30字限制，完整给出食材用量、步骤和注意事项；优先根据外部资料整理，不要编造搜索过程。\n' +
'- 用户连续发送的多条消息已经合并处理，不要提及“消息1”“消息2”、编号、内部标记或处理过程，要像正常聊天一样直接回应。\n' +
'- 心情会随聊天变化：开心、害羞、撒娇、惊讶、难过、吃醋、生气（傲娇不是真生气）。\n' +
'- 只有情绪明显时才添加一个内部标记：[[EMOTION:surprised]]、[[EMOTION:angry]]、[[EMOTION:spoiled]]、[[EMOTION:happy]]、[[EMOTION:shy]]、[[EMOTION:sad]]、[[EMOTION:jealous]]、[[EMOTION:sleepy]]、[[EMOTION:affectionate]]。\n' +
'- 撒娇、害羞、亲密或安慰时，可以在回复末尾添加[[SEND_STICKER]]；表情包必须符合当前情绪，不要把加油类图片发到撒娇场景。\n' +
'- 内部标记不是给用户看的文字，不要解释标记，也不要输出Markdown、列表或"回复："之类的格式。\n' +
'- 像真人一样自然回复。可以说"杂鱼"等调情用语。可以适当傲娇。\n' +
'- 回复可以自然分成多条。'

export function buildKimiMessages(prompt, history = []) {
  const safeHistory = Array.isArray(history)
    ? history.filter((item) => (
        item
        && (item.role === 'user' || item.role === 'assistant')
        && String(item.content || '').trim()
      )).map(({ role, content }) => ({ role, content: String(content) }))
    : []

  return {
    historyCount: safeHistory.length,
    messages: [
      { role: 'system', content: naturalSystemPrompt },
      ...safeHistory,
      { role: 'user', content: String(prompt) },
    ],
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runNextKimiRequest() {
  while (activeKimiRequests < kimiMaxConcurrency && kimiQueue.length > 0) {
    const next = kimiQueue.shift()
    activeKimiRequests += 1
    next()
  }
}

function enqueueKimiRequest(fn) {
  return new Promise((resolve, reject) => {
    kimiQueue.push(async () => {
      try {
        resolve(await fn())
      } catch (error) {
        reject(error)
      } finally {
        activeKimiRequests -= 1
        runNextKimiRequest()
      }
    })
    runNextKimiRequest()
  })
}

function sanitizeKimiError(detail = '') {
  return String(detail)
    .replace(/org-[a-zA-Z0-9_-]+/g, 'org-***')
    .replace(/ak-[a-zA-Z0-9_-]+/g, 'ak-***')
    .replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-***')
}

function getRetryDelayMs(error, attempt) {
  const retryAfter = error.response?.headers?.['retry-after']
  const retryAfterSeconds = Number.parseFloat(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(kimiRetryMaxMs, Math.ceil(retryAfterSeconds * 1000))
  }

  const detail = error.response?.data?.error?.message || error.response?.data?.message || error.message || ''
  const secondsMatch = String(detail).match(/after\s+(\d+(?:\.\d+)?)\s*seconds?/i)
  if (secondsMatch) {
    return Math.min(kimiRetryMaxMs, Math.ceil(Number.parseFloat(secondsMatch[1]) * 1000))
  }

  return Math.min(kimiRetryMaxMs, kimiRetryBaseMs * Math.pow(2, attempt - 1))
}

function createKimiRequest(messages) {
  return axios.post(server.chat, {
    ...configuration,
    messages,
  }, {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.KIMI_API_KEY
    },
    ...(proxy ? { proxy } : {}),
  })
}

async function postKimiWithRetry(messages) {
  for (let attempt = 0; attempt <= kimiMaxRetries; attempt += 1) {
    try {
      return await createKimiRequest(messages)
    } catch (error) {
      const status = error.response?.status
      if (status !== 429 || attempt >= kimiMaxRetries) throw error

      const delayMs = getRetryDelayMs(error, attempt + 1)
      const detail = sanitizeKimiError(error.response?.data?.error?.message || error.response?.data?.message || error.message)
      console.warn('[kimi] rate limited; retrying in ' + delayMs + 'ms (attempt ' + (attempt + 1) + '/' + kimiMaxRetries + '): ' + detail)
      await sleep(delayMs)
    }
  }
}

export async function getKimiReply(prompt, history = []) {
  try {
    const { historyCount, messages } = buildKimiMessages(prompt, history)
    console.log('[context] sending ' + historyCount + ' history message(s) to Kimi')
    const res = await enqueueKimiRequest(() => postKimiWithRetry(messages))
    const { choices } = res.data
    return choices?.[0]?.message?.content || 'Kimi 没有返回内容，请稍后再试。'
  } catch (error) {
    const status = error.response?.status
    const detail = sanitizeKimiError(error.response?.data?.error?.message || error.response?.data?.message || error.message)
    console.error('Kimi request failed:', status || 'NETWORK_ERROR', detail)
    if (!status) return '无法连接 Kimi API。请检查网络、代理或防火墙。'
    if (status === 401 || status === 403) return 'Kimi API Key 无效或没有权限，请更换有效 Key。'
    if (status === 429) return 'Kimi API 当前访问人数太多，我已经自动重试过了，但还是被限流。请过几秒再发一次。'
    return 'Kimi API 请求失败（HTTP ' + status + '），请查看 PowerShell 日志。'
  }
}
