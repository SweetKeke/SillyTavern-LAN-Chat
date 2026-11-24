import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import dgram from 'node:dgram';
import {randomBytes, randomUUID, constants} from 'node:crypto';

export const info = {id:'lan-chat', name:'局域网聊天快传', description:'手动传输角色聊天'};
const port = Number(process.env.ST_LAN_CHAT_PORT || 47321);
const limit = 8 * 1024 * 1024;
const wireLimit = limit * 3 + 65536;
const options = {minVersion:'TLSv1.2', maxVersion:'TLSv1.2', ciphers:'PSK-AES256-GCM-SHA384', secureOptions:constants.SSL_OP_NO_TICKET};
let dirs, owner, storeFile, devices, server, udp, invitation;
const inbox = new Map(), found = new Map();
function requireValue(ok, message) { if (!ok) throw Error(message); }
function local(ip) {
    return net.isIPv4(ip) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip);
}
function endpoint(ip,p) {
    requireValue(local(ip) && Number.isInteger(p) && p>0 && p<=65535,'请输入私有 IPv4 地址和有效端口');
    return {ip,port:p};
}
function save(next) {
    const tmp = storeFile + '.' + randomUUID();
    fs.writeFileSync(tmp, JSON.stringify(next), {mode:0o600,flag:'wx'});
    fs.renameSync(tmp,storeFile);
    devices = next;
}
function entries(dir) { return fs.readdirSync(dir,{withFileTypes:true}); }
function cards() { return entries(dirs.characters).filter(x=>x.isFile() && x.name.endsWith('.png')).map(x=>x.name.slice(0,-4)); }
function folder(card,create=false) {
    requireValue(cards().includes(card) && card!=='.' && card!=='..' && card,'请选择本机角色');
    const dir = path.join(dirs.chats,card);
    if(create && !fs.existsSync(dir)) fs.mkdirSync(dir);
    if(fs.existsSync(dir)) requireValue(fs.lstatSync(dir).isDirectory(),'角色目录无效');
    return dir;
}
function list() {
    return cards().flatMap(card=>{
        const dir=folder(card);
        return fs.existsSync(dir)?entries(dir).filter(x=>x.isFile() && x.name.endsWith('.jsonl')).map(x=>({card,file:x.name})):[];
    });
}
function readChat({card,file}) {
    requireValue(list().some(x=>x.card===card && x.file===file),'存档不存在');
    const f=path.join(folder(card),file);
    requireValue(fs.statSync(f).size<=limit,'超过 8 MiB');
    return {card,file,data:fs.readFileSync(f,'utf8')};
}
function receive(x) {
    requireValue(inbox.size<4,'收件箱已满');
    requireValue(typeof x.card==='string' && typeof x.file==='string' && typeof x.data==='string' && Buffer.byteLength(x.data)<=limit,'无效存档');
    const lines=x.data.trim().split('\n').map(line=>JSON.parse(line));
    requireValue(lines.length && lines.every(row=>row && typeof row==='object' && !Array.isArray(row)) && lines.slice(1).every(row=>typeof row.mes==='string'),'无效 JSONL');
    inbox.set(randomUUID(),{card:x.card,file:x.file,data:x.data});
    return {message:'已进入接收端收件箱'};
}
function commit(b) {
    const x=inbox.get(b.id);
    requireValue(x,'请选择待接收项');
    const dir=folder(b.card,true);
    let name='快传-'+randomUUID()+'.jsonl';
    if(b.replace) {
        requireValue(b.confirm===true && list().some(y=>y.card===b.card && y.file===b.replace),'覆盖需要确认已有存档');
        name=b.replace;
    }
    const dest=path.join(dir,name), tmp=path.join(dir,randomUUID()+'.tmp');
    fs.writeFileSync(tmp,x.data,{flag:'wx'});
    try {
        if(b.replace) fs.copyFileSync(dest,path.join(dirs.backups,'lan-chat-'+randomUUID()+'.jsonl'),fs.constants.COPYFILE_EXCL);
        fs.renameSync(tmp,dest);
    } finally { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    inbox.delete(b.id);
    return {message:'已保存 '+name};
}
async function body(stream) {
    let n=0; const chunks=[];
    for await(const chunk of stream) {
        n+=chunk.length; requireValue(n<=wireLimit,'数据过大'); chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
}
function activeInvite() {return invitation && Date.now()<invitation.until;}
async function remote(req,res) {
    try {
        requireValue(local(req.socket.remoteAddress) && req.method==='POST','拒绝连接');
        const b=await body(req);
        let result;
        if(b.op==='pair') {
            requireValue(activeInvite() && b.secret===invitation.secret,'配对码已失效');
            const address=endpoint(req.socket.remoteAddress,b.port);
            invitation=null;
            const key=randomBytes(32).toString('hex'), id=randomUUID();
            save([...devices,{id,key,...address}]); result={id,key};
        } else {
            const peer=devices.find(x=>x.id===b.id && x.key===b.secret);
            requireValue(peer,'设备未配对');
            if(b.op==='list') result=list();
            else if(b.op==='get') result=readChat(b);
            else if(b.op==='put') result=receive(b);
            else throw Error('未知操作');
        }
        res.end(JSON.stringify(result));
    } catch(e) {res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
}
function call(peer,b) {
    return new Promise((resolve,reject)=>{
        const req=https.request({...options,host:peer.ip,port:peer.port,method:'POST',agent:false,rejectUnauthorized:false,
            pskCallback:()=>({identity:peer.id,psk:Buffer.from(peer.key,'hex')})},async res=>{
            try {const value=await body(res); requireValue(res.statusCode===200,value.error); resolve(value);} catch(e){reject(e);}
        });
        req.on('error',reject); req.setTimeout(15000,()=>req.destroy(Error('连接超时')));
        req.end(JSON.stringify({...b,id:peer.id,secret:peer.key}));
    });
}
function discover() {
    udp=dgram.createSocket({type:'udp4',reuseAddr:true});
    udp.on('error',()=>{});
    udp.on('message',(msg,r)=>{
        if(!local(r.address)) return;
        if(msg.toString()==='st-lan-chat?') udp.send('st-lan-chat!'+port,r.port,r.address);
        const m=/^st-lan-chat!(\d{1,5})$/.exec(msg.toString());
        if(m && found.size<128) found.set(r.address+':'+m[1],Date.now());
    });
    udp.bind(47322,()=>{try{udp.addMembership('239.255.47.32');udp.setMulticastTTL(1);}catch{}});
}
let starting;
async function start(user) {
    if(owner) {requireValue(owner===user.profile.handle,'此实例已绑定另一用户');return starting;}
    requireValue(user.profile.admin,'需要本机管理员启用');
    owner=user.profile.handle; dirs=user.directories;
    try {
        storeFile=path.join(dirs.root,'lan-chat-devices.json');
        devices=fs.existsSync(storeFile)?JSON.parse(fs.readFileSync(storeFile,'utf8')):[];
        server=https.createServer({...options,handshakeTimeout:5000,pskCallback:(_socket,id)=>{
            const key=id==='invite' && activeInvite()?invitation.secret:devices.find(x=>x.id===id)?.key;
            return key?Buffer.from(key,'hex'):null;
        }},remote);
        server.maxConnections=12;server.requestTimeout=20000;
        starting=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
        await starting; discover();
    } catch(e){owner=null;throw e;}
}
export function init(router) {
    router.post('/action',async(req,res)=>{
        try {
            await start(req.user);
            const b=req.body, peer=devices.find(x=>x.id===b.peer);
            let result;
            switch(b.op) {
                case 'status': result={addresses:Object.values(os.networkInterfaces()).flat().filter(x=>local(x.address)&&!x.internal).map(x=>x.address+':'+port),
                    devices:devices.map(({id,ip,port})=>({id,ip,port})),cards:cards(),chats:list(),inbox:[...inbox].map(([id,{card,file}])=>({id,card,file}))};break;
                case 'discover': found.clear();udp.send('st-lan-chat?',47322,'239.255.47.32');await new Promise(r=>setTimeout(r,850));result=[...found.keys()];break;
                case 'invite': invitation={secret:randomBytes(24).toString('hex'),until:Date.now()+120000};result=invitation.secret;break;
                case 'pair': {
                    requireValue(/^[0-9a-f]{48}$/.test(b.code),'配对码格式错误');
                    const address=endpoint(b.ip,b.port);
                    const link=await call({...address,id:'invite',key:b.code},{op:'pair',port});
                    save([...devices,{...link,...address}]); result={message:'已配对'};break;
                }
                case 'forget': save(devices.filter(x=>x.id!==b.peer));result={message:'已解除'};break;
                case 'remote': result=await call(peer,{op:'list'});break;
                case 'pull': result=receive(await call(peer,{op:'get',card:b.card,file:b.file}));break;
                case 'send': result=await call(peer,{op:'put',...readChat(b)});break;
                case 'discard': inbox.delete(b.id);result={message:'已丢弃'};break;
                case 'commit': result=commit(b);break;
                default: throw Error('未知操作');
            }
            res.json(result);
        } catch(e){res.status(400).json({error:e.message});}
    });
}
export function exit(){server?.close();udp?.close();}

