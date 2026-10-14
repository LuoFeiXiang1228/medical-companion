<template>
  <el-container class="layout">
    <el-aside width="210px" class="aside">
      <div class="logo">陪诊服务 · 管理后台</div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#1f2d3d"
        text-color="#c0c4cc"
        active-text-color="#ffffff"
        class="menu"
      >
        <el-menu-item index="/dashboard"><span>数据看板</span></el-menu-item>
        <el-menu-item index="/orders"><span>订单管理</span></el-menu-item>
        <el-menu-item index="/companions"><span>陪诊员资质</span></el-menu-item>
        <el-menu-item index="/services"><span>服务与时段</span></el-menu-item>
        <el-menu-item index="/hospitals"><span>医院与科室</span></el-menu-item>
        <el-menu-item index="/compliance"><span>合规管理</span></el-menu-item>
        <el-menu-item index="/settings"><span>系统设置</span></el-menu-item>
        <el-menu-item index="/logs"><span>审计日志</span></el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span class="header-title">{{ title }}</span>
        <div class="header-right">
          <el-tag type="info" effect="plain">{{ currentUser.username || '管理员' }}</el-tag>
          <el-button text type="primary" @click="onLogout">退出登录</el-button>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearToken, clearUser, getUser, setUser } from '../store/auth';
import { fetchMe } from '../api/admin';

const route = useRoute();
const router = useRouter();
const currentUser = ref(getUser());

const titles = {
  dashboard: '数据看板',
  orders: '订单管理',
  companions: '陪诊员资质管理',
  services: '服务与时段',
  hospitals: '医院与科室',
  compliance: '合规管理',
  settings: '系统设置',
  logs: '审计日志',
};

const activeMenu = computed(() => '/' + (route.path.split('/')[1] || 'dashboard'));
const title = computed(() => titles[route.path.split('/')[1]] || '管理后台');

function onLogout() {
  clearToken();
  clearUser();
  router.replace('/login');
}

onMounted(async () => {
  if (!currentUser.value.username) {
    try {
      const me = await fetchMe();
      setUser({ username: me.username, role: me.role });
      currentUser.value = getUser();
    } catch (e) {
      /* 401 由请求层接管 */
    }
  }
});
</script>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: #1f2d3d;
}
.logo {
  height: 56px;
  line-height: 56px;
  text-align: center;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  background: #18222e;
  white-space: nowrap;
  overflow: hidden;
}
.menu {
  border-right: none;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.main {
  background: #f0f2f5;
  padding: 16px;
}
</style>
