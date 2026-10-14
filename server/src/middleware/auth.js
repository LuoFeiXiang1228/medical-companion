const jwt = require('jsonwebtoken');
const config = require('../config');
const { UnauthorizedError, ForbiddenError } = require('../errors');

// 校验 Bearer Token，写入 ctx.state.user = { userId, role }
function authenticate(ctx, next) {
  const header = ctx.get('Authorization');
  if (!header) throw new UnauthorizedError();
  const token = header.replace('Bearer ', '');
  try {
    ctx.state.user = jwt.verify(token, config.jwtSecret);
  } catch (e) {
    throw new UnauthorizedError('登录已过期');
  }
  return next();
}

// 角色鉴权：authorize('admin', 'courier')
// admin 角色包含 super（超级管理员）和 manager（主管）
function authorize(...roles) {
  return (ctx, next) => {
    if (!ctx.state.user) throw new UnauthorizedError();
    const userRole = ctx.state.user.role;
    const isAdmin = ['admin', 'super', 'manager'].includes(userRole);
    const allowed = roles.map((r) => {
      if (r === 'admin') return isAdmin;
      return r === userRole;
    });
    if (!allowed.some(Boolean)) throw new ForbiddenError();
    return next();
  };
}

module.exports = { authenticate, authorize };
