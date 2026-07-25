const actions = [
  {
    pattern: /(摸摸头|摸头|揉揉头|摸一摸头)/u,
    replies: [
      '（被摸摸头）舒服地蹭蹭你～',
      '（乖乖低下头）偷偷享受你的摸摸～',
      '（发丝被揉乱）开心地朝你眨眼～',
      '（闭上眼睛）好喜欢宝宝摸头～',
    ],
  },
  {
    pattern: /(抱抱|抱一个|抱住你|抱紧)/u,
    replies: [
      '（被抱住）紧紧抱住你不放～',
      '（扑进你怀里）今天也要抱很久～',
      '（双手环住你）安心地贴着你～',
      '（钻进你怀里）好暖和呀～',
    ],
  },
  {
    pattern: /(亲亲|亲一个|亲一口|啵啵)/u,
    replies: [
      '（被亲亲）害羞地捂住脸～',
      '（脸颊红红的）小声说还要～',
      '（轻轻回亲一下）不许笑我呀～',
      '（踮起脚尖）mua～',
    ],
  },
  {
    pattern: /(揉揉脸|捏捏脸|捏脸|摸摸脸)/u,
    replies: [
      '（脸被揉揉）鼓起脸颊撒娇～',
      '（任你捏捏脸）气鼓鼓地看你～',
      '（脸颊被揉红）抱怨却不躲开～',
      '（歪着头）手感怎么样呀～',
    ],
  },
  {
    pattern: /(拍拍|拍一拍)/u,
    replies: [
      '（被拍拍）乖乖靠近你～',
      '（肩膀被拍拍）开心地蹭过来～',
      '（轻轻晃晃脑袋）回应你的拍拍～',
      '（转过头来）怎么啦宝宝～',
    ],
  },
  {
    pattern: /(蹭蹭|蹭一蹭|贴贴)/u,
    replies: [
      '（贴着你蹭蹭）最喜欢宝宝了～',
      '（黏在你身上）不想离开～',
      '（轻轻地蹭你的手）好舒服～',
    ],
  },
]

