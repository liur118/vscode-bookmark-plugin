# VS Code 书签插件

VS Code 书签管理扩展，支持分组、排序和可视化管理功能。

## 功能特性

### 📌 书签管理
- **快速添加书签**：在当前光标位置添加带自定义名称的书签
- **一键跳转**：点击书签直接跳转到对应文件位置
- **重命名书签**：右键菜单支持重命名书签标签
- **删除书签**：支持单个或批量删除书签

### 📁 分组管理
- **创建分组**：支持创建根级分组和子分组
- **默认分组**：设置默认分组，新书签自动归类
- **分组重命名**：右键菜单重命名分组
- **分组删除**：删除分组时自动将子项移至父级

### 🔄 拖拽与排序
- **拖拽移动**：支持书签和分组的拖拽重排序
- **上下移动**：视图标题栏提供上移/下移按钮
- **优先级管理**：基于优先级的智能排序系统
- **默认分组置顶**：默认分组自动显示在顶部

### 👁️ 可视化显示
- **侧边栏视图**：专用的书签管理侧边栏
- **编辑器装饰**：在编辑器行号旁显示书签图标
- **悬浮提示**：鼠标悬停显示书签名称和所属分组
- **图标区分**：不同优先级书签使用不同颜色图标

## 安装方式

1. 在 VS Code 中打开扩展面板（`Ctrl+Shift+X`）
2. 搜索 "vscode-bookmark-plugin"
3. 点击安装并重新加载窗口

或者从 VSIX 文件安装：
```bash
code --install-extension vscode-bookmark-plugin-0.0.1.vsix
```

## 本地开发

### 环境要求

- Node.js >= 14.x
- VS Code >= 1.60.x
- yarn 或 npm

### 开发步骤

1. **克隆项目**
```bash
git clone https://github.com/liur118/vscode-bookmark-plugin.git
cd vscode-bookmark-plugin
```

2. **安装依赖**
```bash
yarn install
# 或
npm install
```

3. **编译项目**
```bash
yarn run compile
# 或
npm run compile
```

4. **启动调试模式（推荐开发方式）**
- 在 VS Code 中打开项目文件夹
- 启动调试的三种方式：
  - 按 `F5` 快捷键
  - 或打开命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）搜索 "Debug: Start Debugging"
  - 或点击左侧调试面板的"启动调试"按钮
- 会自动打开一个新的 VS Code 窗口（Extension Development Host）
- 在新窗口中你的扩展已经加载，可以直接测试所有功能
- 修改代码后在新窗口中重新加载：
  - 按 `Ctrl+R`（Windows/Linux）或 `Cmd+R`（Mac）
  - 或命令面板搜索 "Developer: Reload Window"

### 构建与打包

#### 开发构建
```bash
# 监听模式编译（文件变化时自动重编译）
yarn run watch
# 或
npm run watch
```

#### 生产构建
```bash
# 编译 TypeScript 到 JavaScript
yarn run compile
# 或
npm run compile

# 打包成 VSIX 文件
yarn run package
# 或
npm run package
```

#### 安装本地构建的扩展（发布时使用）
```bash
# 仅在需要测试最终打包结果时使用
# 日常开发推荐使用上面的调试模式

# 安装打包后的 VSIX 文件
code --install-extension ./vscode-bookmark-plugin-0.0.1.vsix

# 卸载扩展（如需要）
code --uninstall-extension your-publisher.vscode-bookmark-plugin
```

### 调试模式详解

#### 快速开发流程（无需打包）
1. **首次启动**
   - 在 VS Code 中打开项目根目录
   - 确保已运行 `npm run compile` 或 `npm run watch`
   - 启动扩展开发主机：
     - 按 `F5` 快捷键，或
     - 命令面板（`Ctrl+Shift+P`）搜索 "Debug: Start Debugging"

2. **实时开发**
   - 在新窗口中测试扩展功能
   - 修改源码后，在 Extension Development Host 中重新加载：
     - 按 `Ctrl+R`（Windows/Linux）或 `Cmd+R`（Mac），或
     - 命令面板搜索 "Developer: Reload Window"
   - 无需重新打包或安装，立即看到更改效果

