jQuery(() => {
    const panel = document.createElement('details');
    panel.innerHTML = '<summary>局域网聊天快传</summary>';
    document.querySelector('#extensions_settings').append(panel);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const body = document.createElement('div');
    body.style.cssText = 'display:grid;gap:.55em;padding:.5em 0;min-width:0';
    panel.append(status, body);
    let currentPeer, revision = 0;
    const context = () => SillyTavern.getContext();
    const label = x => x.card + ' / ' + x.file;

    async function api(op, args = {}) {
        const res = await fetch('/api/plugins/lan-chat/action', {
            method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({ ...args, op }),
        });
        if (!res.headers.get('content-type')?.includes('json')) throw Error('服务端尚未连接');
        const result = await res.json();
        if (!res.ok) throw Error(result.error || '连接失败');
        return result;
    }
    function section(parent, title) {
        const box = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = title;
        box.append(summary);
        parent.append(box);
        return box;
    }
    function action(parent, title, run) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button';
        button.style.cssText = 'width:auto;max-width:100%;margin:.25em 0';
        button.textContent = title;
        parent.append(button);
        button.onclick = async () => {
            button.disabled = true;
            try {
                const result = await run();
                if (result?.message) status.textContent = result.message;
            } catch (error) { status.textContent = error.message; }
            finally { button.disabled = false; }
        };
    }
    function field(parent, title, tag) {
        const row = document.createElement('label');
        const el = document.createElement(tag);
        row.style.display = 'block';
        el.style.cssText = 'display:block;width:100%;min-width:0';
        row.append(title, el);
        parent.append(row);
        return el;
    }
    function choose(parent, title, items, name) {
        const el = field(parent, title, 'select');
        items.forEach((item, i) => el.add(new Option(name(item), String(i))));
        return { el, value: () => items[el.selectedIndex] };
    }
    function pairing(parent, state) {
        const host = section(parent, '在本机生成配对码');
        const output = field(host, '将这段邀请复制到另一台设备（两分钟有效）', 'input');
        output.readOnly = true;
        action(host, '生成邀请', async () => {
            const code = await api('invite');
            output.value = [state.addresses[0], code].filter(Boolean).join(' ');
            output.focus(); output.select();
        });
        const join = section(parent, '输入另一台设备的邀请');
        const invite = field(join, '粘贴邀请', 'input');
        const manual = section(join, '发现设备或手动填地址');
        const addr = field(manual, '对方地址', 'input');
        const results = document.createElement('div'); manual.append(results);
        action(manual, '发现设备', async () => {
            const rows = (await api('discover')).filter(ip => !state.addresses.includes(ip));
            results.replaceChildren();
            rows.forEach(ip => action(results, ip, () => { addr.value = ip; }));
            if (!rows.length) return { message: '未发现设备，可以填写对方地址。' };
        });
        action(join, '配对', async () => {
            const parts = invite.value.trim().split(/\s+/);
            const address = addr.value.trim() || (parts.length === 2 ? parts[0] : '');
            if (!address) { manual.open = true; throw Error('请填写对方地址，或粘贴带地址的完整邀请。'); }
            const [ip, port = '47321'] = address.split(':');
            await api('pair', { ip, port: Number(port), code: parts.at(-1) });
            await refresh();
        });
    }
    function transfer(state) {
        const peers = choose(body, '发送到', state.devices, x => x.ip + ':' + x.port);
        const index = state.devices.findIndex(x => x.id === currentPeer);
        if (index >= 0) peers.el.selectedIndex = index;
        const peer = () => peers.value().id;
        currentPeer = peer();
        action(body, '发送当前聊天', () => {
            const c = context();
            if (c.groupId || !c.characters[c.characterId]?.avatar) throw Error('请先打开一个单角色聊天。');
            return api('send', { peer: peer(), card: c.characters[c.characterId].avatar.replace(/\.png$/, ''), file: c.chatId + '.jsonl' });
        });
        const more = section(body, '其他聊天与设备');
        if (state.chats.length) {
            const local = choose(more, '本机聊天', state.chats, label);
            action(more, '发送所选聊天', () => api('send', { peer: peer(), ...local.value() }));
        }
        const remote = document.createElement('div');
        action(more, '浏览对方聊天', async () => {
            const id = peer(), rows = await api('remote', { peer: id });
            if (id !== peer()) return;
            remote.replaceChildren();
            if (!rows.length) return { message: '对方没有可拉取的聊天。' };
            const chat = choose(remote, '对方聊天', rows, label);
            action(remote, '拉取到收件箱', async () => { await api('pull', { peer: id, ...chat.value() }); await refresh(); });
        });
        more.append(remote);
        peers.el.onchange = () => { currentPeer = peer(); remote.replaceChildren(); };
        pairing(more, state);
        action(more, '解除所选设备配对', async () => {
            if (confirm('解除与所选设备的配对？')) { await api('forget', { peer: peer() }); await refresh(); }
        });
    }
    function receive(state) {
        const box = section(body, '待接收聊天（' + state.inbox.length + '）');
        box.open = true;
        const item = choose(box, '聊天', state.inbox, label);
        const card = choose(box, '保存到角色', state.cards, x => x);
        const advanced = section(box, '覆盖已有存档');
        const dest = field(advanced, '目标存档', 'select');
        function targets() {
            dest.replaceChildren(new Option('新建存档', ''));
            state.chats.filter(x => x.card === card.value()).forEach(x => dest.add(new Option(x.file, x.file)));
        }
        function match() { card.el.selectedIndex = state.cards.indexOf(item.value().card); targets(); }
        item.el.onchange = match; card.el.onchange = targets; match();
        action(box, '保存到酒馆', async () => {
            if (!card.value()) throw Error('请选择本机角色。');
            const replace = advanced.open ? dest.value : '';
            if (replace && !confirm('请先关闭目标聊天。备份并覆盖 ' + replace + '？')) return;
            const result = await api('commit', { id: item.value().id, card: card.value(), replace, confirm: !!replace });
            await refresh(); return result;
        });
        action(advanced, '丢弃所选待接收项', async () => {
            if (confirm('丢弃这份待接收聊天？')) { await api('discard', { id: item.value().id }); await refresh(); }
        });
    }
    async function refresh() {
        const token = ++revision;
        try {
            const state = await api('status');
            if (token !== revision) return;
            body.replaceChildren();
            status.textContent = state.devices.length ? '' : '首次使用，在一台设备生成邀请，在另一台粘贴。';
            if (state.inbox.length) receive(state);
            if (state.devices.length) transfer(state); else pairing(body, state);
            action(body, state.devices.length ? '刷新收件箱' : '检查配对状态', refresh);
        } catch (error) {
            if (token !== revision) return;
            body.replaceChildren();
            status.textContent = error.message + '。请确认本机已安装快传服务端、启用服务端插件并重启酒馆。';
            const link = document.createElement('a');
            link.textContent = '查看安装步骤'; link.target = '_blank'; link.rel = 'noopener';
            link.href = 'https://github.com/SweetKeke/SillyTavern-LAN-Chat#readme';
            body.append(link);
            action(body, '重新检查', refresh);
        }
    }
    panel.ontoggle = () => { if (panel.open) refresh(); };
});
