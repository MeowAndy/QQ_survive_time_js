// Done_QQ_test.js
// Yunzai 插件：订阅 QQ 掉线通知，触发掉线时发送邮件 + 群通知
//
// 指令：
//   #订阅掉线 QQ [QQ邮箱]
//   #取消订阅掉线 QQ
//   #掉线订阅列表
//
// 行为：
// - 在群里执行 #订阅掉线，会把“当前群”加入该 QQ 的掉线通知群。
// - 私聊执行 #订阅掉线，只订阅邮件，不绑定群。
// - 邮箱不写时默认 QQ@qq.com。
// - 当监听到 Yunzai/NapCat/OneBot 的掉线/断开/登录失效类事件时：
//   1) 发邮件给订阅邮箱；
//   2) 给所有订阅群发送“xxx号掉线了”的群通知。
//
// 注意：不同 Yunzai/NapCat 版本掉线事件字段不同，本插件兼容多种字段。
// 若你的 Yunzai 已有“发给主人掉线通知”的源码函数，最稳方案是把 sendOfflineNotifications(info)
// 插入到那条给主人通知的逻辑旁边；本文件也保留 notice 事件监听兜底。
//
// 邮件依赖：npm i nodemailer
// SMTP 环境变量：
//   YZ_OFFLINE_MAIL_HOST=smtp.qq.com
//   YZ_OFFLINE_MAIL_PORT=465
//   YZ_OFFLINE_MAIL_SECURE=true
//   YZ_OFFLINE_MAIL_USER=发件QQ邮箱@qq.com
//   YZ_OFFLINE_MAIL_PASS=QQ邮箱SMTP授权码
//   YZ_OFFLINE_MAIL_FROM=掉线通知 <发件QQ邮箱@qq.com>

import fs from 'fs'
import path from 'path'

const PLUGIN_NAME = 'QQ掉线邮件群通知'
const DATA_DIR = path.join(process.cwd(), 'plugins', 'data')
const DATA_FILE = path.join(DATA_DIR, 'done_qq_offline_subscriptions.json')

function ensureDataFile () {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ subscriptions: {} }, null, 2))
}

function loadData () {
  ensureDataFile()
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    if (!data.subscriptions || typeof data.subscriptions !== 'object') data.subscriptions = {}
    return data
  } catch (err) {
    logger?.error?.(`[${PLUGIN_NAME}] 读取订阅配置失败：${err.message}`)
    return { subscriptions: {} }
  }
}

