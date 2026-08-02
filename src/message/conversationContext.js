export function getContactId(contact) {
  return contact ? (typeof contact.id === 'function' ? contact.id() : contact.id) : null
}

export function getMessageContext(msg, bot) {
  const talker = msg.talker()
  const room = msg.room()
  const isRoom = Boolean(room)
  const talkerId = getContactId(talker) || 'unknown'
  const talkerName = typeof talker?.name === 'function' ? talker.name() : talker?.name
  const roomId = isRoom ? getContactId(room) : null
  const isText = msg.type() === bot.Message.Type.Text
  const content = isText ? msg.text() : ''
  const mentionedBot = !isRoom || (typeof msg.mentionSelf === 'function' && msg.mentionSelf() === true)
  return {
    talker, room, isRoom, talkerId, talkerName, roomId,
    conversationId: isRoom ? 'room:' + roomId : 'private:' + talkerId,
    isText, content, mentionedBot, target: isRoom ? room : talker,
  }
}
