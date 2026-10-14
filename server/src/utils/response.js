// 统一响应格式：{ code, message, data }
const ok = (ctx, data, message = 'ok') => {
  ctx.body = { code: 0, message, data };
};

const fail = (ctx, statusCode, code, message) => {
  ctx.status = statusCode;
  ctx.body = { code, message, data: null };
};

module.exports = { ok, fail };
