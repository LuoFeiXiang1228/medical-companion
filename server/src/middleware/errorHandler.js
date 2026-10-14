const { AppError } = require('../errors');
const logger = require('../logger');

// 全局错误捕获：可预期错误返回业务码；编程错误只记日志返回 500
module.exports = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      ctx.status = err.statusCode;
      ctx.body = { code: err.code, message: err.message, data: null };
    } else {
      logger.error('Unhandled error', { message: err.message, stack: err.stack });
      ctx.status = 500;
      ctx.body = { code: 'INTERNAL', message: '服务器开小差了', data: null };
    }
  }
};
