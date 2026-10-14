// 结构化 JSON 日志（requestId 在 middleware 中注入）
function emit(level, msg, meta) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta }));
}

module.exports = {
  info: (msg, meta = {}) => emit('info', msg, meta),
  warn: (msg, meta = {}) => emit('warn', msg, meta),
  error: (msg, meta = {}) => emit('error', msg, meta),
};
