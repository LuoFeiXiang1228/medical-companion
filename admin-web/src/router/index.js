import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn } from '../store/auth';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../layout/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'orders', name: 'orders', component: () => import('../views/Orders.vue') },
      { path: 'companions', name: 'companions', component: () => import('../views/Companions.vue') },
      { path: 'services', name: 'services', component: () => import('../views/Services.vue') },
      { path: 'hospitals', name: 'hospitals', component: () => import('../views/Hospitals.vue') },
      { path: 'compliance', name: 'compliance', component: () => import('../views/Compliance.vue') },
      { path: 'settings', name: 'settings', component: () => import('../views/Settings.vue') },
      { path: 'logs', name: 'logs', component: () => import('../views/Logs.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 登录态守卫（角色制：登录即可访问全部管理页面）
router.beforeEach((to) => {
  const logged = isLoggedIn();
  if (!to.meta.public && !logged) {
    return { path: '/login' };
  }
  if (to.path === '/login' && logged) {
    return { path: '/dashboard' };
  }
  return true;
});

export default router;
