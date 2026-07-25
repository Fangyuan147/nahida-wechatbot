process.env.BROLOG_LEVEL = process.env.BROLOG_LEVEL || 'error'
console.log('[boot] loading wechat-bot from', process.cwd())
const originalWarn = console.warn.bind(console)
console.warn = (...args) => {
  const message = args.map((a) => String(a)).join(' ')
  if (message.includes('PuppetWechat4u') && message.includes('1101') && message.includes('batchGetContact')) return
  originalWarn(...args)
}
await import('./src/wechaty/index.js')
