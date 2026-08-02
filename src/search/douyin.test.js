import assert from 'node:assert/strict'
import test from 'node:test'
import { extractDouyinUrl, readDouyinPage } from './douyin.js'

const sharedText = '2.38 share text https://v.douyin.com/WOBvwXL2dCs/ goQ:/ L@W.ZM'

test('extracts only the Douyin URL from copied sharing text', () => {
  assert.equal(extractDouyinUrl(sharedText), 'https://v.douyin.com/WOBvwXL2dCs/')
})

test('reads summary fields without returning raw page content', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<title>fixture title</title><meta name="description" content="fixture description">', { status: 200 })
  try {
    const page = await readDouyinPage('https://v.douyin.com/WOBvwXL2dCs/')
    assert.equal(page.title, 'fixture title')
    assert.equal(page.description, 'fixture description')
    assert.equal(Object.hasOwn(page, 'html'), false)
  } finally { globalThis.fetch = originalFetch }
})
