# 飞书数据同步仪表板

一个显示飞书文档和表格数据并自动同步的网站应用。

## 功能特性

- 📊 展示飞书电子表格数据
- 📄 显示飞书文档内容
- 📖 显示飞书 Wiki 页面
- 🗂️ 展示飞书多维表格（Bitable）
- 🔄 自动数据同步
- 🎨 简洁响应式界面
- ⚡ 实时更新

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
   - `docx:document`（读取文档）
   - `sheets:spreadsheet`（读取电子表格）
   - `bitable:app`（读取多维表格）
   - `wiki:wiki`（读取 Wiki 页面）

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
- `FEISHU_DOCUMENT_IDS`: 要同步的文档 ID，用逗号分隔
- `FEISHU_SHEET_IDS`: 要同步的电子表格 ID，用逗号分隔
- `FEISHU_WIKI_IDS`: 要同步的 Wiki 页面 ID，用逗号分隔
- `FEISHU_BITABLE_IDS`: 要同步的多维表格 ID，用逗号分隔

### 4. 运行应用

开发模式：
```bash
npm run dev
```

后端运行在 `http://localhost:3001`，前端运行在 `http://localhost:5173`

## 如何获取文档/表格 ID

在飞书中打开文档或表格时，ID 就在 URL 中：
- 文档：`https://example.feishu.cn/docx/[文档ID]`
- 表格：`https://example.feishu.cn/sheets/[表格ID]`
- Wiki：`https://example.feishu.cn/wiki/[WikiID]`
- 多维表格：`https://example.feishu.cn/base/[多维表格ID]`

## 项目结构

```
.
├── server/
│   ├── index.js          # Express 服务器
│   ├── feishuApi.js      # 飞书 API 集成
│   └── syncService.js    # 数据同步服务
├── client/
│   ├── src/
│   │   ├── App.jsx       # 主 React 组件
│   │   ├── components/   # React 组件
│   │   └── services/     # API 服务
│   └── ...
└── package.json
```

## API 接口

- `GET /api/health` - 健康检查
- `GET /api/documents` - 获取所有已同步文档
- `GET /api/sheets` - 获取所有已同步表格
- `GET /api/wikis` - 获取所有已同步 Wiki 页面
- `GET /api/bitables` - 获取所有已同步多维表格
- `POST /api/sync` - 触发手动同步

## 技术栈

- **后端**：Node.js、Express
- **前端**：React、Vite
- **样式**：CSS3
- **API**：飞书开放平台 API

## 许可证

MIT
