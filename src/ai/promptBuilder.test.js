import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChefSearchQuery, buildModePrompt, getLongReplyMode, isChefRequest } from './promptBuilder.js'

test('builds an isolated cooking search query and long-form cooking prompt', () => {
  const prompt = '\u600e\u4e48\u505a\u9ebb\u5a46\u8c46\u8150'
  assert.equal(isChefRequest(prompt), true)
  assert.equal(getLongReplyMode(prompt), 'chef')
  assert.match(buildChefSearchQuery(prompt), /\u83dc\u8c31.*\u505a\u6cd5.*\u98df\u6750.*\u6b65\u9aa4/u)
  assert.match(buildModePrompt(prompt, 'chef'), /\u98df\u6750.*\u7528\u91cf.*\u6b65\u9aa4/u)
})
