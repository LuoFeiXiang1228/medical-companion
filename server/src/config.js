require('dotenv').config();

const required = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
};

// 真实支付适配器尚未完成安全验证，演示版仅开放 mock。
const payChannel = process.env.PAY_CHANNEL || 'mock';
if (payChannel !== 'mock') throw new Error('This framework supports PAY_CHANNEL=mock only; real payment is not enabled.');
if (process.env.NODE_ENV === 'production') throw new Error('Mock payments are disabled in production. Complete the production readiness checklist first.');
if (required('JWT_SECRET').length < 32 || process.env.JWT_SECRET === 'change_me_to_a_random_string') throw new Error('JWT_SECRET must be a unique random secret of at least 32 characters');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  payChannel: payChannel, // 仅开发演示模式
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mysql: {
    host: required('MYSQL_HOST'),
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    database: required('MYSQL_DATABASE'),
    connectionLimit: 10,
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  wechat: {
    appid: required('WX_APPID'),
    secret: required('WX_SECRET'),
    mchId: process.env.WX_MCH_ID || '',
    mchKey: process.env.WX_MCH_KEY || '',
    notifyUrl: process.env.WX_NOTIFY_URL || '',
    spbillIp: process.env.WX_SPBILL_IP || '127.0.0.1',
  },
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
};
