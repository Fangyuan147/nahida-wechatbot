process.env.BROLOG_LEVEL = process.env.BROLOG_LEVEL || 'error'
console.log('[boot] loading wechat-bot from', process.cwd())
await import('./src/wechaty/index.js')
