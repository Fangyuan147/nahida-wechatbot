export function isClearMemoryCommand(prompt) { return /^(清除|重置|忘记)聊天记忆[。！!]?$/u.test(String(prompt)) }
