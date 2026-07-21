# PE 个人项目维度甘特图 — 交接文档 (Handover)

本文档记录 PE Gantt 图功能从零到目前状态的完整实现细节、数据来源、已知限制和后续可做的事，
方便任何人（或其他 AI）接手后立即继续工作，不需要重新摸索。

## 功能是什么

在现有 "PE 项目统计看板" 基础上新增一个视图：**PE 个人项目维度甘特图**，展示每个 PE 名下每个
项目的 客户状态 随时间变化的时间条（例如 搭建中 → 测试中 → 维护中），类似传统项目管理甘特图，
但行是 "PE → 项目"，列是日期，每个格子代表一天，颜色代表当天的客户状态。

用户在网页顶部可以通过 "📊 统计看板 / 📅 项目甘特图" 按钮切换视图。

## 数据来源（两个完全独立的多维表格，务必不要搞混）

| 用途 | 环境变量 | 表格 | 代码位置 |
|---|---|---|---|
| PE 统计看板（原有功能，柱状图/负载计算） | `FEISHU_BITABLE_IDS` | `KshewAyAuiGsChkp4GOcMCIcnje`（多维表格 `数据表`） | `server/index.js` 的 `performSync()` / `dataStore` |
| **PE 甘特图（本次新增功能）** | `FEISHU_GANTT_WIKI_NODE` + `FEISHU_GANTT_TABLE_ID` | Wiki 节点 `KLivwayNai46IYk7ZQicUSsxn9e` 下的表格 `tbllKugetZycd9UY`（变更历史记录表） | `server/ganttService.js` |

**这两条数据管线完全不共享任何状态**。甘特图从不读取 `dataStore`，也不受主同步（`SYNC_INTERVAL`）
影响，而是自己在被请求时按需拉取（20 秒内存缓存，见下文）。

### 甘特图数据源表结构（变更历史记录表）

这张表本身就是一张"变更事件日志表"，每一行代表某个项目在某个时间点的状态：

| 字段名 | 类型 | 说明 |
|---|---|---|
| 项目 | Text | 项目名称 |
| PE | User | 该事件发生时负责这个项目的 PE |
| 变更时间 | DateTime | 该状态生效的时间点 |
| 起始状态 | SingleSelect | 项目已知的最早状态（baseline） |
| 变更状态 | SingleSelect | 之后检测到的状态变化 |
| 项目难度等级 | SingleSelect | 中等项目 / 简单项目 / 高难项目 / 流失 |

这张表由人工 + 一个叫"多维表格助手"的飞书自动化混合写入，会持续增长。**我们完全依赖这张表来重建
每个项目的状态时间线**，飞书官方本身没有任何 API 能直接查询"记录修改历史"（已反复用官方 Go SDK
`larksuite/oapi-sdk-go` 源码确认过，`bitable` 服务下只有 `Create/Get/Update/Delete/List/Search`，
没有 History/Revision 方法）。

### 如何拿到这张表（Wiki 解析流程）

用户给的链接形如：
```
https://juzihudong.feishu.cn/wiki/KLivwayNai46IYk7ZQicUSsxn9e?table=tbllKugetZycd9UY&view=vewRweZwZY
```

- URL 中 `wiki/<NODE_TOKEN>` 部分是 **Wiki 节点 token**，不是真正的 Bitable `app_token`
- 必须先调用 `GET /wiki/v2/spaces/get_node?token=<NODE_TOKEN>` 换出 `data.node.obj_token`，
  这才是真正建表用的 `app_token`
- `?table=<TABLE_ID>` 就是普通的 `table_id`，可以直接用

这个换算逻辑封装在 `server/feishuApi.js` 的 `resolveWikiNodeAppToken(token, nodeToken)`，
结果会缓存在 `ganttService.js` 的 `cachedAppToken` 变量里，避免每次都重新换算；如果换算后的
`app_token` 请求失败会自动重新换算一次再重试。

### 权限踩坑记录

最初尝试访问这张表时收到 `1254302 The role has no permissions`（不是"表不存在"的
`1254041 TableIdNotFound`）——这说明是表级高级权限（advanced permission）问题，不是链接错误。
后来用户在飞书里调整了权限，问题解决。**如果将来又出现同样报错，先去 Feishu 检查这张表的
高级权限设置，不要怀疑代码或 App ID/Secret。**

## 后端实现 (`server/ganttService.js`, `server/feishuApi.js`)

### `feishuApi.js` 新增的两个函数
- `resolveWikiNodeAppToken(token, nodeToken)` — 上面提到的 Wiki → app_token 换算
- `getTableRecords(token, appToken, tableId)` — 拉取单张表的**全部**记录（带分页，
  `page_size=500` + `automatic_fields=true` 拿到 `created_time`/`last_modified_time`）

同时修了一个影响 PE 统计看板的旧 bug：`getBitable()` 原来只拉第一页（最多 100/500 条），
现在也做了完整分页，129 条记录的表之前会漏掉后面的记录。

### `ganttService.js` 核心逻辑 `buildGanttData()`

