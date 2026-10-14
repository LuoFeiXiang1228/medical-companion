// 公开主数据接口：服务分类 / 服务项目 / 就诊时段 / 医院 / 科室 / 服务边界 / 公开设置
const { request } = require('../utils/request');

const qs = (params) => {
  const parts = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== '' && params[k] !== null)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`);
  return parts.length ? '?' + parts.join('&') : '';
};

// 服务分类
const getCategories = () => request({ url: '/service-categories' });

// 服务项目（服务包）列表：{ categoryId, keyword }
const getPackages = (params) => request({ url: '/service-packages' + qs(params) });

// 服务项目详情
const getPackageDetail = (id) => request({ url: '/service-packages/' + id });

// 就诊时段
const getAppointSlots = () => request({ url: '/appoint-slots' });

// 医院列表（可选按城市筛选）
const getHospitals = (params) => request({ url: '/hospitals' + qs(params) });

// 某医院科室列表
const getDepartments = (hospitalId) => request({ url: `/hospitals/${hospitalId}/departments` });

// 服务边界声明（国标 8.1 可协助 / 8.2 不应开展）
const getServiceBoundary = () => request({ url: '/service-boundary' });

// 公开设置（公告 + 客服信息）
const getPublicSettings = () => request({ url: '/settings/public' });

module.exports = {
  getCategories,
  getPackages,
  getPackageDetail,
  getAppointSlots,
  getHospitals,
  getDepartments,
  getServiceBoundary,
  getPublicSettings,
};
