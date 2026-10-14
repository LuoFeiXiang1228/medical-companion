const Router = require('koa-router');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ok } = require('../../utils/response');
const { authenticate } = require('../../middleware/auth');

function register(router) {
  // 上传 Base64 图片，返回可访问 URL（送达拍照留证等场景使用）
  router.post('/upload/image-base64', authenticate, async (ctx) => {
    const { image } = ctx.request.body || {};
    const match = typeof image === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match || match[2].length % 4 !== 0) {
      ctx.status = 400;
      ctx.body = { code: 'INVALID_PARAM', message: '缺少图片数据', data: null };
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    const valid = ext === 'png' ? buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : ext === 'jpg' ? buf.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    if (!valid) { ctx.status = 400; ctx.body = { code: 'INVALID_PARAM', message: '图片内容与格式不符', data: null }; return; }
    if (buf.length > 5 * 1024 * 1024) {
      ctx.status = 413;
      ctx.body = { code: 'FILE_TOO_LARGE', message: '图片不能超过 5MB', data: null };
      return;
    }
    const filename = crypto.randomBytes(8).toString('hex') + '.' + ext;
    const uploadsDir = path.join(__dirname, '../../../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), buf);
    const config = require('../../config');
    ok(ctx, { url: `${config.baseUrl}/uploads/${filename}` });
  });
}

module.exports = { register };
