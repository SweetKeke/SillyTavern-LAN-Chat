import * as relay from './relay.mjs';

export function mountRelay(panel) {
    const ctx = () => SillyTavern.getContext();
    const prefix = 'st-chat-handoff-v2:';
    let config = JSON.parse(localStorage.getItem(prefix+'connection') || 'null');
    let waiting = [], busy = false;
    const summary = document.createElement('summary');
    const message = document.createElement('p');
    message.setAttribute('role','status');
    const controls = document.createElement('div');
    controls.style.cssText='display:grid;gap:.5em;margin:.45em 0';
    panel.append(summary,message,controls);
    function button(parent,label,fn) {
        const el=document.createElement('button');
        el.type='button'; el.className='menu_button'; el.style.width='auto'; el.textContent=label; parent.append(el);
        el.onclick=async()=>{
            if(busy)return;
            busy=true;panel.setAttribute('aria-busy','true');el.disabled=true;
            try { await fn(); } catch(e){message.textContent=e.message || '操作失败，请重试。';}
            finally{busy=false;el.disabled=false;panel.removeAttribute('aria-busy');}
        };
    }
    function group(title) {
        const section=document.createElement('details'), heading=document.createElement('summary');
        heading.textContent=title; section.append(heading); controls.append(section);return section;
    }
    function input(box,title,secret=false) {
        const label=document.createElement('label'), el=document.createElement('input');
        el.type=secret?'password':'text'; el.autocomplete='off'; el.spellcheck=false;
        el.className='text_pole';label.append(title,el);box.append(label);return el;
    }
    function persist(next) {
        localStorage.setItem(prefix+'connection',JSON.stringify(next));config=next;
    }
    function setup(){
        message.textContent='首次使用：在电脑连接一次，再把连接码复制到手机。';
        const pc=group('我在电脑上 · 连接 GitHub');
        const help=document.createElement('a');help.href='https://github.com/SweetKeke/SillyTavern-LAN-Chat#github-setup';
        help.target='_blank';help.rel='noopener';help.textContent='第一次连接怎么填？';pc.append(help);
        const repo=input(pc,'自己的私有中转仓库（用户名/仓库名）'),token=input(pc,'只授权这个仓库的 GitHub 令牌',true);
        button(pc,'连接电脑',async()=>{
            const next={repo:repo.value.trim(),token:token.value.trim(),key:relay.makeKey(),side:'pc'};
            next.release=await relay.prepare(next);persist(next);render();
            message.textContent='电脑已连接。展开「连接手机」，把连接码复制到手机。';
        });
        const phone=group('我在手机上 · 输入连接码');
        const code=input(phone,'电脑给你的连接码',true);
        button(phone,'连接手机',async()=>{
            let data;try{data=JSON.parse(atob(code.value.trim()));}catch{throw Error('连接码不完整，请重新复制。');}
            const next={repo:data.repo,token:data.token,key:data.key,side:'phone'};
            next.release=await relay.prepare(next);persist(next);await refresh();
        });
    }
    async function refresh(){
        waiting=await relay.pending(config);render();
    }
    async function send(){
        const c=ctx(),card=c.characters[c.characterId];
        if(c.groupId || !card || !c.chatId)throw Error('先打开要发送的单角色聊天。');
        if(c.streamingProcessor && !c.streamingProcessor.isFinished)throw Error('请等回复生成完再发送。');
        const file=c.chatId+'.jsonl';
        const res=await fetch('/api/chats/export',{method:'POST',headers:c.getRequestHeaders(),
            body:JSON.stringify({avatar_url:card.avatar,file,exportfilename:file,format:'jsonl',is_group:false})});
        if(!res.ok)throw Error('没有读到已保存的聊天，请稍后再试。');
        const {result}=await res.json();if(typeof result!=='string' || !result.trim())throw Error('聊天内容为空。');
        await relay.send(config,{version:1,avatar:card.avatar,name:card.name,data:result});
        message.textContent='已发出，可以关闭这台设备。另一台设备点「继续聊」即可。';
    }
    async function receive(){
        const item=waiting[0]; if(!item)return refresh();
        const receiptKey=prefix+config.repo+':'+item.id;
        let saved=JSON.parse(localStorage.getItem(receiptKey)||'null');
        if(!saved){
            const chat=await relay.download(config,item),c=ctx();
            const card=c.characters.find(x=>x?.avatar===chat.avatar);
            if(!card)throw Error('本机还没有相同文件名的角色卡「'+chat.name+'」。请先导入角色卡，再点继续聊。');
            const form=new FormData();
            form.append('avatar',new Blob([chat.data],{type:'application/octet-stream'}),'chat.jsonl');
            form.append('avatar_url',card.avatar);form.append('file_type','jsonl');
            form.append('character_name',card.name);form.append('user_name',c.name1);
            const res=await fetch('/api/chats/import',{method:'POST',headers:c.getRequestHeaders({omitContentType:true}),body:form});
            if(!res.ok)throw Error('保存失败，中转文件仍在，请重试。');
            const result=await res.json();
            if(!result.res || !result.fileNames?.[0])throw Error('酒馆未确认保存成功，中转文件仍在。');
            saved={avatar:card.avatar,file:result.fileNames[0].replace(/\.jsonl$/,'')};
            localStorage.setItem(receiptKey,JSON.stringify(saved));
        }
        const c=ctx(),index=c.characters.findIndex(x=>x?.avatar===saved.avatar);
        if(index<0)throw Error('请恢复对应角色卡后重试。');
        if(c.groupId || Number(c.characterId)!==index)await c.selectCharacterById(index);
        await ctx().openCharacterChat(saved.file);
        try{await relay.remove(config,item);}catch{throw Error('聊天已保存并打开。再次点「继续聊」可重试清理中转文件。');}
        localStorage.removeItem(receiptKey);waiting.shift();render();message.textContent='已接上聊天，GitHub 临时数据已清理。';
    }
    function render(){
        summary.textContent='聊天接力'+(waiting.length?' · 有新进度':'');
        controls.replaceChildren();
        if(!config){setup();return;}
        const other=config.side==='pc'?'手机':'电脑';
        message.textContent=waiting.length?'收到 '+waiting.length+' 份聊天进度。':'已连接，可以发送当前聊天。';
        if(waiting.length)button(controls,'继续聊',receive);
        button(controls,'发到'+other,send);
        button(controls,'检查新进度',refresh);
        if(config.side==='pc'){
            const box=group('连接手机');
            button(box,'显示连接码',()=>{
                if(box.querySelector('input'))return;
                const code=input(box,'只交给自己的手机（含授权和解密密钥）');
                code.readOnly=true;code.value=btoa(JSON.stringify({repo:config.repo,token:config.token,key:config.key}));
                code.select();
            });
        }
        const settings=group('连接设置');
        button(settings,'断开本机',()=>{
            if(!confirm('断开后需重新连接。要保留领取能力，请先保存连接码。'))return;
            localStorage.removeItem(prefix+'connection');config=null;waiting=[];render();
        });
    }
    render();
    const check=async()=>{if(config && !busy){busy=true;try{await refresh();}catch(e){message.textContent=e.message;}finally{busy=false;}}};
    panel.addEventListener('toggle',()=>{if(panel.open)check();});
    check();
}


