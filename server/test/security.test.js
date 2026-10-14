const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
for (const key of ['MYSQL_HOST','MYSQL_USER','MYSQL_PASSWORD','MYSQL_DATABASE','WX_APPID','WX_SECRET']) process.env[key] = 'test';
process.env.PAY_CHANNEL = 'mock';
process.env.NODE_ENV = 'test';
const { hashPassword, verifyPassword } = require('../src/utils/password');
const { authenticate, authorize } = require('../src/middleware/auth');
const jwt = require('jsonwebtoken');
const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('salted password hashing and legacy verification', async () => {
  const a = await hashPassword('test-password-123');
  const b = await hashPassword('test-password-123');
  assert.notEqual(a,b);
  assert.ok(a.length <= 128);
  assert.equal(await verifyPassword('test-password-123',a),true);
  assert.equal(await verifyPassword('incorrect',a),false);
  assert.equal(await verifyPassword('x','scrypt$malformed'),false);
  const legacy = crypto.createHash('sha256').update('old-password').digest('hex');
  assert.equal(await verifyPassword('old-password',legacy),true);
  assert.equal(await verifyPassword('incorrect',legacy),false);
});
test('admin aliases are allowed; other roles and missing tokens are denied', () => {
  for(const role of ['admin','super','manager']) assert.equal(authorize('admin')({state:{user:{role}}},()=>true),true);
  for(const role of ['user','companion']) assert.throws(()=>authorize('admin')({state:{user:{role}}},()=>true));
  assert.throws(()=>authenticate({get:()=>''},()=>true));
});
test('login upgrades legacy passwords before issuing valid role tokens', async () => {
  const pool = require('../src/db/mysql');
  const original = pool.query;
  const legacy = crypto.createHash('sha256').update('legacy-password').digest('hex');
  const changes=[];
  pool.query=async(sql,args)=>{
    if(sql.startsWith('SELECT * FROM admin_users')) return [[{id:1,username:'admin',role:'admin',password_hash:legacy}]];
    if(sql.startsWith('SELECT * FROM companions')) return [[{id:2,username:'companion',audit_status:1,password_hash:legacy}]];
    if(sql.startsWith('UPDATE')) changes.push({sql,args});
    return [{affectedRows:1}];
  };
  try {
    const router=new Router(); require('../src/features/auth/auth.controller').register(router);
    for(const [url,role] of [['/admin/login','admin'],['/companion/login','companion']]) {
      const layer=router.stack.find(x=>x.path===url);
      const ctx={request:{body:{username:role,password:'legacy-password'}},ip:'127.0.0.1'};
      await layer.stack[0](ctx);
      const token=ctx.body.data.token;
      assert.equal(jwt.verify(token,process.env.JWT_SECRET).role,role);
    }
    assert.equal(changes.length,2);
    for(const change of changes) assert.equal(await verifyPassword('legacy-password',change.args[0]),true);
  } finally {pool.query=original;}
});
test('configuration refuses production, real payment and weak JWT secrets', () => {
  for(const override of [{NODE_ENV:'production'},{PAY_CHANNEL:'wechat'},{JWT_SECRET:'weak'}]) {
    const result=spawnSync(process.execPath,['-e',"require('./src/config')"],{cwd:path.resolve(__dirname,'..'),env:{...process.env,...override}});
    assert.notEqual(result.status,0);
  }
});
test('optional cloud proxy rejects traversal and non-HTTPS upstreams', async () => {
  const {main}=require('../../miniprogram-merged/cloudfunctions/proxy');
  for(const requestPath of ['//other-host','/api/v1/../secret','/api/v1/%2e%2e/secret']) assert.equal((await main({path:requestPath})).statusCode,400);
  const previous=process.env.API_ORIGIN; process.env.API_ORIGIN='http://localhost';
  try {assert.equal((await main({path:'/api/v1/health'})).statusCode,502);} finally {if(previous===undefined) delete process.env.API_ORIGIN; else process.env.API_ORIGIN=previous;}
});
test('uploads reject anonymous users and executable content', async t => {
  const app = new Koa(); const router = new Router();
  app.use(async(ctx,next)=>{try {await next();} catch {ctx.status=401;}});
  app.use(bodyParser());
  require('../src/features/upload/upload.controller').register(router);
  app.use(router.routes());
  const server = app.listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once('listening',resolve));
  const url = `http://127.0.0.1:${server.address().port}/upload/image-base64`;
  const post = (image,token) => fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({image})});
  assert.equal((await post('data:image/png;base64,aGVsbG8=')).status,401);
  const token = jwt.sign({userId:1,role:'user'},process.env.JWT_SECRET);
  assert.equal((await post('data:image/svg;base64,PHN2Zz4=',token)).status,400);
  assert.equal((await post('data:image/png;base64,aGVsbG8=',token)).status,400);
});
test('real payment callback cannot change an order', async t => {
  const app = new Koa(); const router = new Router();
  require('../src/features/orders/order.controller').register(router);
  app.use(router.routes());
  const server=app.listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once('listening',resolve));
  const res=await fetch(`http://127.0.0.1:${server.address().port}/orders/wxpay/callback`,{method:'POST',body:'<xml><result_code>SUCCESS</result_code></xml>'});
  assert.equal(res.status,501);
  await require('../src/db/mysql').end();
});
