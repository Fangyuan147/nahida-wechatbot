function errorText(error) {
  if (error == null) return ''
  if (typeof error === 'string') return error
  return [error.message, error.stack, error.data, error.error]
    .filter((value) => value != null)
    .map((value) => typeof value === 'string' ? value : JSON.stringify(value))
    .join('\n')
}

export function isRecoverableWechat4uError(error) {
  const text = errorText(error)
  return /(?:1101|1102)\s*['"]?\s*==\s*0/iu.test(text)
    || /-1\s*['"]?\s*==\s*0/iu.test(text)
    || /(?:batchGetContact|unknownContactId|contactRawPayload|no this\.wechat4u\.contacts)/iu.test(text)
}

export function formatProcessError(error) {
  const text = errorText(error)
  return text || 'unknown error'
}
