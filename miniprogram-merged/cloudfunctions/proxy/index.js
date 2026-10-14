const https = require('node:https');

// 可选 HTTPS 转发，云端设置 API_ORIGIN；默认请求层仍使用 wx.request。
exports.main = async (event = {}) => {
  const method = String(event.method || 'GET').toUpperCase();
  const requestPath = event.path || '';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ||
      typeof requestPath !== 'string' || !requestPath.startsWith('/api/v1/') ||
      /[\\\s#]/.test(requestPath) || /%2e|%2f|%5c/i.test(requestPath) ||
      requestPath.split('?')[0].split('/').includes('..')) {
    return { statusCode: 400, body: { code: 'INVALID', message: '不支持的请求' } };
  }
  try {
    const origin = new URL(process.env.API_ORIGIN);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('Invalid API_ORIGIN');
    const headers = { 'Content-Type': 'application/json' };
    const incoming = event.headers || {};
    const token = incoming.Authorization || incoming.authorization;
    if (typeof token === 'string' && /^Bearer [A-Za-z0-9._-]+$/.test(token)) headers.Authorization = token;
    const body = method === 'GET' || event.body == null ? '' : JSON.stringify(event.body);
    if (Buffer.byteLength(body) > 1024 * 1024) return { statusCode: 413, body: { code: 'TOO_LARGE' } };
    headers['Content-Length'] = Buffer.byteLength(body);
    return await new Promise((resolve, reject) => {
      const req = https.request({ hostname: origin.hostname, port: origin.port || 443, path: requestPath, method, headers, timeout: 9000 }, res => {
        const chunks = []; let size = 0;
        res.on('data', chunk => { size += chunk.length; if (size > 10 * 1024 * 1024) res.destroy(Error('Response too large')); else chunks.push(chunk); });
        res.on('error', reject);
        res.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); let parsed = raw; try { parsed = JSON.parse(raw); } catch {} resolve({ statusCode: res.statusCode, body: parsed }); });
      });
      req.on('timeout', () => req.destroy(Error('Timeout')));
      req.on('error', reject);
      req.end(body);
    });
  } catch {
    return { statusCode: 502, body: { code: 'UPSTREAM_ERROR', message: '云函数转发失败，请检查上游配置' } };
  }
};
