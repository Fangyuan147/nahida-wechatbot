import { boundUserIds, roomWhiteList } from '../../config.js'

function valueOf(object, key) {
  if (!object) return ''
  const value = object[key]
  return typeof value === 'function' ? value.call(object) : value
}

export function isBoundUser(talker, expectedIds = boundUserIds) {
  const expected = (Array.isArray(expectedIds) ? expectedIds : [expectedIds])
    .map((identifier) => String(identifier || '').trim())
    .filter(Boolean)
  if (expected.length === 0 || !talker) return false
  const contactId = String(valueOf(talker, 'id') || '').trim()
  return Boolean(contactId) && expected.includes(contactId)
}

export function isBoundPrivateUser(talker, expectedIds = boundUserIds) {
  return isBoundUser(talker, expectedIds)
}

export function getContactId(contact) {
  return contact ? (typeof contact.id === 'function' ? contact.id() : contact.id) : null
}

export function canReply(context, options = {}) {
  if (!context) return false
  const allowedUsers = options.boundUserIds || boundUserIds
  const allowedRooms = options.roomWhiteList || roomWhiteList
  if (context.isRoom) {
    if (!isBoundUser({ id: context.talkerId }, allowedUsers)) return false
  } else if (!isBoundPrivateUser(context.talker || { id: context.talkerId }, allowedUsers)) {
    return false
  }
  if (!context.isRoom) return true
  if (!context.roomId || !allowedRooms.includes(String(context.roomId))) return false
  return context.mentionedBot === true
}