1. 拉全表记录 → 展平成事件列表 `{ project, pe, time, status, difficulty }`
   - `status` 取 `起始状态 || 变更状态`（哪个有值就用哪个）
   - 完全没有 `起始状态` 和 `变更状态`（"empty 变更状态"）的行会被自动忽略（`if (!status) return`）
2. 按 `project` 分组，组内按 `变更时间` 排序
3. **关键逻辑**：把整个项目的时间线（跨所有 PE）当作一条链，每个事件的 `end` = **全局下一个
   事件**的时间（不是"同一个 PE 下一个事件"）。这样即使项目临时转给另一个 PE 又转回来，
   原 PE 的时间段也会在转出那一刻正确关闭，不会一直开放到"现在"造成重叠/错乱的显示。
   （这是修复 "腾讯广告/刘俊杰 从 6/7 开始却不显示" 那个 bug 的根本原因所在）
4. 关闭后的原始 segment 列表按 PE 重新分组成"runs"（同一个 PE 连续拥有的时间段），
   每个 run 会生成一行 Gantt 数据
5. 已流失/封号：这两个状态永远不会作为一个有颜色/有文字的 segment 显示。触发时会把
   **前一个** segment 的 `end` 设置为这个事件的时间；如果这是这个 run 的第一个事件
   （没有前一个 segment），就生成一个中性的 `__ended__` 占位 segment
   （颜色 `#e2e8f0`，斜线纹理，无文字标签）
6. `endedAt` 只会设置在**最后一个 run** 上（项目只会真正"结束"一次；中途的 PE 交接不算结束）
7. `difficulty` 取该 PE 名下所有事件里最新一条非空的 `项目难度等级`

结果通过 20 秒内存缓存（`CACHE_TTL_MS`）避免每次前端轮询都打飞书 API。

### API 路由

`GET /api/pe-gantt`（在 `server/index.js` 和 `api/index.js` 里都加了，Vercel serverless
入口也要保持同步）：
```js
app.get('/api/pe-gantt', async (req, res) => {
  const gantt = await ganttService.buildGanttData();
  res.json(gantt); // { projects: [...], lastSync: "..." }
});
```

返回的每个 project 长这样：
```json
{
  "recordId": "项目名__PE名__run序号",
  "project": "卫瓴-金壶春",
  "pe": "刘海生",
  "segments": [
    { "status": "维护中", "start": 1783526400000, "end": 1783580743902 },
    { "status": "调优中", "start": 1783580743902, "end": null }
  ],
  "endedAt": null,
  "difficulty": "简单项目"
}
```
`end: null` 代表这个 segment 目前仍在进行中（还没有更新的事件）。

## 前端实现 (`client/src/components/PEGanttChart.jsx` + `.css`)

已从 `App.jsx` 接入：新增了 `view` state（`'stats' | 'gantt'`），header 有个
`view-switch` 按钮组切换。`App.jsx` 顶部 `import PEGanttChart from './components/PEGanttChart'`。

### 数据获取
`client/src/services/api.js` 新增 `getPEGantt()`，`fetch('/api/pe-gantt')`。
组件内 `loadData()` 首次加载 + 每 30 秒静默轮询一次（`POLL_MS`），与主看板的刷新节奏保持一致。

### 时间轴范围（重要，多次调整过）
当前：**过去 10 天 到 今天**（`DAYS_BEFORE = 10, DAYS_AFTER = 0`，共 11 天），**不可平移**。
超出这个范围的项目/时间段完全不显示（不是灰色淡化，是直接过滤掉不渲染）。

⚠️ 这个范围之前改过好几次（3+7 → 5+5 → 7+0 → 10+0），如果又要改，只需要改
`DAYS_BEFORE`/`DAYS_AFTER` 这两个常量，其余逻辑都是基于这两个值自动算的。

### 日期格式化的坑（已修复，务必记住）
`formatFullDate()` 一开始用了 `date.toISOString().slice(0,10)`，这个函数是转成 **UTC** 时间再
取日期，但用户机器是 UTC+8（中国时区），本地午夜 0 点转成 UTC 会变成前一天，导致显示范围文字
（"显示范围: 2026-07-02 ~ 2026-07-09"）比实际时间轴格子（显示 7/03 ~ 7/10）整整早了一天。
**修复方式**：改用 `getFullYear()/getMonth()/getDate()` 手动拼字符串（本地时间），
和 `formatDayLabel()` 保持完全一致的取值方式。**以后任何涉及日期显示的地方都不要用
`toISOString()`，一律用本地 getter。**

### 每日状态判定逻辑 `getStatusForDay(sortedSegments, day, today)`

规则（这条逻辑改了几轮才定下来，逐条对应用户的原话）：
1. 一天一个格子，一个格子只能有一个状态，不会一天里显示两个状态一半一半
2. 如果某天发生了状态变更，**变更当天**整格显示**新**状态
3. **前一个状态会一直显示到新状态生效的前一天**（哪怕新状态的变更时间是未来某天也一样）——
   这是最后一次调整加的规则，之前的版本错误地"提前一天"截断了前一个状态
