// 管理端登录态：token 存 localStorage，key = atoken
const TOKEN_KEY = 'atoken';
const USER_KEY = 'auser';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}
