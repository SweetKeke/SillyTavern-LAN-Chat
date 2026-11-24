# SillyTavern 聊天接力

电脑聊完点 **发到手机**。看到「已发出」就可以关电脑。手机打开酒馆的 **聊天接力 → 继续聊**，插件找到同名角色卡、导入一份新聊天并打开，随后删除 GitHub 上本次中转的加密草稿。手机也可以发回电脑。原有存档保留。

## 安装或更新

两端都在酒馆「扩展 → 安装扩展」粘贴 `https://github.com/SweetKeke/SillyTavern-LAN-Chat.git`。已经装过就在扩展管理中更新并刷新页面。GitHub 接力只需前端扩展，使用本机 localhost 或 HTTPS 打开酒馆。

<a id="github-setup"></a>
## 第一次连接

1. 电脑上登录 GitHub，[创建私有仓库](https://github.com/new)，例如 `my-chat-inbox`。选择 **Private** 并勾选 **Add README**。这个仓库只给你自己的两台设备中转。公开的插件仓库用于安装和更新代码。
2. [创建细粒度访问令牌](https://github.com/settings/personal-access-tokens/new)。在 **Repository access → Only select repositories** 只选刚建的私有仓库，在 **Repository permissions** 中给 **Contents** 选 **Read and write**。创建并复制令牌。
3. 电脑端「聊天接力 → 我在电脑上」填 `用户名/私有仓库名` 和令牌，点 **连接电脑**。展开 **连接手机 → 显示连接码**。
4. 手机端「聊天接力 → 我在手机上」粘贴连接码，点 **连接手机**。连接码含写入凭据和解密密钥，请通过可信方式复制到你自己的设备。本机浏览器用本地存储记住连接；共享酒馆主机或不受信任的前端扩展可能接触这些凭据。令牌到期时，先接收待领取内容，再重新连接两端。

## 收发

- 两台设备都装好同一角色卡（PNG 文件名一致）。在单角色聊天生成完成、存档保存后发送。
- 手机打开面板会检查新进度，也可点「检查新进度」。有多份时按时间逐份接收。每次导入后打开新存档，手机原有分支会保留。
- 发送端压缩并加密聊天，仅将密文分段写入私有仓库的临时 Release 草稿。接收端导入并打开后删除草稿。普通聊天不会进入 Git 提交历史。待领取草稿可在仓库 Releases 中手动删除，删除会使该次传输无法领取。GitHub 的内部数据清理时间由平台决定。
- 网络中断后可重试。若提示已保存但清理失败，再点「继续聊」。若发送进程被强制关闭，残留的分段可在 Releases 手动清理。每次最多 8 MiB，只传 JSONL，不传图片附件和角色卡。

## 测试范围

`node test-relay.mjs` 通过模拟 GitHub 接口验证分段、加密、方向、错误密钥拒绝、取回与清理。尚未用真实私有仓库和 Termux 手机走完端到端流程。

---

## 可选的局域网模式

以下步骤仅适用于「其他传输方式」里的局域网直传，可离线使用。

## 通过 GitHub 安装（Windows 和 Termux 各做一次）

1. 在酒馆根目录运行下列命令，安装服务端。已手动安装服务端的设备可跳过本步。

   ```sh
   git clone https://github.com/SweetKeke/SillyTavern-LAN-Chat.git plugins/lan-chat
   ```

2. 在 config.yaml 中设置 `enableServerPlugins: true`，重启酒馆。
3. 打开「扩展 → 安装扩展」，粘贴 `https://github.com/SweetKeke/SillyTavern-LAN-Chat.git`，分支留空。刷新后展开「局域网聊天快传」。已手动安装前端的设备可沿用现有前端，避免出现两个面板。

仓库已公开，可直接使用上面的安装链接。如果酒馆无法连接 GitHub，可下载 ZIP 按下方方式手动安装。

## 手动安装

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



