import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import * as relay from './public/scripts/extensions/third-party/lan-chat/relay.mjs';

const db = new Map();
let nextId = 0;
globalThis.fetch = async (url, options) => {
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, 'https://api.github.com');
    const id = Number(endpoint.pathname.split('/').at(-1));
    if (options.method === 'POST') {
        const row = {...JSON.parse(options.body), id: ++nextId, created_at: new Date().toISOString()};
        row.tag_name = 'untagged-' + row.id;
        db.set(row.id, row);
        return Response.json(row, {status:201});
    }
    if (options.method === 'DELETE') {
        db.delete(id); return new Response(null, {status:204});
    }
    if (id) return Response.json(db.get(id));
    if (endpoint.pathname.endsWith('/releases')) return Response.json([...db.values()]);
    return Response.json({id:1,private:true});
};
const pc = {side:'pc', repo:'demo/test', token:'mock', key:relay.makeKey()};
const phone = {...pc,side:'phone'};
const payload = {version:1,avatar:'角色.png',name:'角色',data:randomBytes(120000).toString('base64')};
await relay.prepare(pc);
await relay.send(pc,payload);
assert(db.size>1);
assert([...db.values()].every(x=>x.draft && !x.body.includes('角色')));
assert.deepEqual(await relay.pending(pc),[]);
const [item] = await relay.pending(phone);
await assert.rejects(relay.download({...phone,key:relay.makeKey()},item));
assert.deepEqual(await relay.download(phone,item),payload);
assert(db.size>0);
await relay.remove(phone,item);
assert.equal(db.size,0);
console.log('PASS encrypted multipart handoff, direction, wrong key, download and cleanup (mock GitHub)');