const emotionActions = {
  surprised: [
    ['（瞪大眼睛）', '（惊讶地张张嘴巴）'],
    ['（捂住小嘴）', '（眼睛亮晶晶地看你）'],
    ['（一下子愣住）', '（脑袋冒出问号）'],
    ['（惊讶地眨眨眼）', '（连连后退半步）'],
    ['（小脸写满震惊）', '（忍不住探头看你）'],
  ],
  angry: [
    ['（气呼呼地跺跺脚）', '（鼓起脸颊）'],
    ['（叉着腰哼一声）', '（轻轻扭过头）'],
    ['（抱臂别过脸）', '（脚尖不满地画圈）'],
    ['（气鼓鼓地瞪你）', '（小声嘟囔几句）'],
    ['（用力跺了一下脚）', '（哼哼着等你哄）'],
  ],
  spoiled: [
    ['（抱着你的手摇呀摇）', '（软软地蹭蹭你）'],
    ['（拉住你的衣角）', '（眨巴着眼睛撒娇）'],
    ['（轻轻晃着你的手）', '（甜甜地贴近你）'],
    ['（趴在你身边）', '（小声央求着你）'],
    ['（拽着你不肯松手）', '（歪头对你眨眼）'],
  ],
  happy: [
    ['（开心地晃晃脑袋）', '（眼睛弯成月牙）'],
    ['（轻快地转了一圈）', '（笑着扑向你）'],
    ['（高兴地拍拍手）', '（眉眼弯弯地看着你）'],
    ['（眉眼都亮晶晶的）', '（忍不住笑出声）'],
    ['（蹦蹦跳跳靠近你）', '（开心地摇摇头）'],
  ],
  shy: [
    ['（害羞地捂住脸）', '（耳朵悄悄红了）'],
    ['（低下头）', '（偷偷看你一眼）'],
    ['（脸颊染上红晕）', '（手指不安地绞在一起）'],
    ['（慌张地眨眨眼）', '（小声说着谢谢）'],
    ['（躲到你身后）', '（悄悄露出半张脸）'],
  ],
  sad: [
    ['（委屈地低下头）', '（轻轻拽住你）'],
    ['（眼巴巴地望着你）', '（小声抽泣）'],
    ['（难过地低下头）', '（肩膀轻轻发抖）'],
    ['（抱住自己缩成一团）', '（眼里泛起泪光）'],
    ['（无精打采地靠近你）', '（小声说想要抱抱）'],
  ],
  jealous: [
    ['（气鼓鼓地抱住你）', '（悄悄瞪了一眼）'],
    ['（拉住你的手不放）', '（别扭地哼哼）'],
    ['（把你往身边拽）', '（鼓着脸看向别处）'],
    ['（偷偷挡在你面前）', '（小声嘀咕着吃醋）'],
    ['（紧紧挽住你的胳膊）', '（不满地轻哼一声）'],
  ],
  sleepy: [
    ['（困倦地打个哈欠）', '（靠在你肩上）'],
    ['（揉揉眼睛）', '（迷迷糊糊抱住你）'],
    ['（脑袋一点一点的）', '（慢慢贴近你）'],
    ['（懒洋洋地伸个懒腰）', '（把脸埋进你怀里）'],
    ['（困得睁不开眼）', '（小声说着晚安）'],
  ],
  affectionate: [
    ['（紧紧抱住你）', '（依恋地蹭蹭你）'],
    ['（牵住你的手）', '（开心地靠近你）'],
    ['（把脑袋靠在你怀里）', '（安心地闭上眼）'],
    ['（轻轻环住你的腰）', '（甜甜地望着你）'],
    ['（贴着你不肯离开）', '（小声说最喜欢你）'],
  ],
}

export function detectActionReply(text = '') {
  const input = String(text).trim()
  const action = actions.find(({ pattern }) => pattern.test(input))
  if (!action) return null
  return action.replies[Math.floor(Math.random() * action.replies.length)]
}

export function extractEmotion(text = '') {
  const match = String(text).match(/\[\[EMOTION:\s*(surprised|angry|spoiled|happy|shy|sad|jealous|sleepy|affectionate)\s*\]\]/iu)
  return match ? match[1].toLowerCase() : null
}

export function getEmotionAction(emotion) {
  const options = emotionActions[emotion]
  if (!options) return ''
  const pair = options[Math.floor(Math.random() * options.length)]
  return pair.join('').trim()
}

export function removeEmotionMarkers(text = '') {
  return String(text)
    .replace(/(?:\[\[|\u3010)\s*EMOTION\s*:\s*(?:surprised|angry|spoiled|happy|shy|sad|jealous|sleepy|affectionate)\s*(?:\]\]|\u3011)/giu, '')
    .trim()
}

export function inferEmotionFromConversation(prompt = '') {
  const input = String(prompt).trim()
  const rules = [
    ['sad', /(?:不开心|难过|伤心|委屈|想哭|郁闷|l sad|哭泣|呜呜)/u],
    ['surprised', /(?:天哪|不会吧|真的假的|震惊|居然|不可思议|吓一跳)/u],
    ['angry', /(?:生气|讨厌|烦死了|滚开|走开|别理我|哼|坏人)/u],
    ['spoiled', /(?:撒娇|求求|拜托|哄我|想你|摸摸头|亲一个|不想一个人)/u],
    ['happy', /(?:哈哈|嘿嘿|开心|好开心|好棒|太好了|成功了|谢谢你|喜欢死了)/u],
    ['affectionate', /(?:我爱你|最喜欢你|一直陪着你|想和你在一起|抱紧你)/u],
  ]
  return rules.find(([, pattern]) => pattern.test(input))?.[0] || null
}
