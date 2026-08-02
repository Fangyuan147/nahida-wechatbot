const captureCommands = new Set(['\u7eb3\u5b9d\u8bf7\u6536\u7eb3\u6539\u8868\u60c5\u5305', '\u7eb3\u5b9d\u8bf7\u6536\u7eb3\u8be5\u8868\u60c5\u5305'])

export function isStickerCaptureCommand(command) { return captureCommands.has(String(command).trim().replace(/[\u3002\uff01\uff1f!]+$/u, '')) }
export function isIgnoredShortReply(command) { return /^(\u563b\u563b|\u54c8\u54c8|\u563f\u563f|\u5475\u5475|\u55ef\u55ef|\u54e6\u54e6|\u597d\u7684|\u597d\u5427|ok|OK|\u55ef|\u54e6|\u597d|\u884c|\u5bf9|\u662f|\u5583|\u55f7|\u5509|\u8bf6|\u5509|\u5440|\u54df)$/u.test(String(command).trim()) }
export function getCaptureCount(command) { return String(command).match(/^(\d+)\s*[\u5f20\u4e2a]?$/u) }
export function isDeleteAllStickerCommand(command) { return /^(\u5220\u9664\u5168\u90e8\u8868\u60c5\u5305|\u5168\u90e8\u5220\u9664|\u5220\u9664\u6240\u6709\u8868\u60c5\u5305|\u6e05\u7a7a\u8868\u60c5\u5305)[\u3002\uff01!]?$/u.test(command) }
export function isDeleteStickerCommand(command) { return /^(\u5220\u9664\u8868\u60c5\u5305|\u5220\u8864\u60c5\u5305|\u79fb\u9664\u8868\u60c5\u5305)[\u3002\uff01!]?$/u.test(command) }
export function getStickerDeleteIndex(command) { return String(command).match(/^(\d+)$/u) }
export function isStickerCountCommand(command) { return /(?:\u8868\u60c5\u5305.*(?:\u591a\u5c11|\u51e0\u4e2a|\u51e0\u5f20|\u6570\u91cf)|(?:\u591a\u5c11|\u51e0\u4e2a|\u51e0\u5f20|\u6570\u91cf).*\u8868\u60c5\u5305)/u.test(String(command).replace(/[\uff0c\u3002\uff01\uff1f\u3001,.!?\uff1a:\uff1b;\s]/gu, '')) }
export function isSendStickerCommand(command) { return /^(?:\u53d1\u4e2a|\u53d1\u4e00\u5f20|\u53d1\u9001\u4e00\u4e2a|\u53d1\u9001\u4e00\u5f20|\u6765\u4e2a|\u6765\u4e00\u5f20)?\u8868\u60c5\u5305[\u3002\uff01!]?$/u.test(command) }
