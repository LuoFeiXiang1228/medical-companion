// 统一错误类型（遵循 fullstack-dev: 所有错误可类型化、可预期）
class AppError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message) { super(message || '参数校验失败', 'VALIDATION_ERROR', 422); }
}
class UnauthorizedError extends AppError {
  constructor(message) { super(message || '未登录或登录已过期', 'UNAUTHORIZED', 401); }
}
class ForbiddenError extends AppError {
  constructor(message) { super(message || '无权限', 'FORBIDDEN', 403); }
}
class NotFoundError extends AppError {
  constructor(message) { super(message || '资源不存在', 'NOT_FOUND', 404); }
}
class ConflictError extends AppError {
  constructor(message) { super(message || '库存不足', 'CONFLICT', 409); }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
