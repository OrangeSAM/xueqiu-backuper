# 雪球备份

桌面端雪球帖子抓取与浏览工具。支持抓取用户时间线、文章正文、嵌套评论到本地 SQLite 数据库，并提供原生 macOS / Windows 浏览界面。

## 功能特性

- **时间线抓取** — 带限速的批量抓取，防止 IP 被封
- **文章正文提取** — 从帖子页面提取完整文章内容
- **嵌套评论** — 获取所有评论及递归子评论
- **本地 SQLite 存储** — 帖子与评论存储在 WAL 模式 SQLite 中，可移植、可查询
- **增量刷新** — 单独刷新某个帖子的点赞、评论等数据
- **搜索** — 按标题或内容筛选帖子
- **原生桌面应用** — 基于 Tauri v2，启动速度快，无命令行窗口
- **跨平台** — macOS 产出 `.app` + `.dmg`，Windows 产出 `.msi`

## 环境要求

- [Rust](https://rustup.rs) 1.77+
- [Node.js](https://nodejs.org) 18+
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Microsoft Visual Studio C++ Build Tools

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 生产构建
npm run build
```

构建产物位置：
- macOS: `src-tauri/target/release/bundle/macos/雪球备份.app` 和 `.dmg`
- Windows: `src-tauri/target/release/bundle/msi/雪球备份_*.msi`

## 使用说明

### 设置 Cookie

1. 打开应用，点击侧边栏顶部的齿轮图标（⚙）
2. 在浏览器中登录 [xueqiu.com](https://xueqiu.com)
3. 打开开发者工具 → Application → Cookies，复制 `xq_a_token` 的值
4. 在设置面板中粘贴，格式为 `xq_a_token=你的Cookie值`
5. 填入你的用户 ID（雪球个人主页 URL 中的数字 ID）

### 抓取新帖子

点击侧边栏的下载按钮（↓）。应用会：
1. 拉取用户时间线（全部原创帖子）
2. 逐篇抓取文章正文和评论
3. 存入 SQLite 数据库

顶部会显示进度条。帖子之间有 2–5 秒随机延迟，防止触发风控。

### 浏览帖子

- 左侧栏：滚动浏览帖子列表，点击选择
- 搜索框：按标题或描述筛选
- 右侧面板：文章正文 + 评论树
- 刷新按钮：单独更新某一篇帖子的最新数据

## 项目结构

```
xueqiu/
├── index.html              # 前端入口（Vite）
├── app.js                  # 前端逻辑（Tauri IPC）
├── vite.config.js          # Vite 打包配置
├── package.json            # Node 依赖与脚本
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # 应用入口
│   │   ├── lib.rs          # Tauri 配置与命令注册
│   │   ├── db.rs           # SQLite 数据库层
│   │   ├── scraper.rs      # 雪球 HTTP 爬虫
│   │   └── commands.rs     # Tauri IPC 命令
│   ├── Cargo.toml          # Rust 依赖
│   ├── tauri.conf.json     # Tauri 配置
│   └── capabilities/       # 权限声明
└── dist/                   # Vite 构建产物（gitignored）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri v2 |
| 后端 | Rust (rusqlite, reqwest, tokio) |
| 前端 | 原生 JS + Vite |
| 数据库 | SQLite WAL 模式 |
| 打包 | Tauri bundler（`.app`、`.dmg`、`.msi`） |

## 数据存储

数据库文件位置：
- **macOS**: `~/Library/Application Support/雪球备份/xueqiu_viewer.db`
- **Windows**: `%APPDATA%/雪球备份/xueqiu_viewer.db`

Cookie 和用户 ID 存储在数据库的 `settings` 表中。

## 许可证

MIT
