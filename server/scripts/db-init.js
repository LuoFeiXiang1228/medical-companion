// 数据库初始化脚本：一键建库 + 导入演示数据 / 国标规则
// 用法：node scripts/db-init.js
// 前置：.env 配置好 MySQL 连接（或使用环境变量 / 默认本机 root）
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const FILES = ['database/schema.sql', 'database/seed-compliance.sql', 'database/seed.sql'];

async function run() {
  if (process.env.MYSQL_DATABASE && process.env.MYSQL_DATABASE !== 'peizhen') throw new Error('初始化 SQL 固定使用 peizhen；请设置 MYSQL_DATABASE=peizhen');
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  });
  try {
    for (const f of FILES) {
      const sql = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      await conn.query(sql);
      console.log(`✓ 已执行 ${f}`);
    }
    console.log('数据库初始化完成（库名：peizhen，含演示数据与国标规则）');
  } finally {
    await conn.end();
  }
}

run().catch((e) => {
  console.error('数据库初始化失败：', e.message);
  process.exit(1);
});
