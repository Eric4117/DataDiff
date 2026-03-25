# DataDiff

跨平台桌面应用，用于在 **MySQL、PostgreSQL、SQLite** 等数据源之间做**库表结构对比**（字段、索引、字符集等差异），适合联调多环境、迁移前核对结构。

> Desktop app for comparing database **schema** across connections (MySQL / PostgreSQL / SQLite).

## 功能概览

- 配置并保存多个数据源连接
- 选择两侧数据库执行结构对比，按状态与差异类型筛选表
- 查看表级/字段级/索引级差异，并支持相关辅助能力（依当前版本为准）
- 数据与快捷方式本地存储（Electron 主进程）

## 技术栈

- [Electron](https://www.electronjs.org/) 31 + [electron-vite](https://electron-vite.org/)
- [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) 5
- [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)

## 环境要求

- **Node.js** 建议 **20.x** 及以上（与仓库 `devDependencies` 中 `@types/node` 一致）
- **npm** 或兼容的包管理器（pnpm / yarn 需自行对照锁文件）
- 打包 **macOS** 应用：需在 macOS 上执行，并建议安装 **Xcode Command Line Tools**
- 打包 **Windows** 安装包：需在 **Windows** 上执行（生成 NSIS）；在 macOS 上交叉编译 Windows 需额外配置，此处不展开
- 依赖中含 **`better-sqlite3` 等原生模块**：若 `npm install` 报错，请确保本机已安装对应平台的 C++ 构建环境（Windows: Visual Studio Build Tools；Linux: `build-essential` 等）

## 快速开始（开发）

```bash
git clone https://github.com/<你的用户名>/DataDiff.git
cd DataDiff
npm install
npm run dev
```

开发模式下会启动 Electron 并加载 Vite 开发服务，支持热更新（以 electron-vite 行为为准）。

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发调试 |
| `npm run build` | 仅构建产物（输出到 `out/`，供预览或配合 `electron-builder`） |
| `npm run preview` | 构建后在本地预览（electron-vite） |
| `npm run package` | 先执行 `electron-vite build`，再调用 **electron-builder** 打安装包 |

## 打包发布

```bash
npm install
npm run package
```

- 安装包输出目录：**`dist/`**（由 `package.json` 中 `build.directories.output` 指定）
- **macOS**：默认生成 **DMG**（`build.mac.target`）
- **Windows**：默认生成 **NSIS 安装程序**（`build.win.target`）

在发布到 GitHub Releases 时，可将 `dist/` 内对应平台的产物作为附件上传。

## 项目结构（简要）

```
├── electron/          # 主进程、preload、IPC 与数据库适配
├── src/               # 渲染进程（React 界面）
├── landing/           # 独立落地页资源（若使用）
├── index.html         # 渲染入口 HTML
├── electron.vite.config.ts
└── package.json
```

## 协议（License）

本项目以 **[MIT License](./LICENSE)** 开源。使用、复制、修改与分发请遵守该协议全文（见仓库根目录 `LICENSE` 文件）。



## 贡献与问题

欢迎 Issue / PR。提交代码前可在本地执行 `npm run build` 确认主进程与渲染进程均能成功构建。

---

**免责声明**：本工具会连接你配置的数据库并读取元数据，请在可信环境中使用，勿将生产凭据提交到公开仓库。
