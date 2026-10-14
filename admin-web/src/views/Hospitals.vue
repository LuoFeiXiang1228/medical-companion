<template>
  <div class="page">
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>医院</span>
              <el-button type="primary" size="small" @click="openHospital()">新建医院</el-button>
            </div>
          </template>
          <el-table :data="hospitals" v-loading="loading" stripe highlight-current-row @current-change="onSelectHospital">
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column prop="level" label="等级" width="80" />
            <el-table-column prop="city" label="城市" width="90" />
            <el-table-column label="试点" width="70">
              <template #default="{ row }">{{ row.is_pilot ? '是' : '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click.stop="openHospital(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click.stop="removeHospital(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>科室{{ current ? '（' + current.name + '）' : '' }}</span>
              <el-button type="primary" size="small" :disabled="!current" @click="openDepartment()">新建科室</el-button>
            </div>
          </template>
          <el-empty v-if="!current" description="点击左侧医院查看 / 维护科室" :image-size="70" />
          <el-table v-else :data="departments" stripe>
            <el-table-column prop="name" label="科室" min-width="120" />
            <el-table-column prop="floor" label="楼层" width="90" />
            <el-table-column prop="building" label="楼栋" width="100" />
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button size="small" @click="openDepartment(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeDepartment(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="hospitalVisible" :title="hospitalForm.id ? '编辑医院' : '新建医院'" width="470px">
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="hospitalForm.name" /></el-form-item>
        <el-form-item label="等级"><el-input v-model="hospitalForm.level" placeholder="如 三甲" /></el-form-item>
        <el-form-item label="省 / 市">
          <el-input v-model="hospitalForm.province" placeholder="省" style="width: 45%" />
          <el-input v-model="hospitalForm.city" placeholder="市" style="width: 45%; margin-left: 5%" />
        </el-form-item>
        <el-form-item label="地址"><el-input v-model="hospitalForm.address" /></el-form-item>
        <el-form-item label="陪诊试点"><el-switch v-model="hospitalForm.isPilot" :active-value="1" :inactive-value="0" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="hospitalForm.status" :active-value="1" :inactive-value="0" active-text="启用" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="hospitalVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitHospital">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="departmentVisible" :title="departmentForm.id ? '编辑科室' : '新建科室'" width="430px">
      <el-form label-width="90px">
        <el-form-item label="所属医院">{{ current ? current.name : '' }}</el-form-item>
        <el-form-item label="科室名称"><el-input v-model="departmentForm.name" /></el-form-item>
        <el-form-item label="楼层"><el-input v-model="departmentForm.floor" placeholder="选填" /></el-form-item>
        <el-form-item label="楼栋"><el-input v-model="departmentForm.building" placeholder="选填" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="departmentForm.status" :active-value="1" :inactive-value="0" active-text="启用" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="departmentVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitDepartment">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchHospitals, createHospital, updateHospital, deleteHospital,
  fetchDepartments, createDepartment, updateDepartment, deleteDepartment,
} from '../api/admin';

const hospitals = ref([]);
const departments = ref([]);
const current = ref(null);
const loading = ref(false);
const saving = ref(false);

const hospitalVisible = ref(false);
const hospitalForm = reactive({ id: 0, name: '', level: '', province: '', city: '', address: '', isPilot: 0, status: 1 });

const departmentVisible = ref(false);
const departmentForm = reactive({ id: 0, name: '', floor: '', building: '', status: 1 });

async function loadHospitals() {
  loading.value = true;
  try {
    hospitals.value = await fetchHospitals();
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function onSelectHospital(row) {
  if (!row) return;
  current.value = row;
  try {
    departments.value = await fetchDepartments(row.id);
  } catch (e) {
    ElMessage.error(e.message || '加载科室失败');
  }
}

function openHospital(row) {
  Object.assign(hospitalForm, row
    ? { id: row.id, name: row.name, level: row.level || '', province: row.province || '', city: row.city || '', address: row.address || '', isPilot: row.is_pilot, status: row.status }
    : { id: 0, name: '', level: '', province: '', city: '', address: '', isPilot: 0, status: 1 });
  hospitalVisible.value = true;
}

async function submitHospital() {
  if (!hospitalForm.name.trim()) { ElMessage.warning('请填写医院名称'); return; }
  saving.value = true;
  try {
    const data = {
      name: hospitalForm.name.trim(), level: hospitalForm.level || undefined,
      province: hospitalForm.province || undefined, city: hospitalForm.city || undefined,
      address: hospitalForm.address || undefined, isPilot: hospitalForm.isPilot, status: hospitalForm.status,
    };
    if (hospitalForm.id) await updateHospital(hospitalForm.id, data);
    else await createHospital(data);
    ElMessage.success('已保存');
    hospitalVisible.value = false;
    loadHospitals();
  } catch (e) { ElMessage.error(e.message || '保存失败'); } finally { saving.value = false; }
}

async function removeHospital(row) {
  try { await ElMessageBox.confirm(`删除医院「${row.name}」？其下科室将保留但不再展示。`, '删除确认', { type: 'warning' }); } catch (e) { return; }
  try {
    await deleteHospital(row.id);
    ElMessage.success('已删除');
    if (current.value && current.value.id === row.id) { current.value = null; departments.value = []; }
    loadHospitals();
  } catch (e) { ElMessage.error(e.message || '删除失败'); }
}

function openDepartment(row) {
  Object.assign(departmentForm, row
    ? { id: row.id, name: row.name, floor: row.floor || '', building: row.building || '', status: row.status }
    : { id: 0, name: '', floor: '', building: '', status: 1 });
  departmentVisible.value = true;
}

async function submitDepartment() {
  if (!departmentForm.name.trim()) { ElMessage.warning('请填写科室名称'); return; }
  saving.value = true;
  try {
    const data = {
      hospitalId: current.value.id, name: departmentForm.name.trim(),
      floor: departmentForm.floor || undefined, building: departmentForm.building || undefined,
      status: departmentForm.status,
    };
    if (departmentForm.id) await updateDepartment(departmentForm.id, data);
    else await createDepartment(data);
    ElMessage.success('已保存');
    departmentVisible.value = false;
    onSelectHospital(current.value);
  } catch (e) { ElMessage.error(e.message || '保存失败'); } finally { saving.value = false; }
}

async function removeDepartment(row) {
  try { await ElMessageBox.confirm(`删除科室「${row.name}」？`, '删除确认', { type: 'warning' }); } catch (e) { return; }
  try {
    await deleteDepartment(row.id);
    ElMessage.success('已删除');
    onSelectHospital(current.value);
  } catch (e) { ElMessage.error(e.message || '删除失败'); }
}

onMounted(loadHospitals);
</script>

<style scoped>
.page {
  padding: 4px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
