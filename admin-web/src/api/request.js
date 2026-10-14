import axios from 'axios';
import { clearToken } from '../store/auth';

const BASE_URL = import.meta.env.VITE_API_BASE || '/api/v1';

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// 请求拦截：注入 Bearer 令牌
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('atoken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

// 响应拦截：统一解包 { code, message, data }
request.interceptors.response.use(
  (res) => {
    const body = res.data;
    // 后端约定：code === 0 为成功
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body ? body.data : body;
  },
  (err) => {
    const status = err.response && err.response.status;
    const data = err.response && err.response.data;
    // 登录失效 / 无权限 -> 清除令牌并跳登录
    if (status === 401) {
      clearToken();
      if (location.hash.indexOf('/login') === -1) {
        location.hash = '#/login';
      }
    }
    const msg = (data && data.message) || err.message || '网络错误';
    return Promise.reject(new Error(msg));
  }
);

export default request;