3. **断点调试**
   - 在 TypeScript 源码中设置断点
   - 触发对应功能时会自动暂停在断点处
   - 可以查看变量值、调用栈等调试信息

4. **查看日志**
   - 在 Extension Development Host 中按 `F12` 打开开发者工具
   - 在 Console 中查看 `console.log` 输出
   - 在原始开发窗口的调试控制台中查看扩展日志

#### 监听模式开发
```bash
# 推荐：启动监听模式，文件变化时自动编译
npm run watch

# 然后按 F5 启动调试，修改代码后只需在开发主机中 Ctrl+R 重载即可
```

### 测试

```bash
# 运行单元测试
yarn run test
# 或
npm run test
```

## 使用指南

### 基本操作

#### 添加书签
1. 将光标定位到要添加书签的行
2. 使用命令面板（`Ctrl+Shift+P`）搜索 "添加书签"
3. 输入书签名称并确认

#### 创建分组
1. 在书签视图中右键空白区域
2. 选择 "添加分组"
3. 输入分组名称，可选择设为默认分组

#### 移动书签到分组
1. 右键点击书签
2. 选择 "移动到分组"
3. 从列表中选择目标分组

### 高级功能

#### 分组排序
- 在书签视图中选中单个书签或分组
- 使用标题栏的 ↑ ↓ 按钮调整顺序
- 或直接拖拽到目标位置

#### 设置默认分组
1. 右键点击分组
2. 选择 "设为默认分组"
3. 新添加的书签将自动归入此分组

#### 书签优先级
- ⭐ 高优先级：显示红色星标
- 📌 普通优先级：默认显示
- 📝 低优先级：显示蓝色图标

## 命令列表

| 命令 | 功能 |
|------|------|
| `vscode-bookmark-plugin.addBookmark` | 添加书签 |
| `vscode-bookmark-plugin.removeBookmark` | 删除书签 |
| `vscode-bookmark-plugin.jumpToBookmark` | 跳转到书签 |
| `vscode-bookmark-plugin.addGroup` | 添加分组 |
| `vscode-bookmark-plugin.renameGroup` | 重命名分组 |
| `vscode-bookmark-plugin.removeGroup` | 删除分组 |
| `vscode-bookmark-plugin.moveItemUp` | 上移选中项 |
| `vscode-bookmark-plugin.moveItemDown` | 下移选中项 |
| `vscode-bookmark-plugin.refreshBookmarks` | 刷新书签列表 |

## 配置选项

```json
{
  "bookmarkPlugin.storageType": "file",
  "bookmarkPlugin.storageLocation": "~/.vs_bookmark"
}
```

- `storageType`: 存储类型，目前支持 "file"
- `storageLocation`: 自定义存储位置（可选）

## 键盘快捷键

默认快捷键可在 VS Code 设置中自定义：

- 添加书签：可绑定到 `Ctrl+Shift+B`
- 删除书签：可绑定到 `Ctrl+Shift+D`

## 数据存储

书签数据默认存储在用户主目录的 `.vs_bookmark` 文件夹中，按项目分别保存：
- 书签数据：`~/.vs_bookmark/{项目名}/bookmarks.json`
- 分组数据：`~/.vs_bookmark/{项目名}/bookmarkGroups.json`

## 故障排除

### 书签不显示
1. 检查侧边栏是否正确加载书签视图
2. 尝试刷新书签列表
3. 检查存储文件是否存在权限问题

### 拖拽功能异常
1. 确保 VS Code 版本 >= 1.60
2. 重新加载窗口尝试

### 上下移动按钮不显示
- 确保选中了单个书签或分组项
- 按钮仅在单选模式下显示

## 版本历史

### 0.0.1 (初始版本)
- 基础书签和分组管理功能
- 拖拽排序支持
- 编辑器装饰显示
- 上下移动按钮

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进这个扩展！

## 许可证

MIT License

---

**享受使用 VS Code 书签插件！** 🚀