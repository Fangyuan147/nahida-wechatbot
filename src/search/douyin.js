const douyinUrlRegex = /https?:\/\/(?:www\.|m\.|v\.)?(?:douyin\.com|iesdouyin\.com)\/[^\s<>]+/iu
const trimUrlPattern = /[。，、；：！？!?）)】》】]+$/u
const requestTimeoutMs = 15000
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://www.douyin.com/',
}

export function extractDouyinUrl(text = '') {
  const match = String(text).match(douyinUrlRegex)
  return match ? match[0].replace(trimUrlPattern, '') : null
}

async function fetchText(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(url, {
      headers: browserHeaders,
      redirect: 'manual',
      signal: controller.signal,
      ...options,
    })
    return { response, html: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

function getRedirectUrl(response, html) {
  const location = response.headers.get('location')
  if (location) return new URL(location, response.url).toString()
  const metaRefresh = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]+;\s*url=([^"']+)/iu)
  return metaRefresh ? new URL(metaRefresh[1], response.url).toString() : null
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400
}

export async function readDouyinPage(url) {
  let html = ''
  try {
    const first = await fetchText(url)
    html = first.html
    let pageUrl = first.response.url || url
    const redirectUrl = getRedirectUrl(first.response, first.html)
    if (isRedirectStatus(first.response.status) && redirectUrl) pageUrl = redirectUrl

    // The iesdouyin share page exposes server-rendered metadata more reliably.
    if (redirectUrl && /(?:v\.|www\.)?douyin\.com|iesdouyin\.com/iu.test(redirectUrl)) {
      const second = await fetchText(redirectUrl)
      html = second.html
      pageUrl = second.response.url || redirectUrl
    } else if (first.response.status >= 400) {
      throw new Error('HTTP ' + first.response.status)
    }

    const parsed = parseDouyinPage(html, pageUrl)
    if (!parsed.title && !parsed.description) throw new Error('页面没有可读取的标题或简介')
    return parsed
  } catch (error) {
    console.warn('[douyin] fetch failed:', error?.message || error)
    throw new Error('抖音页面暂时无法读取，请确认链接仍然有效。', { cause: error })
  } finally {
    // The raw page is request-scoped and is never returned or persisted.
    html = ''
  }
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
}

function cleanText(value = '', maxLength = 500) {
  return decodeHtmlEntities(String(value))
    .replace(/\\u002F/giu, '/')
    .replace(/\\u0026/giu, '&')
    .replace(/\\n/giu, ' ')
    .replace(/<[^>]+>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength)
}

function parseDouyinPage(html, url) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)
  const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/iu)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/iu)
  const embeddedDescMatch = html.match(/"desc"\s*:\s*"((?:\\.|[^"\\])*)"/iu)
  const title = cleanText(titleMatch?.[1] || '')
  const description = cleanText(descriptionMatch?.[1] || embeddedDescMatch?.[1] || '')
  return { title, description, url }
}
