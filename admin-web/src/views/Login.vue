<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <div class="login-title">陪诊服务 · 管理后台</div>
      <el-form :model="form" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="管理员账号" size="large" clearable />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="onSubmit">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { adminLogin } from '../api/admin';
import { setToken, setUser } from '../store/auth';

const router = useRouter();
const form = reactive({ username: '', password: '' });
const loading = ref(false);

async function onSubmit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    const data = await adminLogin(form.username, form.password);
    setToken(data.token);
    setUser({ username: form.username, role: data.role });
    ElMessage.success('登录成功');
    router.replace('/dashboard');
  } catch (e) {
    ElMessage.error(e.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #2d4a6b 100%);
}
.login-card {
  width: 360px;
  padding: 8px 12px;
}
.login-title {
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  margin: 12px 0 24px;
}
.login-btn {
  width: 100%;
}
</style>
