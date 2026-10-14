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

本项目已于 2026-10-14 上传至公开仓库 [LuoFeiXiang1228/medical-companion](https://github.com/LuoFeiXiang1228/medical-companion)，默认分支为 main。首次 GitHub Actions 源码检查、后端测试和管理端构建均通过。保留 MIT 协议；第三方出处和标准规则文本授权的核实仍见 THIRD_PARTY_NOTICES.md。
