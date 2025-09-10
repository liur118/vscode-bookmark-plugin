简洁说明：`package.json` 中 `contributes` 字段与本扩展对外能力映射

目的：列出本扩展在 `contributes` 下声明的主要字段，和它们如何与代码中的实现（`src/extension.ts`、TreeDataProvider 等）对应，帮助维护和二次开发。

支持的字段（简要）

- commands
  - 描述：声明插件向 VS Code 暴露的命令 id、显示标题和可选图标。
  - 本扩展示例：
    - `vscode-bookmark-plugin.addBookmark`：添加书签（在 `extension.ts` 中通过 `registerCommand` 实现）
    - `vscode-bookmark-plugin.openVisualization`：打开可视化（在 `extension.ts` 中注册，调用 `visualizationManager.openVisualization`）
  - 对应代码位置：`src/extension.ts`（命令注册）

- viewsContainers.activitybar
  - 描述：在活动栏（activity bar）上新增一个顶层容器（带 icon 和 title）。
  - 本扩展示例：`bookmarkPlugin`（title: "书签", icon: `media/icon.svg`）。
  - 注意：icon 路径应在扩展包中被包含（建议放在 `media/`），发布时检查 `.vscodeignore`。

- views
  - 描述：在某个容器下定义视图（TreeView、WebviewView 等）的 id 和名称，以及可选的显示条件 `when`。
  - 本扩展示例：在 `views.bookmarkPlugin` 下定义 `bookmarkExplorer`，对应 `TreeView`。
  - 对应代码位置：`src/extension.ts` 使用 `vscode.window.createTreeView('bookmarkExplorer', ...)` 注册视图提供者。

- menus
- 描述：声明将命令放置在 VS Code 不同菜单或上下文的位置。常见菜单位置包括：
    - `view/title`：视图标题栏右侧的按钮组
    - `view/item/context`：树视图项的右键菜单
    - `editor/context`：编辑器右键菜单
    - `editor/title`：编辑器标题栏按钮
    - `editor/title/context`：编辑器标题栏右键菜单
    - `explorer/context`：资源管理器右键菜单
    - `commandPalette`：命令面板（默认所有命令都会出现，可用 `when: false` 隐藏）
    - `scm/title`：源代码管理视图标题栏
    - `terminal/context`：终端右键菜单
  - 本扩展示例：在 `view/title` 与 `view/item/context` 为 `bookmarkExplorer` 视图添加增删改等命令入口。
  - 注意：菜单项中的 `when` 表达式常依赖 `view` / `viewItem` 等上下文变量来控制显示。

- keybindings
  - 描述：为命令声明默认快捷键（可区分平台）。
  - 本扩展示例：`vscode-bookmark-plugin.addBookmark` 绑定 `ctrl+shift+b`（Windows/Linux）和 `cmd+shift+b`（mac）。

- configuration
  - 描述：声明用户或工作区配置项和 schema（title、properties、默认值、描述）。
  - 本扩展示例：`bookmarkPlugin.storageType`、`bookmarkPlugin.storageLocation`，用于选择存储后端和存储路径。
  - 对应代码位置：`src/extension.ts` 通过 `vscode.workspace.getConfiguration('bookmarkPlugin')` 读取配置。

激活事件（activationEvents）

- 描述：定义何时激活扩展（注意：`onView:<viewId>` 对于在 `contributes.views` 中声明的视图通常由 VS Code 自动生成，无需手动重复）。
- 本扩展当前策略：保留 `onStartupFinished`，视图打开时 VS Code 会自动触发 `onView:bookmarkExplorer` 激活。

如何快速定位实现

- 命令实现：`src/extension.ts` 中查找 `registerCommand('vscode-bookmark-plugin.<...>')`。
- 树视图：`src/bookmarkTreeProvider.ts` 是 `TreeDataProvider`，`src/extension.ts` 中通过 `createTreeView('bookmarkExplorer', ...)` 注册。
- 数据管理：`src/bookmarkManager.ts` 管理分组与书签的增删改查与持久化（使用 `src/storage.ts` 的实现）。
- 可视化：`src/visualizationManager.ts` 负责打开/渲染可视化面板（命令 `openVisualization` 调用点）。

发布注意事项

- 确保 `media/`（或放置图标的目录）包含在发布包中；如果使用 webpack 打包并把代码输出到 `dist/`，需要在打包/打包配置或 `vsce` 打包中包括 `media/`。
- 避免在 `activationEvents` 中重复列出由 `contributes.views` 自动生成的 `onView:` 事件，以免 linter 或验证提示。

简短示例（摘录）

- 在 `package.json` 中声明视图容器和视图：

  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "bookmarkPlugin", "title": "书签", "icon": "media/icon.svg" }]
    },
    "views": {
      "bookmarkPlugin": [{ "id": "bookmarkExplorer", "name": "书签", "when": "workspaceFolderCount != 0" }]
    }
  }
