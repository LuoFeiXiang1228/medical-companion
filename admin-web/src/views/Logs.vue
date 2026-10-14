<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filters">
        <el-select v-model="filters.operatorType" placeholder="操作者类型" clearable style="width: 150px" @change="load">
          <el-option label="管理员" value="admin" />
          <el-option label="陪诊员" value="companion" />
          <el-option label="用户" value="user" />
          <el-option label="系统" value="system" />
        </el-select>
        <el-input v-model="filters.resourceType" placeholder="资源类型（如 order）" style="width: 180px" clearable @keyup.enter="load" />
        <el-input v-model="filters.action" placeholder="动作（如 LOGIN）" style="width: 160px" clearable @keyup.enter="load" />
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始"
          end-placeholder="结束"
          style="width: 260px"
        />
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="created_at" label="时间" width="165">
          <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作者" width="140">
          <template #default="{ row }">{{ row.operator_type }} #{{ row.operator_id }}</template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="150" />
        <el-table-column label="资源" width="170">
          <template #default="{ row }">{{ row.resource_type }}{{ row.resource_id ? ' #' + row.resource_id : '' }}</template>
        </el-table-column>
        <el-table-column label="详情" min-width="220">
          <template #default="{ row }">
            <span class="details">{{ detailText(row.details) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip_address" label="IP" width="130" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchLogs } from '../api/admin';

const filters = reactive({ operatorType: '', resourceType: '', action: '' });
const dateRange = ref([]);
const list = ref([]);
const loading = ref(false);

function fmtTime(v) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '';
}

function detailText(d) {
  if (!d) return '-';
  try {
    const obj = typeof d === 'string' ? JSON.parse(d) : d;
    return Object.keys(obj).map((k) => `${k}: ${obj[k]}`).join('；').slice(0, 200);
  } catch (e) {
    return String(d).slice(0, 200);
  }
}

async function load() {
  loading.value = true;
  try {
    const params = { page: 1, pageSize: 100 };
    if (filters.operatorType) params.operatorType = filters.operatorType;
    if (filters.resourceType) params.resourceType = filters.resourceType;
    if (filters.action) params.action = filters.action;
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }
    list.value = await fetchLogs(params);
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
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
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.details {
  font-size: 12px;
  color: #606266;
}
</style>
