const { hashPassword } = require('../src/utils/password');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const username = process.argv[2];
  const password = process.env.ADMIN_PASSWORD || process.argv[3];
  if (!/^[A-Za-z0-9_]{4,32}$/.test(username || '') || !password || password.length < 12 || password.length > 128) {
    console.error('用法：设置 ADMIN_PASSWORD（12-128位），再执行 node scripts/create-admin.js 用户名（4-32位字母数字下划线）');
    process.exitCode = 1;
    return;
  }

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root',
    database: process.env.MYSQL_DATABASE || 'peizhen',
    waitForConnections: true,
    connectionLimit: 1,
  });

  const passwordHash = await hashPassword(password);

  try {
    const [rows] = await pool.query('SELECT id FROM admin_users WHERE username=?', [username]);
    if (rows.length) {
      console.log(`管理员账号 "${username}" 已存在，跳过创建。`);
      return;
    }

    await pool.query(
      'INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, passwordHash, 'admin'],
    );
    console.log('✅ 管理员账号创建成功');
    console.log(`   用户名：${username}`);
  } catch (err) {
    console.error('❌ 创建失败：', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
