import assert from 'node:assert/strict'
import test from 'node:test'
import { isMusicCountRequest, isMusicListRequest, matchMusicPlayback, parseMusicSelection } from './musicCommand.js'

test('keeps ordinary conversation out of music routing', () => {
  for (const prompt of [
    '\u4eca\u5929\u5929\u6c14\u600e\u4e48\u6837',
    '\u6765\u804a\u4f1a\u513f',
    '\u542c\u542c\u6211\u4eca\u5929\u7684\u4e8b',
    '\u6211\u559c\u6b22\u542c\u97f3\u4e50\uff0c\u4f46\u4e0d\u60f3\u64ad\u653e',
    '\u8fd9\u9996\u6b4c\u771f\u597d\u542c',
  ]) {
    assert.equal(isMusicListRequest(prompt), false, prompt)
    assert.equal(isMusicCountRequest(prompt), false, prompt)
    const playback = matchMusicPlayback(prompt)
    assert.equal(playback.named, null, prompt)
    assert.equal(playback.random, false, prompt)
  }
})

test('recognizes only explicit music commands', () => {
  assert.equal(isMusicListRequest('\u6709\u4ec0\u4e48\u6b4c'), true)
  assert.equal(isMusicListRequest('\u6b4c\u5355'), true)
  assert.equal(isMusicCountRequest('\u6709\u591a\u5c11\u9996\u6b4c'), true)
  assert.equal(matchMusicPlayback('\u968f\u673a\u64ad\u653e').random, true)
  assert.equal(matchMusicPlayback('\u64ad\u653e\u5c0f\u534a').named?.[1], '\u5c0f\u534a')
  assert.equal(matchMusicPlayback('\u6211\u60f3\u542c\u6b4c').random, true)
})

test('keeps playlist selection behavior unchanged', () => {
  const songs = [{ name: '\u5c0f\u534a' }, { name: '\u590f\u5929\u7684\u98ce' }]
  assert.equal(parseMusicSelection('1', songs), songs[0])
  assert.equal(parseMusicSelection('\u64ad\u653e\u7b2c2\u9996', songs), songs[1])
  assert.equal(parseMusicSelection('3', songs), null)
})
