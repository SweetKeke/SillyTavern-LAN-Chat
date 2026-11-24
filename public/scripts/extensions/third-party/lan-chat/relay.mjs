// The repository stores only AES-GCM ciphertext in temporary draft releases.
const apiRoot = 'https://api.github.com/repos/';
const partSize = 72000;
const maxSize = 8 * 1024 * 1024;
export const makeKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export function validate(config) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo) || config.repo.split('/').some(x => x === '.' || x === '..')) throw Error('请填写 仓库主人/仓库名。');
    if (!config.token || !/^[\da-f]{64}$/.test(config.key)) throw Error('连接资料不完整，请重新设置。');
}
async function request(url, config, options = {}) {
    const res = await fetch(url, {...options, cache:'no-store', headers:{
        Authorization:'Bearer '+config.token, Accept:'application/vnd.github+json', ...options.headers,
    }});
    if (!res.ok) throw Error('GitHub 请求失败（'+res.status+'）。请检查网络、仓库名和授权。');
    return res;
}
async function key(config) {
    const bytes = Uint8Array.from(config.key.match(/../g), x => parseInt(x,16));
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function prepare(config) {
    validate(config);
    if (!globalThis.crypto?.subtle) throw Error('请用本机 localhost 或 HTTPS 打开酒馆。');
    const base = apiRoot + config.repo;
    const repo = await (await request(base, config)).json();
    if (!repo.private) throw Error('请使用你自己的私有中转仓库，避免把聊天发到公开仓库。');
    return repo.id;
}
function encode(bytes) {
    let text='';
    for(let i=0;i<bytes.length;i+=8192) text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(text);
}
const releases = config => apiRoot+config.repo+'/releases';
async function erase(config,id) {
    try { await request(releases(config)+'/'+id,config,{method:'DELETE'}); }
    catch(e) { if(!e.message.includes('404'))throw e; }
}
export async function send(config,payload) {
    const raw=new TextEncoder().encode(JSON.stringify(payload));
    if(raw.length>maxSize)throw Error('这段聊天超过 8 MiB。');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const packed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(config),packed));
    const bytes=new Uint8Array(iv.length+cipher.length);bytes.set(iv);bytes.set(cipher,12);
    const data=encode(bytes), tx=crypto.randomUUID(),side=config.side==='pc'?'phone':'pc';
    const count=Math.ceil(data.length/partSize),created=[];
    try {
        for(let i=0;i<count;i++){
            const name='st-relay-'+side+'-'+tx+'-'+(i+1)+'-of-'+count;
            const record=await request(releases(config),config,{method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({tag_name:name,name,body:data.slice(i*partSize,(i+1)*partSize),draft:true})});
            created.push((await record.json()).id);
        }
    } catch(error) {
        await Promise.allSettled(created.map(id=>erase(config,id)));throw error;
    }
}
export async function pending(config) {
    const groups=new Map();
    const pattern=/^st-relay-(pc|phone)-([a-f0-9-]{36})-(\d+)-of-(\d+)$/;
    for(let page=1;;page++){
        const rows=await (await request(releases(config)+'?per_page=100&page='+page,config)).json();
        for(const row of rows){
            const m=pattern.exec(row.tag_name);
            if(!row.draft || !m || m[1]!==config.side || row.name!==row.tag_name)continue;
            const [, ,id,part,total]=m;
            if(!groups.has(id))groups.set(id,{id,parts:[],count:Number(total),created:row.created_at});
            groups.get(id).parts.push({number:Number(part),id:row.id});
        }
        if(rows.length<100)break;
    }
    return [...groups.values()].filter(x=>x.parts.some(p=>p.number===x.count)).sort((a,b)=>a.created.localeCompare(b.created));
}
export async function download(config,item) {
    if(item.parts.length!==item.count || item.count>170)throw Error('中转内容不完整，请重新发送。');
    const pieces=[];
    for(const part of [...item.parts].sort((a,b)=>a.number-b.number)){
        const row=await (await request(releases(config)+'/'+part.id,config)).json();
        if(typeof row.body!=='string'||row.body.length>partSize)throw Error('中转格式不正确。');
        pieces.push(row.body);
    }
    const bytes=Uint8Array.from(atob(pieces.join('')),c=>c.charCodeAt(0));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await key(config),bytes.slice(12));
    const stream=new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
    const chat=JSON.parse(await new Response(stream).text());
    if(chat.version!==1||typeof chat.avatar!=='string'||typeof chat.data!=='string')throw Error('无法识别聊天格式。');
    return chat;
}
export async function remove(config,item) {
    for(const part of [...item.parts].sort((a,b)=>a.number-b.number))await erase(config,part.id);
}

