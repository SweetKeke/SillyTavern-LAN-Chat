import { mountRelay } from './handoff.mjs';
jQuery(() => {
    const panel = document.createElement('details');
    panel.innerHTML = '<summary>其他传输方式（局域网 / 文件）</summary>';
    const relayPanel = document.createElement('details');
    document.querySelector('#extensions_settings').append(relayPanel, panel);
    mountRelay(relayPanel);
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
    function activeChat() {
        const c = context();
        const character = c.characters[c.characterId];
        if (c.groupId || !character?.avatar) throw Error('请先打开要收发聊天的角色，再点这里。');
        return { c, character };
    }
    function fileTransfer(parent) {
        action(parent, '把当前聊天存成文件', async () => {
            const { c, character } = activeChat();
            if (!c.chatId) throw Error('这个角色还没有已保存的聊天。');
            const file = c.chatId + '.jsonl';
            const res = await fetch('/api/chats/export', { method: 'POST', headers: c.getRequestHeaders(),
                body: JSON.stringify({ avatar_url: character.avatar, file, exportfilename: file, format: 'jsonl', is_group: false }) });
            if (!res.ok) throw Error('没有读到聊天。请等酒馆保存完，再试一次。');
            const data = await res.json();
            if (typeof data.result !== 'string' || !data.result.trim()) throw Error('这份存档没有可导出的内容。');
            const url = URL.createObjectURL(new Blob([data.result], {type:'application/octet-stream'}));
            const link = document.createElement('a');
            link.href = url; link.download = file; document.body.append(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            return {message:'下一步：把下载的 .jsonl 文件传到另一台设备，再在那边打开对应角色，点「导入收到的文件」。'};
        });
        const picker = document.createElement('input');
        picker.type = 'file'; picker.accept = '.jsonl'; picker.hidden = true; parent.append(picker);
        action(parent, '导入收到的文件', () => { activeChat(); picker.value = ''; picker.click(); });
        picker.onchange = async () => {
            const file = picker.files[0]; if (!file) return;
            try {
                const { c, character } = activeChat();
                if (!confirm('把「' + file.name + '」保存为「' + character.name + '」的新聊天？')) return;
                const form = new FormData();
                form.append('avatar', file); form.append('file_type', 'jsonl');
                form.append('avatar_url', character.avatar); form.append('character_name', character.name);
                form.append('user_name', c.name1);
                const res = await fetch('/api/chats/import', {method:'POST', headers:c.getRequestHeaders({omitContentType:true}), body:form});
                if (!res.ok || !(await res.json()).res) throw Error('导入失败，请选择从酒馆导出的 .jsonl 聊天文件。');
                status.textContent = '已保存。打开「' + character.name + '」的历史聊天，就能看到新存档。';
            } catch (error) { status.textContent = error.message; }
        };
    }
    async function refresh() {
        const token = ++revision;
        try {
            const state = await api('status');
            if (token !== revision) return;
            body.replaceChildren();
            status.textContent = state.devices.length ? '直传 3/3 · 已配对，可以发送聊天。' : '直传 2/3 · 本机已准备好。下一步：连接另一台设备。';
            if (state.inbox.length) receive(state);
            if (state.devices.length) transfer(state); else pairing(body, state);
            action(body, state.devices.length ? '刷新收件箱' : '检查配对状态', refresh);
            fileTransfer(section(body, '通过文件收发'));
        } catch (error) {
            if (token !== revision) return;
            body.replaceChildren();
            status.textContent = '面板已装好。现在可以用文件传聊天：打开一个角色，再选你要做的事。';
            fileTransfer(body);
            const setup = section(body, '想用 Wi-Fi 直接发？');
            const hint = document.createElement('p');
            hint.textContent = '直传 1/3 · 面板已装好，本机直传还没连上。下一步：按说明安装并开启本机直传服务，然后重启酒馆。';
            setup.append(hint);
            const link = document.createElement('a');
            link.textContent = '查看安装步骤'; link.target = '_blank'; link.rel = 'noopener';
            link.href = 'https://github.com/SweetKeke/SillyTavern-LAN-Chat#readme';
            setup.append(link);
            action(setup, '我已重启，检查进度', refresh);
            const detail = section(setup, '查看连接详情'); detail.append(error.message);
        }
    }
    panel.ontoggle = () => { if (panel.open) refresh(); };
});

