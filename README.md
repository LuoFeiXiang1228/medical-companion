# 陪诊服务系统（开发演示框架）

微信小程序（用户与陪诊员双身份）、Vue 管理端与 Koa 服务端，覆盖预约、订单受理、人员资质和服务过程留痕。

**作者：罗费翔（LuoFeiXiang）** · MIT 许可，允许复制、修改与商用，分发时须保留作者版权声明和许可证。

作者主页：[LuoFeiXiang1228](https://github.com/LuoFeiXiang1228) · 联系邮箱：[eoggwccmgeya@163.com](mailto:eoggwccmgeya@163.com)

双击仓库根目录的 [index.html](index.html) 可离线打开交互介绍页：切换三端功能、探索服务流程、查看落地阶段和项目状态。页面为项目讲解与流程示意，不连接后端，不处理真实患者数据。

**当前定位：开源开发框架。** 默认使用模拟支付；真实支付入口已禁用，`NODE_ENV=production` 会拒绝启动。标准规则种子用于开发参考，不代表项目已完成合规认证或生产验收。

## 功能与目录

| 目录 | 内容 |
| --- | --- |
| `server/` | Node.js / Koa API、MySQL 数据结构与演示种子 |
| `admin-web/` | Vue 3 / Element Plus / ECharts 管理界面 |
| `miniprogram-merged/` | 用户预约、就医人档案、陪诊员申请与任务打卡 |
| `scripts/` | JavaScript / JSON / 小程序导航静态检查 |
| `docs/` | 项目状态、此次改动、公开上传步骤 |

已有能力：服务与医院浏览、预约订单、模拟支付、后台受理、资质审核、陪诊任务、节点留痕、规则维护、审计日志。评价、投诉和生产支付仍需完善，详见 [项目状态](docs/PROJECT_STATUS.md)。

## 环境

Node.js **22.12 或以上**（建议使用 24）、npm、MySQL 8.0；小程序开发需要微信开发者工具。Docker Compose 可用于启动本地 MySQL。当前流程无需 Redis。

## 快速开始

### 1. 服务端与数据库

在仓库根目录执行：

```sh
cd server
npm ci
node scripts/setup-env.js
```

初始化脚本会生成未提交的 `.env`，自动随机生成 JWT 密钥和本地数据库密码，不覆盖已有配置。

**新建 Docker 数据库**：

```sh
docker compose up -d --wait
```

首次创建数据卷时会自动导入表结构、规则和演示数据，**不需要再运行 db-init.js**。数据库仅绑定本机端口，数据保存至命名卷。重复启动沿用旧数据；不要对已有数据执行清卷操作。

**已有 MySQL**：修改 `.env` 的连接信息，确认使用全新的 `peizhen` 数据库，然后执行：

```sh
node scripts/db-init.js
```

SQL 固定使用 `peizhen` 库名，表结构初始化不是迁移工具，不能重复导入已建表数据库。初始化失败可能已创建部分表，请先检查。

创建管理员（PowerShell）：

```powershell
$env:ADMIN_PASSWORD = Read-Host '设置管理员密码（12–128位）'
node scripts/create-admin.js admin
Remove-Item Env:ADMIN_PASSWORD
npm run dev
```

macOS / Linux 可执行 `read -s ADMIN_PASSWORD; export ADMIN_PASSWORD`，创建后执行 `unset ADMIN_PASSWORD`。管理员脚本不提供默认密码，不打印密码。账号需为 4–32 位字母、数字或下划线。

健康检查：`http://localhost:3000/api/v1/health`。该接口只说明 HTTP 服务启动，数据库业务可用性需另行验证。

### 2. 管理端

另开终端，在仓库根目录执行：

```sh
cd admin-web
npm ci
npm run dev
```

打开 `http://localhost:5173`，使用刚创建的账号。Vite 开发代理默认转发 `/api` 到本机 3000 端口。生产静态站点需要另行配置反向代理。

### 3. 微信小程序

在微信开发者工具中导入 `miniprogram-merged/`，统一修改 `config.js` 的 `API_BASE_URL` 和 `ADMIN_WEB_URL`。

- 本机开发默认 API 地址为 `http://localhost:3000/api/v1`。在工具的本地设置中临时关闭域名校验；公开配置默认保留校验。
- 真机上的 localhost 指向手机，需改为可访问的服务地址。正式环境按微信平台要求配置 HTTPS 与合法域名。
- `touristappid` 只适合部分页面预览；真实微信登录需要有效小程序 AppID，且服务端 `.env` 的 `WX_APPID` / `WX_SECRET` 应与小程序一致。占位符无法完成微信登录。
- `USE_MOCK=true` 仅用于页面预览，不能验证完整下单流程；后端 `PAY_CHANNEL=mock` 是另一层的模拟支付。
- 云函数 `proxy` 是可选工具，默认请求层未使用；如自行接入，云端需配置 `API_ORIGIN=https://你的后端域名`，并保留证书校验。

## 检查

在根目录运行源码检查，再分别运行测试和构建：

```sh
node scripts/check-source.cjs
cd server
npm test
cd ../admin-web
npm run build
```

GitHub Actions 自动执行以上检查。数据库订单流程、小程序真机和真实微信接口不在自动检查覆盖范围内。

## 开源与参与

采用标准 [MIT License](LICENSE)，版权署名为罗费翔（LuoFeiXiang）及项目贡献者，署名要求见 [AUTHORS.md](AUTHORS.md)。依赖和外部资料的归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题处理见 [SECURITY.md](SECURITY.md)。本次整理结果见 [改动记录](docs/CHANGES_2026-10-14.md)，上传操作见 [GitHub 上传步骤](docs/GITHUB_UPLOAD.md)。
