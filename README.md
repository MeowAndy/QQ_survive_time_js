# 菲比啾咪存活时间昵称 Yunzai 插件

一个 TRSS-Yunzai / Yunzai JS 小插件：每小时自动把所有已连接到 Yunzai 的 QQ 机器人昵称追加“存活/啾咪时间”，并在别人戳一戳机器人时立即更新昵称并回复。

## 效果

如果当前 QQ 昵称是：

```text
菲比
```

插件会自动改成：

```text
菲比 | 已啾咪557天12h43分钟
```

别人戳一戳机器人时回复：

```text
啾？菲比已经啾咪557天12h43分钟啦～
```

> 时间从中国大陆时间 `2024-11-11 17:00:00` 开始计算。

## 功能

- 保留原昵称，只维护末尾的 ` | 已啾咪X天YhZ分钟` 后缀。
- 每小时整点自动更新一次昵称。
- Yunzai 启动/热加载后自动更新一次。
- 被戳一戳时立即更新并回复。
- 支持所有已连接到当前 Yunzai 的 QQ 机器人账号。
- 支持常见 OneBotv11/NapCat 适配器的 `set_qq_profile` 昵称修改能力。

## 安装

把 `feibi-jiumi-nickname.js` 放到 Yunzai 的：

```text
plugins/other/feibi-jiumi-nickname.js
```

然后重启 Yunzai：

```bash
cd /root/Yunzai
node .
```

如果你用 tmux：

```bash
tmux new-session -d -s yz 'cd /root/Yunzai && node .'
```

## 修改起算时间

打开 JS 文件，修改：

```js
const START_AT_MS = Date.parse('2024-11-11T17:00:00+08:00')
```

这里的 `+08:00` 表示中国大陆时区。

## 修改昵称后缀文案

默认格式在这里：

```js
const nextNickname = `${base} | 已啾咪${duration}`
```

默认回复在这里：

```js
await e.reply(`啾？菲比已经啾咪${duration}啦～`)
```

按需修改即可。

## 注意事项

1. QQ 昵称修改可能受 QQ/NapCat/协议端风控限制，过于频繁可能失败，所以默认只每小时更新一次。
2. 插件不会删除原昵称，只会替换旧的 `已啾咪...` 后缀。
3. 如果你有多个 QQ 账号连接到同一个 Yunzai，插件会逐个更新。
4. 如果适配器不支持 `setNickname` 或 `setProfile`，该账号会跳过。

## 文件

- `feibi-jiumi-nickname.js`：插件本体。

---

# QQ 掉线邮件群通知插件

仓库内另包含：

- `Done_QQ_test.js`：订阅 QQ 掉线通知，掉线时发送邮件 + 群通知。
- `patch-yunzai-bot-offline-notify.js`：把 TRSS-Yunzai 原生 `bot_offline` 下线通知源头接入 `Done_QQ_test.js` 的邮件/群通知函数。

## 安装掉线通知插件

把插件放到 Yunzai：

```bash
cp Done_QQ_test.js /root/Yunzai/plugins/example/Done_QQ_test.js
cd /root/Yunzai
pnpm add nodemailer
```

SMTP 不建议写进公开仓库。生产环境请用环境变量配置：

```bash
export YZ_OFFLINE_MAIL_HOST=smtp.qq.com
export YZ_OFFLINE_MAIL_PORT=465
export YZ_OFFLINE_MAIL_SECURE=true
export YZ_OFFLINE_MAIL_USER=发件邮箱@qq.com
export YZ_OFFLINE_MAIL_PASS=邮箱 SMTP 授权码
export YZ_OFFLINE_MAIL_FROM='掉线通知 <发件邮箱@qq.com>'
```

## 指令

默认仓库版使用 `#` 前缀：

```text
#订阅掉线帮助
#订阅掉线 QQ [邮箱/@QQ]
#取消订阅掉线 QQ
#订阅掉线测试
#订阅掉线列表
```

权限：

- 非主人也可以使用：`#订阅掉线 QQ [邮箱/@QQ]`、`#取消订阅掉线 QQ`
- 仅主人可用：`#订阅掉线测试`、`#订阅掉线列表`
- 帮助所有人可看：`#订阅掉线帮助`

> 如果要做多实例区分，例如菲比用 `#`、凌阳用 `%`，请只在目标服务器本地修改指令前缀，不要把本地私有变体推到仓库。

## 接入 Yunzai 原生下线通知源头

仅安装插件后，插件可以通过 notice / 文本兜底捕获部分掉线事件；但更稳的方式是接入 TRSS-Yunzai 原生 `bot_offline` 逻辑，也就是 Yunzai 自己给主人发送：

```text
[QQ号] 下线通知：你的帐号当前登录已失效，请重新登录。
```

或“账号已在另一台终端登录”等提示的源码位置。

在 Yunzai 根目录执行：

```bash
cp patch-yunzai-bot-offline-notify.js /root/Yunzai/patch-yunzai-bot-offline-notify.js
cd /root/Yunzai
node patch-yunzai-bot-offline-notify.js
node --check plugins/adapter/OneBotv11.js
```

然后重启 Yunzai。

这个补丁会修改：

```text
plugins/adapter/OneBotv11.js
```

在 `case "bot_offline"` 的 `Bot.sendMasterMsg(...)` 旁边调用：

```js
global.DoneQQOfflineNotify({ qq, reason, raw, bot })
```

这样 Yunzai 原生识别到账号下线 / 登录失效 / 异地登录时，会在通知主人的同时触发邮件和群通知。

补丁脚本会自动备份原文件，备份名类似：

```text
plugins/adapter/OneBotv11.js.bak-doneqq-bot-offline-YYYYMMDDHHMMSS
```
