import {fork} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
if(process.argv[2]){
    const {init}=await import('./plugins/lan-chat/index.mjs');
    const root=process.argv[2],directories={root};
    for(const name of ['chats','characters','backups'])directories[name]=path.join(root,name);
    init({post(_,handler){process.on('message',body=>handler({body,user:{profile:{handle:'test',admin:true},directories}},{status(){return this;},json:x=>process.send(x)}));}});
}else{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'lan-chat-')), children=[];
    const data=JSON.stringify({chat_metadata:{}})+'\n'+JSON.stringify({mes:'你好'});
    function device(name,p){
        const dir=path.join(root,name);
        for(const sub of ['characters','chats/Card','backups'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
        fs.writeFileSync(path.join(dir,'characters/Card.png'),'');
        fs.writeFileSync(path.join(dir,'chats/Card/old.jsonl'),data+name.replace(/./g,' '));
        const proc=fork(fileURLToPath(import.meta.url),[dir],{env:{...process.env,ST_LAN_CHAT_PORT:String(p)}});
        children.push(proc);
        return async(op,params={})=>{const result=once(proc,'message');proc.send({op,...params});return (await result)[0];};
    }
    try{
        const a=device('A',49331),b=device('BB',49332);
        const code=await b('invite'),pair={ip:'127.0.0.1',port:49332,code};
        assert.equal((await a('pair',pair)).message,'已配对');
        assert.ok((await a('pair',pair)).error);
        const peer=(await a('status')).devices[0].id;
        const [chat]=await a('remote',{peer});
        assert.equal(chat.file,'old.jsonl');
        assert.ok((await a('pull',{peer,...chat})).message);
        const id=(await a('status')).inbox[0].id;
        assert.ok((await a('commit',{id,card:'Card',replace:chat.file})).error);
        assert.ok((await a('commit',{id,card:'Card',replace:chat.file,confirm:true})).message);
        const [backup]=fs.readdirSync(path.join(root,'A/backups'));
        assert.equal(fs.readFileSync(path.join(root,'A/backups',backup),'utf8'),data+' ');
        assert.equal(fs.readFileSync(path.join(root,'A/chats/Card/old.jsonl'),'utf8'),data+'  ');
        assert.ok((await a('send',{peer,...chat})).message);
        const item=(await b('status')).inbox[0];
        assert.ok((await b('commit',{id:item.id,card:'Card'})).message);
        assert.equal((await b('status')).chats.length,2);
        console.log('PASS pairing, replay rejection, list, pull, push, new copy, overwrite confirmation and backup');
    }finally{for(const child of children)child.kill();fs.rmSync(root,{recursive:true,force:true});}
}

