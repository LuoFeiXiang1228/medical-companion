# 本地包上传 GitHub

包内文件夹即仓库根目录，无需上传 ZIP 本身。项目已包含 .gitignore、LICENSE、README、依赖锁文件和 CI。

在此目录打开终端：

```sh
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Prepare open-source development framework"
```

审阅暂存文件，确认没有 `.env`、真实数据、本机私有配置或密钥。Git 首次提交可能需要自行设置作者姓名和邮箱。

在 GitHub 创建空仓库，确定仓库名和公开性，复制仓库地址后执行（替换尖括号内容）：

```sh
git remote add origin <你的仓库地址>
git push -u origin main
```

若远端已有内容，请先检查合并方案，不使用强制推送。首次上传后查看 Actions 的检查结果，并启用私密漏洞报告。

本次仅完成本地包整理，未创建 GitHub 仓库或推送；保留已有 MIT 协议。发布前还需核实第三方出处和标准规则文本的授权。
