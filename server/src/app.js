const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const helmet = require('koa-helmet');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const router = require('./routes');
const fs = require('fs');
const path = require('path');

const app = new Koa();
app.use(errorHandler); // 最先注册，捕获后续所有错误
app.use(helmet());
app.use(cors({ origin: '*' })); // 生产环境收紧为具体域名

// 静态文件服务：服务留痕图片（上传目录）
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(async (ctx, next) => {
  if (ctx.path.startsWith('/uploads/')) {
    const file = path.join(uploadsDir, ctx.path.replace('/uploads/', '').replace(/\.\./g, ''));
    if (fs.existsSync(file)) {
      ctx.type = path.extname(file);
      ctx.body = fs.createReadStream(file);
      return;
    }
    ctx.status = 404;
    return;
  }
  await next();
});

app.use(bodyParser({ jsonLimit: '10mb', formLimit: '10mb' }));
// TODO(改造)：支付适配层改造时，核对 /api/v1/pay/notify 的原始报文验签处理
app.use(router.routes());
app.use(router.allowedMethods());

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`peizhen server listening on :${config.port} (pay channel: ${config.payChannel})`);
});

// 定时任务：超时未支付订单自动取消等
try {
  const { startScheduler } = require('./jobs/scheduler');
  startScheduler();
} catch (e) {
  console.error('start scheduler failed:', e.message);
}

// 优雅关闭
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

module.exports = app;
