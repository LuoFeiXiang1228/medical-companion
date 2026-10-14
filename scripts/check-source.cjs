const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let files = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules','dist','.git','uploads'].includes(item.name)) continue;
    const full = path.join(dir,item.name);
    if (item.isDirectory()) { walk(full); continue; }
    if (/\.(js|cjs)$/.test(item.name)) {
      const result=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});
      if(result.status!==0) throw Error(result.stderr || `Syntax check failed: ${full}`);
      files++;
    } else if (item.name.endsWith('.json')) { JSON.parse(fs.readFileSync(full,'utf8')); files++; }
  }
}
walk(root);
const result=spawnSync(process.execPath,[path.join(__dirname,'check-miniprogram.cjs'),path.join(root,'miniprogram-merged')],{stdio:'inherit'});
if(result.status!==0) process.exit(result.status || 1);
console.log(`源码语法及 JSON 检查通过：${files} 个文件`);
