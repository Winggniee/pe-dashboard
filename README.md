# PE 项目工作负载看板

一个从飞书多维表格同步项目数据，并计算展示每位 PE（项目负责人）工作负载的看板应用。

## 功能特性

- �️ 自动同步飞书多维表格（Bitable）数据
- � 按客户状态分类的堆叠条形图
- 🧮 可调节权重的工作负载计算（难度 × 客户状态）
- � 团队人力分布（深度工作 / 半阻塞 / 空闲）
- 🔄 自动数据同步（默认每 1 分钟）
- 🎨 响应式界面

## 准备工作

1. 飞书账号
2. 飞书自建应用（获取 App ID 和 App Secret）
3. Node.js 16+ 已安装

## 设置步骤

### 1. 创建飞书自建应用

1. 访问[飞书开放平台](https://open.feishu.cn/app)
2. 创建新的自建应用
3. 获取 App ID 和 App Secret
4. 添加所需权限：
   - `bitable:app`（读取多维表格）

### 2. 安装依赖

```bash
npm run install-all
```

### 3. 配置环境变量

```bash
copy .env.example .env
```

编辑 `.env` 文件，添加你的凭证：
- `FEISHU_APP_ID`: 你的应用 ID
- `FEISHU_APP_SECRET`: 你的应用密钥
- `FEISHU_BITABLE_IDS`: 要同步的多维表格 ID，用逗号分隔（支持 `appToken` 或 `appToken:tableId` 格式）

### 4. 运行应用

开发模式：
```bash
npm run dev
```

后端运行在 `http://localhost:3001`，前端运行在 `http://localhost:5173`

## 如何获取多维表格 ID

在飞书中打开多维表格时，ID 就在 URL 中：
`https://example.feishu.cn/base/[appToken]?table=[tableId]`

## 项目结构

```
.
├── server/
│   ├── index.js          # Express 服务器（本地开发）
│   ├── feishuApi.js      # 飞书 API 集成
│   └── syncService.js    # 数据同步服务
├── api/
│   └── index.js          # Vercel serverless 函数
├── client/
│   ├── src/
│   │   ├── App.jsx       # 主 React 组件
│   │   └── services/     # API 服务
│   └── ...
└── package.json
```

## API 接口

- `GET /api/health` - 健康检查
- `GET /api/bitables` - 获取所有已同步多维表格
- `GET /api/pe-stats` - 获取 PE 工作负载统计（支持权重参数）
- `POST /api/sync` - 触发手动同步

## 技术栈

- **后端**：Node.js、Express
- **前端**：React、Vite、Recharts
- **样式**：CSS3
- **API**：飞书开放平台 API
- **部署**：Vercel

## 许可证

MIT
