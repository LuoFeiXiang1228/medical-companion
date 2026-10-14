// 管理端 API（陪诊版）
import request from './request';

// ===== 认证 =====
export const adminLogin = (username, password) => request.post('/admin/login', { username, password });
export const fetchMe = () => request.get('/admin/me');

// ===== 看板 =====
export const fetchDashboard = () => request.get('/admin/dashboard');

// ===== 订单 =====
export const fetchOrders = (params) => request.get('/admin/orders', { params });
export const fetchOrderDetail = (id) => request.get(`/admin/orders/${id}`);
export const acceptOrder = (id) => request.post(`/admin/orders/${id}/accept`);

// ===== 陪诊员资质 =====
export const fetchCompanions = (params) => request.get('/admin/companions', { params });
export const fetchCompanion = (id) => request.get(`/admin/companions/${id}`);
export const auditCompanion = (id, result, comment) => request.post(`/admin/companions/${id}/audit`, { result, comment });
export const saveCompanionCert = (id, payload) => request.post(`/admin/companions/${id}/certificates`, payload);
export const verifyCompanionCert = (id, certificateId) => request.post(`/admin/companions/${id}/verify`, { certificateId });
export const fetchExpiringCompanions = (days) => request.get('/admin/companions/expiring', { params: { days } });

// ===== 服务分类 =====
export const fetchCategories = () => request.get('/admin/service-categories');
export const createCategory = (data) => request.post('/admin/service-categories', data);
export const updateCategory = (id, data) => request.put(`/admin/service-categories/${id}`, data);
export const deleteCategory = (id) => request.delete(`/admin/service-categories/${id}`);

// ===== 服务项目 =====
export const fetchPackages = () => request.get('/admin/service-packages');
export const createPackage = (data) => request.post('/admin/service-packages', data);
export const updatePackage = (id, data) => request.put(`/admin/service-packages/${id}`, data);
export const deletePackage = (id) => request.delete(`/admin/service-packages/${id}`);

// ===== 就诊时段 =====
export const fetchSlots = () => request.get('/admin/appoint-slots');
export const createSlot = (data) => request.post('/admin/appoint-slots', data);
export const updateSlot = (id, data) => request.put(`/admin/appoint-slots/${id}`, data);
export const deleteSlot = (id) => request.delete(`/admin/appoint-slots/${id}`);

// ===== 医院 / 科室 =====
export const fetchHospitals = () => request.get('/admin/hospitals');
export const createHospital = (data) => request.post('/admin/hospitals', data);
export const updateHospital = (id, data) => request.put(`/admin/hospitals/${id}`, data);
export const deleteHospital = (id) => request.delete(`/admin/hospitals/${id}`);

export const fetchDepartments = (hospitalId) => request.get('/admin/departments', { params: { hospitalId } });
export const createDepartment = (data) => request.post('/admin/departments', data);
export const updateDepartment = (id, data) => request.put(`/admin/departments/${id}`, data);
export const deleteDepartment = (id) => request.delete(`/admin/departments/${id}`);

// ===== 合规 =====
export const fetchRules = () => request.get('/admin/compliance-rules');
export const updateRule = (id, data) => request.put(`/admin/compliance-rules/${id}`, data);
export const testRule = (id, text) => request.post(`/admin/compliance-rules/${id}/test`, { text });
export const genComplianceReport = (payload) => request.post('/admin/compliance-report', payload);

// ===== 系统设置 =====
export const fetchSettings = () => request.get('/admin/settings');
export const saveSettings = (data) => request.put('/admin/settings', data);

// ===== 审计日志 =====
export const fetchLogs = (params) => request.get('/admin/logs', { params });
