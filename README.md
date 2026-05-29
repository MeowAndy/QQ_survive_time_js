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
