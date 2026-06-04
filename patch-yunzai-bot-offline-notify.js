#!/usr/bin/env node
// Patch TRSS-Yunzai OneBotv11 bot_offline owner-notify source to call Done_QQ_test.js mail/group notifier.
// Run from Yunzai root after installing plugins/example/Done_QQ_test.js:
//   node patch-yunzai-bot-offline-notify.js
// This script does not contain SMTP credentials.

import fs from 'node:fs'
import path from 'node:path'

const target = path.join(process.cwd(), 'plugins', 'adapter', 'OneBotv11.js')

if (!fs.existsSync(target)) {
  console.error(`❌ 找不到目标文件：${target}`)
  console.error('请在 TRSS-Yunzai 根目录执行：node patch-yunzai-bot-offline-notify.js')
  process.exit(1)
}

const src = fs.readFileSync(target, 'utf8')
if (src.includes('DoneQQOfflineNotify failed')) {
  console.log('✅ OneBotv11.js 已经接入 DoneQQOfflineNotify，无需重复 patch')
  process.exit(0)
}

const anchor = '          Bot.sendMasterMsg(`[${data.self_id}] ${data.tag || "账号下线"}：${data.message}`)\n          break\n'
const replacement = `          Bot.sendMasterMsg(\`[\${data.self_id}] \${data.tag || "账号下线"}：\${data.message}\`)
          try {
            if (global.DoneQQOfflineNotify) {
              await global.DoneQQOfflineNotify({
                qq: data.self_id,
                reason: \`[\${data.self_id}] \${data.tag || "账号下线"}：\${data.message}\`,
                raw: data,
                bot: data.bot,
              })
            }
          } catch (err) {
            Bot.makeLog("error", \`DoneQQOfflineNotify failed: \${err?.stack || err}\`, data.self_id)
          }
          break
`

if (!src.includes(anchor)) {
  console.error('❌ 未找到预期的 bot_offline 源码锚点。')
  console.error('请检查 plugins/adapter/OneBotv11.js 中是否存在：')
  console.error('  Bot.sendMasterMsg(`[${data.self_id}] ${data.tag || "账号下线"}：${data.message}`)')
  process.exit(2)
}

const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
const backup = `${target}.bak-doneqq-bot-offline-${ts}`
fs.copyFileSync(target, backup)
fs.writeFileSync(target, src.replace(anchor, replacement), 'utf8')

console.log('✅ 已接入 Yunzai 原生 bot_offline 下线通知源头')
console.log(`📦 备份：${backup}`)
console.log('下一步建议执行：')
console.log('  node --check plugins/adapter/OneBotv11.js')
console.log('  重启 Yunzai')
