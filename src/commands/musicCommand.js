function compact(command) {
  return String(command).trim().replace(/[\uFF0C\u3002\uFF01\uFF1F\u3001,.!?\uFF1A:\uFF1B;\s]/gu, '')
}

const musicListCommands = new Set([
  '\u6709\u4ec0\u4e48\u6b4c',
  '\u6709\u4ec0\u4e48\u6b4c\u53ef\u4ee5\u542c',
  '\u6709\u4ec0\u4e48\u6b4c\u80fd\u542c',
  '\u6709\u4ec0\u4e48\u6b4c\u542c',
  '\u6709\u4e9b\u4ec0\u4e48\u6b4c',
  '\u6709\u4ec0\u4e48\u97f3\u4e50\u53ef\u4ee5\u542c',
  '\u6709\u4ec0\u4e48\u97f3\u4e50\u80fd\u542c',
  '\u6709\u5565\u6b4c',
  '\u54ea\u4e9b\u6b4c',
  '\u6709\u54ea\u4e9b\u6b4c',
  '\u6709\u4ec0\u4e48\u6b4c\u66f2',
  '\u6709\u5565\u6b4c\u66f2',
  '\u54ea\u4e9b\u6b4c\u66f2',
  '\u6709\u54ea\u4e9b\u6b4c\u66f2',
  '\u6709\u4ec0\u4e48\u97f3\u4e50',
  '\u6709\u5565\u97f3\u4e50',
  '\u54ea\u4e9b\u97f3\u4e50',
  '\u6709\u54ea\u4e9b\u97f3\u4e50',
  '\u672c\u5730\u6b4c\u66f2',
  '\u672c\u5730\u97f3\u4e50',
  '\u6b4c\u5355',
  '\u6b4c\u66f2\u5217\u8868',
  '\u97f3\u4e50\u5217\u8868',
].map(compact))

export function isMusicListRequest(command) {
  return musicListCommands.has(compact(command))
}

export function formatMusicPlaylist(songs = []) {
  if (!songs.length) return '\u6211\u8fd9\u91cc\u8fd8\u6ca1\u6709\u627e\u5230\u672c\u5730\u6b4c\u66f2\uff0c\u5148\u53bb\u9177\u72d7\u4e0b\u8f7d\u4e00\u4e9b\u5427\uff5e'
  return '\u5b9d\u5b9d\uff0c\u8fd9\u4e9b\u6b4c\u53ef\u4ee5\u542c\u54e6\uff5e\u56de\u590d\u5e8f\u53f7\u5c31\u64ad\u653e\uff1a\n' + songs.map((song, index) => (index + 1) + '. ' + song.name).join('\n')
}

export function parseMusicSelection(command, songs = []) {
  const match = songs.length ? String(command).trim().match(/^(?:\u64ad\u653e\s*)?(?:\u7b2c\s*)?(\d+)\s*(?:\u9996|\u53f7)?$/u) : null
  if (!match) return null
  const index = Number.parseInt(match[1], 10) - 1
  return index >= 0 && index < songs.length ? songs[index] : null
}

const randomMusicCommands = new Set([
  '\u6765\u9996\u6b4c',
  '\u653e\u9996\u6b4c',
  '\u542c\u6b4c',
  '\u653e\u97f3\u4e50',
  '\u6765\u70b9\u97f3\u4e50',
  '\u64ad\u6b4c',
  '\u968f\u673a\u64ad\u653e',
  '\u653e\u4e2a\u6b4c',
  '\u6765\u9996\u97f3\u4e50',
  '\u653e\u4e00\u9996\u6b4c',
  '\u6765\u4e00\u66f2',
  '\u6211\u60f3\u542c\u6b4c',
  '\u6211\u60f3\u542c\u97f3\u4e50',
].map(compact))

const emptyPlaybackCommands = new Set([
  '\u64ad\u653e',
  '\u64ad\u653e\u6b4c\u66f2',
  '\u64ad\u653e\u97f3\u4e50',
  '\u6211\u60f3\u542c',
  '\u6211\u60f3\u542c\u6b4c',
  '\u6211\u60f3\u542c\u97f3\u4e50',
  '\u7ed9\u6211\u653e',
  '\u6765\u4e00\u9996',
  '\u6765\u4e00\u66f2',
].map(compact))

export function matchMusicPlayback(command) {
  const value = String(command).trim().replace(/[\u3002\uFF01\uFF1F!?]+$/u, '')
  const named = value.match(/^(?:\u64ad\u653e|\u6211\u60f3\u542c|\u7ed9\u6211\u653e|\u6765\u4e00\u9996|\u6765\u4e00\u66f2)\s*(?:\u4e00\u9996|\u4e00\u66f2)?\s*(?:\u6b4c\u66f2|\u97f3\u4e50|\u6b4c)?\s*(.+)$/u)
  const normalized = compact(value)
  return {
    named: named || (emptyPlaybackCommands.has(normalized) ? ['', ''] : null),
    random: randomMusicCommands.has(normalized),
  }
}

const musicCountCommands = new Set([
  '\u6709\u591a\u5c11\u9996\u97f3\u4e50',
  '\u6709\u591a\u5c11\u97f3\u4e50',
  '\u591a\u5c11\u9996\u97f3\u4e50',
  '\u591a\u5c11\u97f3\u4e50',
  '\u6709\u591a\u5c11\u9996\u6b4c\u66f2',
  '\u6709\u591a\u5c11\u6b4c\u66f2',
  '\u591a\u5c11\u9996\u6b4c\u66f2',
  '\u591a\u5c11\u6b4c\u66f2',
  '\u6709\u591a\u5c11\u9996\u6b4c',
  '\u6709\u591a\u5c11\u6b4c',
  '\u591a\u5c11\u9996\u6b4c',
  '\u591a\u5c11\u6b4c',
].map(compact))

export function isMusicCountRequest(command) {
  return musicCountCommands.has(compact(command))
}