function saveData (data) {
  ensureDataFile()
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function normalizeQQ (value) {
  const qq = String(value || '').trim()
  return /^\d{5,12}$/.test(qq) ? qq : ''
}

function normalizeEmail (value, qq) {
  const email = String(value || '').trim() || `${qq}@qq.com`
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return email
}

function getAtQQList (e) {
  const list = []
  const add = (v) => {
    const qq = normalizeQQ(v)
    if (qq && !list.includes(qq)) list.push(qq)
  }
  if (Array.isArray(e?.at_list)) e.at_list.forEach(add)
  if (e?.at) add(e.at)
  const raw = String(e?.msg || e?.message || '')
  const matches = raw.match(/@(?:(\d{5,12})|\[CQ:at,qq=(\d{5,12})\])/g) || []
  for (const item of matches) {
    const m = item.match(/(\d{5,12})/)
    if (m) add(m[1])
  }
  return list
}

function resolveRecipientEmail (e, qq, explicit) {
  const email = String(explicit || '').trim()
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email
  if (email && /^\d{5,12}$/.test(email)) return `${email}@qq.com`
  const atQQ = getAtQQList(e)[0]
  if (atQQ) return `${atQQ}@qq.com`
  return `${qq}@qq.com`
}

function getGroupId (e) {
  return String(e?.group_id || e?.group?.group_id || e?.group?.gid || e?.raw?.group_id || '').trim()
}

function getOperatorId (e) {
  return String(e?.user_id || e?.sender?.user_id || e?.raw?.user_id || '')
}

function buildOfflineText ({ qq, reason, timeText }) {
  return [
    `⚠️ QQ 掉线通知`,
    `监控账号：${qq}`,
    `掉线时间：${timeText}`,
    `掉线原因：${reason || '检测到账号下线/连接断开'}`,
    ``,
    `请及时检查 NapCat / QQ 登录状态。`
  ].join('\n')
}

function safeJson (obj) {
  try {
    const clone = JSON.parse(JSON.stringify(obj || {}))
    const picked = {}
    for (const key of ['post_type', 'notice_type', 'sub_type', 'self_id', 'user_id', 'bot_id', 'message', 'msg', 'reason', 'status', 'time']) {
      if (clone[key] !== undefined) picked[key] = clone[key]
    }
    return JSON.stringify(picked, null, 2)
  } catch {
    return String(obj || '')
  }
}

async function getMailer () {
  let nodemailer
  try {
    nodemailer = (await import('nodemailer')).default
  } catch (err) {
    throw new Error('缺少 nodemailer，请在 Yunzai 目录执行：npm i nodemailer')
  }

  const host = process.env.YZ_OFFLINE_MAIL_HOST || process.env.SMTP_HOST || 'smtp.qq.com'
  const port = Number(process.env.YZ_OFFLINE_MAIL_PORT || process.env.SMTP_PORT || 465)
  const secureRaw = String(process.env.YZ_OFFLINE_MAIL_SECURE || process.env.SMTP_SECURE || 'true').toLowerCase()
  const secure = secureRaw === 'true' || secureRaw === '1' || port === 465
  const user = process.env.YZ_OFFLINE_MAIL_USER || process.env.SMTP_USER
  const pass = process.env.YZ_OFFLINE_MAIL_PASS || process.env.SMTP_PASS

  if (!user || !pass) {
    throw new Error('SMTP 未配置：请设置 YZ_OFFLINE_MAIL_USER / YZ_OFFLINE_MAIL_PASS')
  }

  return nodemailer.createTransport({ host, port, secure, auth: { user, pass }, tls: { rejectUnauthorized: false } })
}

async function sendOfflineMail ({ qq, email, reason, event }) {
  const mailer = await getMailer()
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const fromUser = process.env.YZ_OFFLINE_MAIL_USER || process.env.SMTP_USER
  const from = process.env.YZ_OFFLINE_MAIL_FROM || process.env.SMTP_FROM || fromUser
  const subject = `QQ 掉线通知：${qq}`
  const text = `${buildOfflineText({ qq, reason, timeText: now })}\n\n原始事件摘要：\n${safeJson(event)}`
  const html = `
  <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7">
    <h2>⚠️ QQ 掉线通知</h2>
    <p><b>监控账号：</b>${qq}</p>
    <p><b>掉线时间：</b>${now}</p>
    <p><b>掉线原因：</b>${reason || '检测到账号下线/连接断开'}</p>
    <p>请及时检查 NapCat / QQ 登录状态。</p>
    <hr>
    <pre style="white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:8px">${safeJson(event)}</pre>
  </div>`
  await mailer.sendMail({ from, to: email, subject, text, html })
}

async function sendTestMail ({ qq, email }) {
  const mailer = await getMailer()
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const fromUser = process.env.YZ_OFFLINE_MAIL_USER || process.env.SMTP_USER
  const from = process.env.YZ_OFFLINE_MAIL_FROM || process.env.SMTP_FROM || fromUser
  const subject = `QQ 掉线测试邮件：${qq}`
  const text = [
    '这是一封测试邮件。',
    `监控账号：${qq}`,
    `发送时间：${now}`,
    '如果你能收到，说明 SMTP 和订阅邮箱链路正常。'
  ].join('
')
  const html = `
  <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7">
    <h2>🧪 QQ 掉线测试邮件</h2>
    <p><b>监控账号：</b>${qq}</p>
    <p><b>发送时间：</b>${now}</p>
    <p>如果你能收到，说明 SMTP 和订阅邮箱链路正常。</p>
  </div>`
  await mailer.sendMail({ from, to: email, subject, text, html })
}

async function sendGroupMsgByAnyBot (groupId, msg, preferredBot) {
  const gid = String(groupId || '')
  if (!gid) return false

  const candidates = []
  if (preferredBot) candidates.push(preferredBot)
  if (global.Bot && typeof global.Bot === 'object') {
    for (const bot of Object.values(global.Bot)) candidates.push(bot)
  }

  for (const bot of candidates) {
    try {
      if (!bot) continue
      if (typeof bot.pickGroup === 'function') {
        await bot.pickGroup(gid).sendMsg(msg)
        return true
      }
      if (typeof bot.sendGroupMsg === 'function') {
        await bot.sendGroupMsg(gid, msg)
        return true
      }
    } catch (err) {
      logger?.debug?.(`[${PLUGIN_NAME}] 尝试群 ${gid} 通知失败：${err.message}`)
    }
  }
  return false
}

function extractOfflineInfo (e) {
  const raw = e?.raw || e?.event || e || {}
  const text = JSON.stringify(raw).toLowerCase()

  const selfId = raw.self_id || raw.selfId || raw.bot_id || raw.botId || e?.self_id || e?.selfId || e?.bot?.uin || e?.bot?.self_id
  const userId = raw.user_id || raw.userId || e?.user_id || e?.userId
  const qq = normalizeQQ(selfId || userId)

  const notice = String(raw.notice_type || raw.noticeType || raw.post_type || raw.postType || e?.notice_type || '').toLowerCase()
  const sub = String(raw.sub_type || raw.subType || raw.event_name || raw.eventName || e?.sub_type || '').toLowerCase()
  const msg = String(raw.message || raw.msg || raw.reason || raw.status || e?.message || '').toLowerCase()

  const offlineWords = ['offline', 'disconnect', 'disconnected', 'logout', 'login_expired', '掉线', '下线', '断开', '登录失效', '连接断开']
  const isOffline = offlineWords.some(w => text.includes(w.toLowerCase()) || notice.includes(w.toLowerCase()) || sub.includes(w.toLowerCase()) || msg.includes(w.toLowerCase()))

  if (!isOffline || !qq) return null

  return {
    qq,
    reason: raw.reason || raw.message || raw.msg || raw.status || raw.sub_type || raw.notice_type || '检测到掉线/断开事件',
    raw,
    bot: e?.bot
  }
}

async function sendOfflineNotifications (info) {
  const data = loadData()
  const sub = data.subscriptions[info.qq]
  if (!sub) return false

  const key = `${info.qq}:${Math.floor(Date.now() / 60000)}`
  global.__doneQQOfflineNotifyDedup ||= new Set()
  if (global.__doneQQOfflineNotifyDedup.has(key)) return false
  global.__doneQQOfflineNotifyDedup.add(key)
  setTimeout(() => global.__doneQQOfflineNotifyDedup?.delete(key), 10 * 60 * 1000)

  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const groupText = `⚠️ ${info.qq} 号掉线了\n时间：${now}\n原因：${info.reason || '检测到账号下线/连接断开'}`

  if (sub.email) {
    try {
      await sendOfflineMail({ qq: info.qq, email: sub.email, reason: info.reason, event: info.raw })
      logger?.mark?.(`[${PLUGIN_NAME}] 已发送 QQ ${info.qq} 掉线邮件到 ${sub.email}`)
    } catch (err) {
      logger?.error?.(`[${PLUGIN_NAME}] 发送掉线邮件失败：${err.stack || err.message}`)
    }
  }

  const groups = Array.isArray(sub.groups) ? sub.groups : []
  for (const groupId of groups) {
    const ok = await sendGroupMsgByAnyBot(groupId, groupText, info.bot)
    if (ok) logger?.mark?.(`[${PLUGIN_NAME}] 已发送 QQ ${info.qq} 掉线群通知到 ${groupId}`)
    else logger?.warn?.(`[${PLUGIN_NAME}] 群 ${groupId} 通知发送失败：没有可用 Bot`)
  }

  return true
}

export class DoneQQOfflineMail extends plugin {
  constructor () {
    super({
      name: PLUGIN_NAME,
      dsc: '订阅 QQ 掉线通知并发送邮件/群通知',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#?订阅掉线\\s+(\\d{5,12})(?:\\s+([^\\s]+@[^\\s]+))?$', fnc: 'subscribeOffline' },
        { reg: '^#?取消订阅掉线\\s+(\\d{5,12})$', fnc: 'unsubscribeOffline' },
        { reg: '^#?订阅掉线测试$', fnc: 'testOfflineSubscriptions' },
        { reg: '^#?掉线订阅列表$', fnc: 'listOfflineSubscriptions' }
      ]
    })
  }

  async subscribeOffline (e) {
    const match = e.msg?.match(/^#?订阅掉线\s+(\d{5,12})(?:\s+(.+))?$/)
    const qq = normalizeQQ(match?.[1])
    const email = resolveRecipientEmail(e, qq, match?.[2])
    const groupId = getGroupId(e)

    if (!qq) return e.reply('❌ QQ 号格式不正确')
    if (!email) return e.reply('❌ 邮箱格式不正确')

    const data = loadData()
    const old = data.subscriptions[qq] || {}
    const groups = Array.isArray(old.groups) ? old.groups.map(String) : []
    if (groupId && !groups.includes(groupId)) groups.push(groupId)

    data.subscriptions[qq] = {
      email,
      groups,
      updatedAt: new Date().toISOString(),
      operator: getOperatorId(e)
    }
    saveData(data)

    const groupLine = groupId ? `\n👥 当前群已订阅：${groupId}` : '\n👥 当前是私聊，未绑定群通知'
    return e.reply(`✅ 已订阅 QQ ${qq} 的掉线通知\n📮 收件邮箱：${email}${groupLine}`)
  }

  async testOfflineSubscriptions (e) {
    const data = loadData()
    const entries = Object.entries(data.subscriptions)
    if (!entries.length) return e.reply('当前没有掉线通知订阅，无法测试。')

    const results = []
    for (const [qq, item] of entries) {
      if (!item?.email) {
        results.push(`${qq}: 未设置邮箱，跳过`)
        continue
      }
      try {
        await sendTestMail({ qq, email: item.email })
        results.push(`${qq}: 已发送到 ${item.email}`)
      } catch (err) {
        results.push(`${qq}: 失败 - ${err.message}`)
      }
    }
    return e.reply(`🧪 掉线测试邮件已执行：
${results.join('
')}`)
  }

  async unsubscribeOffline (e) {
    const match = e.msg?.match(/^#?取消订阅掉线\s+(\d{5,12})$/)
    const qq = normalizeQQ(match?.[1])
    const groupId = getGroupId(e)
    if (!qq) return e.reply('❌ QQ 号格式不正确')

    const data = loadData()
    const sub = data.subscriptions[qq]
    if (!sub) return e.reply(`ℹ️ QQ ${qq} 当前没有订阅`)

    if (groupId && Array.isArray(sub.groups) && sub.groups.includes(groupId)) {
      sub.groups = sub.groups.filter(g => String(g) !== groupId)
      if (!sub.email && !sub.groups.length) delete data.subscriptions[qq]
      else data.subscriptions[qq] = sub
      saveData(data)
      return e.reply(`✅ 已取消 QQ ${qq} 在当前群的掉线通知`)
    }

    delete data.subscriptions[qq]
    saveData(data)
    return e.reply(`✅ 已取消 QQ ${qq} 的全部掉线通知订阅`)
  }

  async listOfflineSubscriptions (e) {
    const data = loadData()
    const entries = Object.entries(data.subscriptions)
    if (!entries.length) return e.reply('当前没有掉线通知订阅。')
    const lines = entries.map(([qq, item]) => `${qq} -> 邮箱：${item.email || '未设置'}；群：${(item.groups || []).join(', ') || '无'}`)
    return e.reply(`📮 掉线通知订阅列表：\n${lines.join('\n')}`)
  }
}

export class DoneQQOfflineMailNotice extends plugin {
  constructor () {
    super({
      name: `${PLUGIN_NAME}-事件监听`,
      dsc: '监听 OneBot/NapCat 掉线事件并发邮件/群通知',
      event: 'notice',
      priority: 1,
      rule: [
        { reg: '.*', fnc: 'handleNotice' }
      ]
    })
  }

  async handleNotice (e) {
    const info = extractOfflineInfo(e)
    if (!info) return false
    await sendOfflineNotifications(info)
    return false
  }
}

// 如果后续要接到 Yunzai 已有“发给主人掉线通知”的源码里，可调用：
// await global.DoneQQOfflineNotify({ qq: '123456789', reason: 'NapCat 已断开', raw: event, bot })
global.DoneQQOfflineNotify = async function (payload) {
  const qq = normalizeQQ(payload?.qq || payload?.self_id || payload?.selfId)
  if (!qq) return false
  return sendOfflineNotifications({
    qq,
    reason: payload?.reason || '检测到账号下线/连接断开',
    raw: payload?.raw || payload,
    bot: payload?.bot
  })
}
