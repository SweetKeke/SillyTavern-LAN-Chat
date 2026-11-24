jQuery(()=>{
    const panel=document.createElement('details');
    panel.innerHTML='<summary>局域网聊天快传</summary>';
    document.querySelector('#extensions_settings').append(panel);
    const context=()=>SillyTavern.getContext();
    async function api(op,params={}) {
        const res=await fetch('/api/plugins/lan-chat/action',{method:'POST',headers:context().getRequestHeaders(),body:JSON.stringify({...params,op})});
        if(!res.headers.get('content-type')?.includes('json')) throw Error('请检查服务端插件是否已启用并重启酒馆');
        const value=await res.json(); if(!res.ok) throw Error(value.error);return value;
    }
    const status=document.createElement('p');panel.append(status);
    function field(label,tag='select'){
        const row=document.createElement('label'),el=document.createElement(tag);
        row.style.display='block';row.append(label+' ',el);panel.append(row);return el;
    }
    function choices(el,items,label){
        el.replaceChildren(...items.map(x=>new Option(label(x),JSON.stringify(x))));
    }
    function selected(el){if(!el.value) throw Error('请先选择一项');return JSON.parse(el.value);}
    function button(label,action){
        const btn=document.createElement('button');btn.type='button';btn.textContent=label;panel.append(btn);
        btn.onclick=async()=>{btn.disabled=true;try{const r=await action();status.textContent=r?.message||'已完成';}catch(e){status.textContent=e.message;}finally{btn.disabled=false;}};
    }
    const addresses=field('本机地址','output'),addr=field('对端 IPv4:端口','input'), discovered=field('发现结果');
    button('发现设备',async()=>{const rows=await api('discover');choices(discovered,rows,x=>x);if(rows.length)addr.value=rows[0];return {message:rows.length?'请选择对端地址':'未发现设备，请手动输入地址'};});
    discovered.onchange=()=>addr.value=selected(discovered);
    const code=field('两分钟一次性配对码','input');
    button('生成配对码',async()=>{code.value=await api('invite');code.select();});
    button('连接对端',async()=>{const [ip,p='47321']=addr.value.trim().split(':');await api('pair',{ip,port:Number(p),code:code.value.trim()});code.value='';await refresh();});
    const peers=field('配对设备'), peer=()=>selected(peers).id;
    button('解除配对',async()=>{await api('forget',{peer:peer()});await refresh();});
    const chats=field('本地存档'), label=x=>x.card+' / '+x.file;
    button('发送所选存档',()=>api('send',{peer:peer(),...selected(chats)}));
    button('发送当前存档',async()=>{const c=context();if(c.groupId || !c.characters[c.characterId]?.avatar)throw Error('请打开单角色聊天');return api('send',{peer:peer(),card:c.characters[c.characterId].avatar.replace(/\.png$/,''),file:c.chatId+'.jsonl'});});
    const remote=field('对端存档');
    button('获取对端列表',async()=>choices(remote,await api('remote',{peer:peer()}),label));
    peers.onchange=()=>remote.replaceChildren();
    button('拉取到收件箱',async()=>{await api('pull',{peer:peer(),...selected(remote)});await refresh();});
    const inbox=field('收件箱'),card=field('接收角色'),target=field('保存方式');
    let state;
    function targets(){choices(target,[null,...state.chats.filter(x=>x.card===card.value)],x=>x?'覆盖 '+x.file:'新建存档');}
    card.onchange=targets;
    inbox.onchange=()=>{card.value=inbox.value?selected(inbox).card:'';targets();};
    async function refresh(){
        state=await api('status');addresses.textContent=state.addresses.join(' / ');
        const old=peers.value;choices(peers,state.devices,x=>x.ip+':'+x.port+' · '+x.id.slice(0,6));if([...peers.options].some(o=>o.value===old))peers.value=old;
        if(old!==peers.value)remote.replaceChildren();
        choices(chats,state.chats,label);choices(inbox,state.inbox,label);
        card.replaceChildren(new Option('请选择',''),...state.cards.map(x=>new Option(x,x)));inbox.onchange();
    }
    button('刷新设备和收件箱',refresh);
    button('保存到酒馆',async()=>{
        const id=selected(inbox).id, dest=selected(target);
        if(!card.value)throw Error('请选择接收角色');
        if(dest && !confirm('请先在所有窗口关闭目标聊天。备份并覆盖 '+label(dest)+'？'))return {message:'已取消'};
        const result=await api('commit',{id,card:card.value,replace:dest?.file,confirm:!!dest});await refresh();return result;
    });
    button('丢弃待接收项',async()=>{await api('discard',{id:selected(inbox).id});await refresh();});
    panel.ontoggle=()=>{if(panel.open)refresh().catch(e=>status.textContent=e.message);};
});

