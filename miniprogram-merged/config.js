// ============================================================
// 全局配置
// ============================================================

// 管理后台网页（admin-web）的访问地址
// - 本地开发：http://localhost:5173
// - 上线时：改成你的 HTTPS 域名，例如 https://admin.yourdomain.com
//
// 进阶（上线后想在小程序里直接内嵌后台）：
//   1) 在小程序后台「开发管理 → 业务域名 / WebView 域名」里添加该 HTTPS 域名
//   2) 把 mine.js 里的 enterAdmin() 改成 wx.navigateTo 到 pages/admin-web/admin-web
//      （该页用 <web-view src="{{url}}"></web-view> 打开 ADMIN_WEB_URL）
//   注意：web-view 只对企业主体、已认证小程序开放，个人号 / 未认证不可用。
module.exports = {
  API_BASE_URL: 'http://localhost:3000/api/v1',
  USE_MOCK: false, // true 仅页面预览，不模拟完整业务流程
  ADMIN_WEB_URL: 'http://localhost:5173',
};
