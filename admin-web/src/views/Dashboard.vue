<template>
  <div class="page">
    <el-row :gutter="16">
      <el-col :span="6" v-for="c in orderCards" :key="c.label">
        <el-card shadow="never" class="stat-card">
          <div class="stat-num" :class="{ warn: c.warn }">{{ c.value }}</div>
          <div class="stat-label">{{ c.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt">
      <el-col :span="8" v-for="c in companionCards" :key="c.label">
        <el-card shadow="never" class="stat-card">
          <div class="stat-num" :class="{ warn: c.warn }">{{ c.value }}</div>
          <div class="stat-label">{{ c.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt">
      <template #header>
        <div class="card-header">
          <span>快捷操作</span>
          <el-button size="small" :loading="loading" @click="load">刷新</el-button>
        </div>
      </template>
      <el-space wrap>
        <el-button type="primary" plain @click="$router.push('/orders')">处理待受理订单</el-button>
        <el-button type="warning" plain @click="$router.push('/companions')">审核陪诊员资质</el-button>
        <el-button plain @click="$router.push('/compliance')">合规规则与体检报告</el-button>
        <el-button plain @click="$router.push('/logs')">审计日志</el-button>
      </el-space>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { fetchDashboard } from '../api/admin';

const data = ref(null);
const loading = ref(false);

const orderCards = computed(() => {
  const o = (data.value && data.value.orders) || {};
  return [
    { label: '待受理订单', value: o.pendingReview || 0, warn: (o.pendingReview || 0) > 0 },
    { label: '已支付 · 待受理', value: o.paidPending || 0 },
    { label: '进行中（受理 / 派单 / 服务）', value: o.inService || 0 },
    { label: '已完成', value: o.done || 0 },
  ];
});

const companionCards = computed(() => {
  const c = (data.value && data.value.companions) || {};
  return [
    { label: '待审核陪诊员', value: c.pendingAudit || 0, warn: (c.pendingAudit || 0) > 0 },
    { label: '已通过陪诊员', value: c.approved || 0 },
    { label: '30 天内证件到期', value: c.expiringIn30d || 0, warn: (c.expiringIn30d || 0) > 0 },
  ];
});

async function load() {
  loading.value = true;
  try {
    data.value = await fetchDashboard();
  } catch (e) {
    /* 提示由请求层处理 */
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  padding: 4px;
}
.mt {
  margin-top: 16px;
}
.stat-card {
  text-align: center;
}
.stat-num {
  font-size: 30px;
  font-weight: 600;
  color: #2d9aff;
}
.stat-num.warn {
  color: #e6a23c;
}
.stat-label {
  margin-top: 6px;
  font-size: 13px;
  color: #909399;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
