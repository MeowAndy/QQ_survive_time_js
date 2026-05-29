// 小凌添加：菲比啾咪存活时间昵称插件
// 功能：每小时、上线后、被戳一戳时，为所有连接到 Yunzai 的 QQ 账号更新昵称。
// 昵称格式：原昵称 | 已啾咪557天12h43分钟
// 起算时间：中国大陆时间 2024-11-11 17:00:00

const START_AT_MS = Date.parse('2024-11-11T17:00:00+08:00')
const SUFFIX_RE = /\s*\|\s*已啾咪\d+天\d+h\d+分钟\s*$/

function formatJiumiDuration (now = Date.now()) {
  const diffMs = Math.max(0, now - START_AT_MS)
  const totalMinutes = Math.floor(diffMs / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return `${days}天${hours}h${minutes}分钟`
}

function stripJiumiSuffix (nickname = '') {
  return String(nickname || '').replace(SUFFIX_RE, '').trim()
}

function getBotList () {
  const list = []
  const seen = new Set()
  for (const rawSelfId of Bot.uin || []) {
    const selfId = String(rawSelfId)
    if (seen.has(selfId)) continue
    seen.add(selfId)
    const bot = Bot[selfId]
    if (!bot) continue
    if (typeof bot.setNickname !== 'function' && typeof bot.setProfile !== 'function') continue
    list.push([selfId, bot])
  }
  return list
}

function resolveBaseNickname (bot, selfId) {
  const live = stripJiumiSuffix(bot?.nickname || bot?.info?.nickname || '')
  if (live) return live
  return `QQ${selfId}`
}

async function setBotNickname (bot, nickname) {
  if (typeof bot.setNickname === 'function') return await bot.setNickname(nickname)
  if (typeof bot.setProfile === 'function') return await bot.setProfile({ nickname })
  throw new Error('当前适配器不支持设置 QQ 昵称')
}

async function updateAllBotNicknames (source = 'manual') {
  const duration = formatJiumiDuration()
  const list = getBotList()
  const results = []

  for (const [selfId, bot] of list) {
    const base = resolveBaseNickname(bot, selfId)
    const nextNickname = `${base} | 已啾咪${duration}`

    if ((bot.__jiumiLastNickname || '') === nextNickname) {
      results.push({ selfId, ok: true, skipped: true, nickname: nextNickname })
      continue
    }

    try {
      await setBotNickname(bot, nextNickname)
      bot.__jiumiLastNickname = nextNickname
      if (bot.info) bot.info.nickname = nextNickname
      logger.mark(`[菲比啾咪昵称] ${source} 更新成功：${selfId} => ${nextNickname}`)
      results.push({ selfId, ok: true, nickname: nextNickname })
    } catch (err) {
      logger.error(`[菲比啾咪昵称] ${source} 更新失败：${selfId} ${err?.message || err}`)
      results.push({ selfId, ok: false, error: err?.message || String(err) })
    }
  }

  return { duration, results }
}

export class feibiJiumiNickname extends plugin {
  constructor () {
    super({
      name: '菲比啾咪存活时间昵称',
      dsc: '每小时和戳一戳时更新所有已连接 QQ 的昵称存活时间',
      event: 'notice.*.poke',
      priority: -9999,
      rule: [
        {
          fnc: 'handlePoke'
        }
      ],
      task: {
        name: '菲比啾咪昵称每小时更新',
        cron: '0 0 * * * *',
        fnc: () => updateAllBotNicknames('hourly')
      }
    })

    if (!globalThis.__feibiJiumiNicknameStartupTimer) {
      // Yunzai 启动/热加载后稍等适配器完成登录，再更新一次。
      globalThis.__feibiJiumiNicknameStartupTimer = setTimeout(() => {
        globalThis.__feibiJiumiNicknameStartupTimer = null
        updateAllBotNicknames('startup').catch(err => {
          logger.error(`[菲比啾咪昵称] 启动更新失败：${err?.message || err}`)
        })
      }, 30000)
    }
  }

  async hourlyUpdate () {
    await updateAllBotNicknames('hourly')
    return true
  }

  async handlePoke (e) {
    const targetId = String(e.target_id || e.user_id || '')
    const selfId = String(e.self_id || '')
    if (!targetId || targetId !== selfId) return false

    const operatorId = String(e.operator_id || e.user_id || '')
    if (operatorId && operatorId === selfId) return false

    const { duration } = await updateAllBotNicknames('poke')
    await e.reply(`啾？菲比已经啾咪${duration}啦～`)
    return true
  }
}