4. 唯一的例外：**项目当前最新的、没有后续事件的那个 segment**，只显示到"今天"为止，
   不会因为它还"没结束"就自动往未来的日期里延伸（不做外推/假设）。
   但如果这个最新 segment 本身的开始时间就是未来某天（表里已经记录了一个未来才生效的变更），
   那从它自己的开始日期起就正常显示，不受这条限制。

### 相同颜色格子合并 `buildDayRuns()`

原本是每天一个独立方块（哪怕连续 5 天都是"维护中"也是 5 个格子，每格都写"维护中"字），
现在改成：**连续同状态的天数合并成一个更宽的方块，文字只在合并后的方块中间显示一次**。

### 排除规则

以下项目**完全不显示**在图上（不是灰显，是从数据里过滤掉）：
- `endedAt` 不为 null（客户状态已经是 已流失 或 封号）
- `difficulty === '流失'`（项目难度等级字段本身标记为"流失"，即使客户状态字段没显示已流失）

### 难度徽章列

时间轴格子右边多加了一列，显示 `项目难度等级`（高难项目=红、中等项目=橙、简单项目=绿、
流失=灰，但"流失"的项目根本不会出现在列表里，所以实际只会看到红/橙/绿）。

### 布局/样式细节
- 一天一格，固定宽度 `CELL_WIDTH_PX = 88px`（够放下状态文字）
- 图表容器 `.pe-gantt-scroll` 设了 `max-height: 70vh` + `overflow: auto`（横向+纵向都能滚动），
  这样时间轴表头（sticky top）才能在纵向滚动时真正固定住——**之前的坑**：只设
  `overflow-x: auto` 没设 `overflow-y`，浏览器会自动把 `overflow-y` 也变成 `auto`，
  但滚动容器变成了别的元素，导致 `position: sticky` 完全不生效。加上明确的 `max-height`
  才能让 `.pe-gantt-scroll` 自己变成真正的滚动容器
- 自定义了滚动条样式（钢蓝色渐变滑块，匹配整站配色 `#274c77/#6096ba/#a3cef1`），
  深色模式下用了另一套配色（`#4a5578/#6b7aa8`）
- 深色模式下之前漏了 `.pe-gantt-header-row`（时间轴表头背景）的 dark 覆盖，一直是白底，
  已补上（`#1f2430`背景 + 浅蓝文字）。**如果以后深色模式下又发现某个区块是白的，
  基本都是同类问题：某个类名只写了亮色样式没写 `.dark-theme .xxx` 对应覆盖**

## 已知限制 / 未解决的问题

1. **数据质量问题（源表本身的问题，不是代码 bug）**：
   - `松下` 项目在同一时间点有两条不同 PE 的 `起始状态` 记录（麦海铭 vs 胡晓溪），
     导致会同时显示两条并列的 Gantt 行
   - `腾讯广告` 项目也曾有类似冲突（已通过"全局排序而非按PE排序"的修复间接改善，
     但如果源表继续有同类冲突数据，仍可能出现重复行）
   - 这些应该找维护这张变更历史表的人（或那个"多维表格助手"自动化的负责人）核实，
     不是本功能代码能解决的问题
2. **无法回溯历史**：这张变更历史表是从某个时间点开始才有数据的，更早的项目状态变化
   （如果发生在这张表存在之前）无法重建，Gantt 图只能显示表里已有记录覆盖到的时间范围
3. **client/src/data/ 是个空文件夹**：曾经放过 `peGanttDemoData.js`（早期用假数据做原型时
   创建），后来改成读真实 API 后删除了该文件，文件夹本身没清理，可以直接删掉
4. `client/package.json` 依赖里只有 `recharts`，Gantt 图本身没用任何额外图表库，
   是纯 CSS/flexbox 手写的网格，没有引入新依赖

## 环境变量清单（`.env` / `.env.example` 都已同步更新）

```
FEISHU_APP_ID=          # 飞书应用凭证，两条数据管线共用同一个 App
FEISHU_APP_SECRET=
PORT=3001
SYNC_INTERVAL=1         # 只影响 PE 统计看板的自动同步，不影响甘特图
FEISHU_BITABLE_IDS=      # PE 统计看板数据源
FEISHU_GANTT_WIKI_NODE=  # 甘特图数据源 - Wiki 节点 token
FEISHU_GANTT_TABLE_ID=   # 甘特图数据源 - 变更历史表 table_id
```

## 如果要继续做下去，接下来可以做的事

- 如果源表的多 PE 冲突数据问题解决了，可以考虑给冲突数据加个前端警示 tooltip 而不是直接
  重复显示两行
- 时间轴范围目前是硬编码的固定窗口，如果之后又要改成可滑动/可自选日期范围，之前删掉的
  pan/nav 相关代码在 git 历史里能找到参考（`◀ 上一区间` / `今天` / `后一区间 ▶` 按钮），
  但当前版本按最新需求是完全不可平移的固定窗口
- 目前没有任何单元测试覆盖 `buildSegmentsAndRuns` / `getStatusForDay` 这两个核心逻辑函数，
  这两个函数逻辑绕得比较多（尤其是"前一状态延续到变更前一天但当前状态不外推到未来"这条），
  如果要重构建议先补测试再动手，避免改出回归
