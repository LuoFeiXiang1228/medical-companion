// 可选云函数转发工具；默认请求层使用 wx.request 直连
// 返回形状与 wx.request success 回调一致：{ statusCode, data }，原调用逻辑无需改动
function cloudCall(method, path, headers, body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject({ errMsg: 'request:fail timeout', isTimeout: true });
    }, timeout);

    wx.cloud.callFunction({
      name: 'proxy',
      data: {
        method: (method || 'GET').toUpperCase(),
        path: path,
        headers: headers || {},
        body: (body === undefined ? null : body),
      },
    }).then((res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = (res && res.result) || {};
      resolve({ statusCode: result.statusCode || 502, data: result.body });
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err || { errMsg: 'cloud call fail' });
    });
  });
}

module.exports = { cloudCall };
