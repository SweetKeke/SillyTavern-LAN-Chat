# SillyTavern 局域网聊天快传

在 Windows 与 Android Termux 各自运行酒馆，通过同一 Wi-Fi 手动收发已保存的单角色 JSONL 聊天。无需云服务、插件账户或额外 npm 包。原始聊天内容和元数据随文件传输，外部图片、附件、角色卡和群聊不包含在内。

## 两端安装

1. 退出酒馆，解压安装包。分别将包内的 `plugins/lan-chat` 和 `public/scripts/extensions/third-party/lan-chat` 复制到各自酒馆根目录下的相同位置。目标位置最终应有 `plugins/lan-chat/index.mjs` 与 `public/scripts/extensions/third-party/lan-chat/manifest.json`。Termux 请复制到实际执行 start.sh 的安装目录。
2. 在两端现有 config.yaml 中设置 `enableServerPlugins: true`。保留其余配置。可继续使用酒馆原来的 localhost 地址。
3. 重启两端酒馆，刷新网页，在「扩展设置」中展开「局域网聊天快传」。每次服务重启后须展开一次面板才开始监听。每个实例由一个本机 ST 管理员使用，支持默认单用户实例。
4. 放行专用局域网的 TCP 47321（传输）与 UDP 47322（发现）。双方均需可达。保持 Termux 运行；访客 Wi-Fi 的客户端隔离可能阻止设备互访。

## 配对与收发

- 在手机点「生成配对码」。电脑点「发现设备」，选择与手机面板显示一致的地址；也可直接输入手机显示的 IPv4:端口。在电脑粘贴手机上的完整配对码，点「连接对端」。配对码随机生成，两分钟有效，一次成功即失效。请通过可信渠道传递配对码。
- 配对使用 TLS 1.2 PSK 与 AES-256-GCM，建立配对后使用独立的 256 位随机密钥。设备凭据保存在本地 ST 用户目录的 lan-chat-devices.json。配对设备可以主动列出和读取该用户所有支持的角色聊天。任一端解除后，连接即失效；另一端可手动清除旧条目。地址变化时重新配对。
- 等回复生成并保存完毕，选择对端，点「发送当前存档」，或从本地列表选一条发送。反向取回时点「获取对端列表」，选聊天后点「拉取到收件箱」。发送成功表示已到对端内存收件箱；拉取成功则在本机收件箱。
- 接收端点「刷新设备和收件箱」。按角色卡 PNG 文件名精确匹配，找不到时手动选本机角色。默认新建独立存档。点「保存到酒馆」后重新打开角色的历史聊天列表。
- 覆盖时请先在所有标签页退出目标聊天，避免旧页面随后保存。手动选定目标并确认后，插件将原文件复制到当前用户 backups 目录（lan-chat-随机编号.jsonl），再用临时文件替换目标。备份失败会中止覆盖。恢复时关闭酒馆，将对应备份复制回 chats/角色目录并改回原文件名；可按操作时间定位备份。
- 收件箱最多四份，每份最多 8 MiB；重启会清空待接收记录。请在接收端保存后再关闭酒馆。发现失败可手动指定私网 IPv4；手动地址也连不上时，检查防火墙、网络隔离、对端面板和配对码有效期。TCP 端口冲突时可在启动酒馆前设置环境变量 ST_LAN_CHAT_PORT。

## 接口依据

按官方 release 分支核对：服务端使用 [插件加载器](https://github.com/SillyTavern/SillyTavern/blob/release/src/plugin-loader.js) 提供的 init(router)、info、exit 和 /api/plugins/lan-chat 路由。安装开关见[官方说明](https://docs.sillytavern.app/for-contributors/server-plugins/)。

前端使用 [ST 上下文](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/st-context.js) 的 characters、characterId、chatId 和 getRequestHeaders。服务端按 [角色聊天实现](https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/chats.js) 的 req.user.directories.chats 与头像文件名映射读写 JSONL。插件直接读取已落盘的文件。

## 验证和卸载

在解压目录运行 `node test.mjs`。测试使用临时目录与两个 Node 子进程，通过回环 TCP 的真实 TLS 连接传输，模拟 ST 路由和用户目录。已在 Windows Node 22.13.1 通过首次配对、配对码重放拒绝、远端列表、拉取、推送、新建、覆盖确认和备份字节检查。前端脚本已通过语法检查。

尚未在完整 ST 页面、Android Termux 真机、两台设备的 Wi-Fi 组播或防火墙环境中实测。Termux 的 Node/OpenSSL 需支持 PSK-AES256-GCM-SHA384。首次真机试用可用一份短聊天，在接收端新建后打开，检查首尾消息与分支。

卸载时关闭酒馆，移除以上两个 lan-chat 目录和用户目录中的 lan-chat-devices.json。已导入的聊天和备份可按需保留。

