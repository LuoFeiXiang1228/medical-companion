const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const file = path.resolve(__dirname,'../.env');
if(fs.existsSync(file)) { console.error('.env 已存在，未覆盖。'); process.exitCode=1; }
else {
  const text=fs.readFileSync(path.resolve(__dirname,'../.env.example'),'utf8')
    .replace('JWT_SECRET=change_me_to_a_random_string',`JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`)
    .replace('MYSQL_PASSWORD=change_me',`MYSQL_PASSWORD=${crypto.randomBytes(24).toString('hex')}`);
  fs.writeFileSync(file,text,{flag:'wx',mode:0o600});
  console.log('已生成本机 .env 和随机密码；如连接既有数据库，请修改连接信息。');
}
