<template>
  <div class="page">
    <el-card shadow="never">
      <el-tabs v-model="tab">
        <!-- 服务分类 -->
        <el-tab-pane label="服务分类" name="categories">
          <div class="toolbar">
            <el-button type="primary" @click="openCategory()">新建分类</el-button>
          </div>
          <el-table :data="categories" v-loading="loading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="code" label="编码" width="110" />
            <el-table-column prop="sort" label="排序" width="80" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="plain">{{ row.status === 1 ? '上架' : '隐藏' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openCategory(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeCategory(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 服务项目 -->
        <el-tab-pane label="服务项目" name="packages">
          <div class="toolbar">
            <el-button type="primary" @click="openPackage()">新建服务项目</el-button>
          </div>
          <el-table :data="packages" v-loading="loading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="名称" min-width="170" />
            <el-table-column prop="category_name" label="分类" width="110" />
            <el-table-column prop="price" label="价格" width="90" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="plain">{{ row.status === 1 ? '上架' : '下架' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="需就医人/家属授权" width="170">
              <template #default="{ row }">
                {{ row.requires_patient_info ? '需就医人' : '不填就医人' }} / {{ row.requires_family_consent ? '需授权' : '不需授权' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openPackage(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removePackage(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 就诊时段 -->
        <el-tab-pane label="就诊时段" name="slots">
          <div class="toolbar">
            <el-button type="primary" @click="openSlot()">新建时段</el-button>
          </div>
          <el-table :data="slots" v-loading="loading" stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="time_label" label="时段" min-width="130" />
            <el-table-column prop="cutoff_time" label="截单时间" width="120" />
            <el-table-column prop="sort" label="排序" width="80" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openSlot(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeSlot(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 分类弹窗 -->
    <el-dialog v-model="categoryVisible" :title="categoryForm.id ? '编辑分类' : '新建分类'" width="420px">
      <el-form label-width="70px">
        <el-form-item label="名称"><el-input v-model="categoryForm.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="categoryForm.code" placeholder="选填，如 FULL" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="categoryForm.sort" :min="0" /></el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="categoryForm.status" :active-value="1" :inactive-value="0" active-text="上架" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCategory">保存</el-button>
      </template>
    </el-dialog>

    <!-- 服务项目弹窗 -->
    <el-dialog v-model="packageVisible" :title="packageForm.id ? '编辑服务项目' : '新建服务项目'" width="520px">
      <el-form label-width="110px">
        <el-form-item label="名称"><el-input v-model="packageForm.name" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="packageForm.categoryId" placeholder="选择分类" clearable>
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="价格（元）"><el-input v-model="packageForm.price" /></el-form-item>
        <el-form-item label="计费方式">
          <el-select v-model="packageForm.serviceMode">
            <el-option label="按次" :value="1" />
            <el-option label="按时" :value="2" />
            <el-option label="按天" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="预计时长（分）"><el-input-number v-model="packageForm.durationMinutes" :min="0" /></el-form-item>
        <el-form-item label="需就医人信息">
          <el-switch v-model="packageForm.requiresPatientInfo" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="需家属授权">
          <el-switch v-model="packageForm.requiresFamilyConsent" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="packageForm.status" :active-value="1" :inactive-value="0" active-text="上架" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="packageForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="packageVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPackage">保存</el-button>
      </template>
    </el-dialog>

    <!-- 时段弹窗 -->
    <el-dialog v-model="slotVisible" :title="slotForm.id ? '编辑时段' : '新建时段'" width="420px">
      <el-form label-width="90px">
        <el-form-item label="时段名称"><el-input v-model="slotForm.timeLabel" placeholder="如 08:00-12:00" /></el-form-item>
        <el-form-item label="截单时间">
          <el-time-picker v-model="slotForm.cutoffTime" value-format="HH:mm:ss" placeholder="选择时间" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="slotForm.sort" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="slotVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitSlot">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchPackages, createPackage, updatePackage, deletePackage,
  fetchSlots, createSlot, updateSlot, deleteSlot,
} from '../api/admin';

const tab = ref('categories');
const loading = ref(false);
const saving = ref(false);

const categories = ref([]);
const packages = ref([]);
const slots = ref([]);

const categoryVisible = ref(false);
const categoryForm = reactive({ id: 0, name: '', code: '', sort: 0, status: 1 });

const packageVisible = ref(false);
const packageForm = reactive({
  id: 0, name: '', categoryId: null, price: '', serviceMode: 1, durationMinutes: 120,
  requiresPatientInfo: 1, requiresFamilyConsent: 1, status: 1, description: '',
});

const slotVisible = ref(false);
const slotForm = reactive({ id: 0, timeLabel: '', cutoffTime: '', sort: 0 });

async function load() {
  loading.value = true;
  try {
    const [c, p, s] = await Promise.all([fetchCategories(), fetchPackages(), fetchSlots()]);
    categories.value = c || [];
    packages.value = p || [];
    slots.value = s || [];
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCategory(row) {
  Object.assign(categoryForm, row
    ? { id: row.id, name: row.name, code: row.code || '', sort: row.sort || 0, status: row.status }
    : { id: 0, name: '', code: '', sort: 0, status: 1 });
  categoryVisible.value = true;
}
async function submitCategory() {
  if (!categoryForm.name.trim()) { ElMessage.warning('请填写分类名称'); return; }
  saving.value = true;
  try {
    const data = { name: categoryForm.name.trim(), code: categoryForm.code || undefined, sort: categoryForm.sort, status: categoryForm.status };
    if (categoryForm.id) await updateCategory(categoryForm.id, data);
    else await createCategory(data);
    ElMessage.success('已保存');
    categoryVisible.value = false;
    load();
  } catch (e) { ElMessage.error(e.message || '保存失败'); } finally { saving.value = false; }
}
async function removeCategory(row) {
  try { await ElMessageBox.confirm(`删除分类「${row.name}」？`, '删除确认', { type: 'warning' }); } catch (e) { return; }
  try { await deleteCategory(row.id); ElMessage.success('已删除'); load(); } catch (e) { ElMessage.error(e.message || '删除失败'); }
}

function openPackage(row) {
  Object.assign(packageForm, row
    ? {
      id: row.id, name: row.name, categoryId: row.category_id, price: String(row.price),
      serviceMode: row.service_mode || 1, durationMinutes: row.duration_minutes || 0,
      requiresPatientInfo: row.requires_patient_info, requiresFamilyConsent: row.requires_family_consent,
      status: row.status, description: row.description || '',
    }
    : {
      id: 0, name: '', categoryId: null, price: '', serviceMode: 1, durationMinutes: 120,
      requiresPatientInfo: 1, requiresFamilyConsent: 1, status: 1, description: '',
    });
  packageVisible.value = true;
}
async function submitPackage() {
  if (!packageForm.name.trim()) { ElMessage.warning('请填写名称'); return; }
  if (!packageForm.price || isNaN(Number(packageForm.price))) { ElMessage.warning('请填写正确价格'); return; }
  saving.value = true;
  try {
    const data = {
      name: packageForm.name.trim(), categoryId: packageForm.categoryId || undefined,
      price: Number(packageForm.price), serviceMode: packageForm.serviceMode,
      durationMinutes: packageForm.durationMinutes || undefined,
      requiresPatientInfo: packageForm.requiresPatientInfo, requiresFamilyConsent: packageForm.requiresFamilyConsent,
      status: packageForm.status, description: packageForm.description || undefined,
    };
    if (packageForm.id) await updatePackage(packageForm.id, data);
    else await createPackage(data);
    ElMessage.success('已保存');
    packageVisible.value = false;
    load();
  } catch (e) { ElMessage.error(e.message || '保存失败'); } finally { saving.value = false; }
}
async function removePackage(row) {
  try { await ElMessageBox.confirm(`删除服务项目「${row.name}」？`, '删除确认', { type: 'warning' }); } catch (e) { return; }
  try { await deletePackage(row.id); ElMessage.success('已删除'); load(); } catch (e) { ElMessage.error(e.message || '删除失败'); }
}

function openSlot(row) {
  Object.assign(slotForm, row
    ? { id: row.id, timeLabel: row.time_label, cutoffTime: row.cutoff_time, sort: row.sort || 0 }
    : { id: 0, timeLabel: '', cutoffTime: '', sort: 0 });
  slotVisible.value = true;
}
async function submitSlot() {
  if (!slotForm.timeLabel.trim()) { ElMessage.warning('请填写时段名称'); return; }
  if (!slotForm.cutoffTime) { ElMessage.warning('请选择截单时间'); return; }
  saving.value = true;
  try {
    const data = { timeLabel: slotForm.timeLabel.trim(), cutoffTime: slotForm.cutoffTime, sort: slotForm.sort };
    if (slotForm.id) await updateSlot(slotForm.id, data);
    else await createSlot(data);
    ElMessage.success('已保存');
    slotVisible.value = false;
    load();
  } catch (e) { ElMessage.error(e.message || '保存失败'); } finally { saving.value = false; }
}
async function removeSlot(row) {
  try { await ElMessageBox.confirm(`删除时段「${row.time_label}」？`, '删除确认', { type: 'warning' }); } catch (e) { return; }
  try { await deleteSlot(row.id); ElMessage.success('已删除'); load(); } catch (e) { ElMessage.error(e.message || '删除失败'); }
}

onMounted(load);
</script>

<style scoped>
.page {
  padding: 4px;
}
.toolbar {
  margin-bottom: 14px;
}
</style>
