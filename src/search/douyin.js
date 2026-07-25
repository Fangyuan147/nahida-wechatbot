const douyinUrlRegex = /https?:\/\/(?:www\.)?(?:douyin\.com|v\.douyin\.com)\/\S+/iu

export function extractDouyinUrl(text = '') {
  const match = String(text).match(douyinUrlRegex)
  return match ? match[0] : null
}

export async function readDouyinPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'follow',
      timeout: 10000,
    })

    if (!response.ok) throw new Error('HTTP ' + response.status)

    const html = await response.text()
    return parseDouyinPage(html, url)
  } catch (error) {
    console.warn('[douyin] fetch failed:', error?.message || error)
    return { title: '', description: '', url }
  }
}

function parseDouyinPage(html, url) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/[&\s]+/g, ' ').trim().slice(0, 200)
    : ''

  let description = ''
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"/i)
  if (descMatch) description = descMatch[1].trim().slice(0, 500)

  return { title, description, url }
}
