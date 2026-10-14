// 小程序静态核查脚本（可复用）
// 用法：node 小程序静态核查.js <小程序目录>
// 检查：①注册页面文件存在性 ②tabBar 指向 ③跳转方法/目标一致性（switchTab 必须是 tab 页；navigateTo/redirectTo 不能指向 tab 页）
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || '.';
process.chdir(root);

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const pages = new Set(app.pages.map((p) => '/' + p));
const tabs = new Set((app.tabBar.list || []).map((t) => '/' + t.pagePath));
const issues = [];

// 1) 注册页面文件存在性
for (const p of app.pages) {
  if (!fs.existsSync(p + '.js')) issues.push('缺失页面文件（主包）: ' + p);
}
for (const sub of app.subpackages || []) {
  for (const p of sub.pages) {
    const fp = sub.root + '/' + p + '.js';
    if (!fs.existsSync(fp)) issues.push('缺失页面文件（分包）: ' + fp);
  }
}
// 2) tabBar 指向必须已注册
for (const t of app.tabBar.list || []) {
  if (!pages.has('/' + t.pagePath)) issues.push('tabBar 指向未注册页面: ' + t.pagePath);
}

// 3) 跳转方法/目标一致性
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) walk(fp, out);
    else if (f.endsWith('.js')) out.push(fp);
  }
  return out;
}
const files = walk('pages', []).concat(['custom-tab-bar/index.js']).filter((f) => fs.existsSync(f));
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /wx\.(navigateTo|redirectTo|reLaunch|switchTab)\(\{\s*url:\s*['"`]([^'"`?]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const method = m[1];
    const target = m[2];
    if (!pages.has(target)) {
      issues.push(`${f} -> ${target}（目标未注册）[${method}]`);
      continue;
    }
    const isTab = tabs.has(target);
    if (method === 'switchTab' && !isTab) issues.push(`${f} -> ${target}（switchTab 目标必须是 tab 页）`);
    if ((method === 'navigateTo' || method === 'redirectTo') && isTab) issues.push(`${f} -> ${target}（${method} 不能用于 tab 页）`);
  }
}

if (issues.length) {
  console.log('发现 ' + issues.length + ' 个问题：');
  issues.forEach((i) => console.log('  [!] ' + i));
  process.exitCode = 1;
} else {
  console.log('静态核查通过：页面注册、文件存在、跳转方法/目标全部一致 ✓');
}
