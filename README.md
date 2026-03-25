# DataDiff

跨平台桌面应用，用于在 **MySQL、PostgreSQL、SQLite** 等数据源之间做**库表结构对比**（字段、索引、字符集等差异），适合联调多环境、迁移前核对结构。

> Desktop app for comparing database **schema** across connections (MySQL / PostgreSQL / SQLite).

## 下载与安装（普通用户）

**无需安装 Node.js、无需自己编译。** 请直接下载已打包好的安装程序使用。

1. 打开 **[GitHub Releases](https://github.com/Eric4117/DataDiff/releases)**，进入**最新版本**。
2. 在 **Assets** 中选择与你系统匹配的文件并下载：
   - **macOS（Apple 芯片或 Intel）**：下载 **`.dmg`**，打开后把 DataDiff 拖进「应用程序」文件夹。
   - **Windows**：下载 **`.exe`**（NSIS 安装包），双击按向导安装。

安装完成后启动应用即可。若系统提示「无法验证开发者」等安全提示，可在 macOS 上对应用**右键 → 打开**一次，或在系统设置中允许运行。

**还没有看到你的系统安装包？** 可在 [Issues](https://github.com/Eric4117/DataDiff/issues) 留言需求；构建与发布由维护者在 Releases 中提供附件。

## 产品落地页（Landing）
**在线访问** ： 功能介绍与说明：<https://eric4117.github.io/DataDiff/> 

## 功能概览

- 配置并保存多个数据源连接
- 选择两侧数据库执行结构对比，按状态与差异类型筛选表
- 查看表级/字段级/索引级差异，并支持相关辅助能力（依当前版本为准）
- 数据与快捷方式本地存储（Electron 主进程）

## 技术栈

- [Electron](https://www.electronjs.org/) 31 + [electron-vite](https://electron-vite.org/)
- [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) 5
- [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)

## 从源码运行与开发

以下仅适用于**克隆仓库、改代码或本地调试**；**日常使用者请用上一节「下载与安装」。**

### 环境要求

- **Node.js** 建议 **20.x** 及以上
- **npm** 或兼容的包管理器
- 依赖中含 **`better-sqlite3` 等原生模块**：若 `npm install` 失败，请安装对应平台 C++ 构建环境（Windows：[Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 并勾选「使用 C++ 的桌面开发」；macOS：Xcode Command Line Tools；Linux：`build-essential` 等）

### 快速开始

```bash
git clone https://github.com/Eric4117/DataDiff
cd DataDiff
npm install
npm run dev
```

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发调试 |
| `npm run build` | 构建到 `out/` |
| `npm run preview` | 构建后本地预览（electron-vite） |
| `npm run package` | 构建并调用 electron-builder 打安装包 |

### 维护者：如何打出安装包并上传到 Releases

在**对应操作系统**上执行（输出在 **`dist/`**）：

```bash
npm install
npm run package
```

- **macOS**：默认 **DMG**。可按需指定架构，例如：`npx electron-builder --mac --arm64`（Apple 芯片）、`--mac --x64`（Intel）、`--mac --universal`（通用包）。
- **Windows**：需在 **Windows** 上执行，生成 **NSIS `.exe`**（electron-builder 依赖本机 Windows 工具链）。步骤：安装 Node.js 20+、Visual Studio Build Tools（含「使用 C++ 的桌面开发」），再执行上面的 `npm run package`，在 `dist/` 取安装程序。

将 `dist/` 中生成的 **`.dmg` / `.exe`** 作为附件上传到 [Releases](https://github.com/Eric4117/DataDiff/releases)，用户即可在「下载与安装」一节所述页面直接下载，**无需自行编译**。

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
