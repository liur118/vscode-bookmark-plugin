// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { BookmarkManager } from './bookmarkManager';
import { BookmarkTreeProvider } from './bookmarkTreeProvider';
import { VisualizationManager } from './visualizationManager';
import { StorageFactory, StorageConfig, StorageType } from './storage';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate (context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "vscode-bookmark-plugin" is now active!'
  );

  // 默认存储配置
//   const defaultConfig: StorageConfig = {
//     type: 'file',
//     location: undefined // 默认路径会自动设置为 ~/.vs_bookmark/${projectName}/storage.json
//   }

  // 从配置中加载存储类型
  const config = vscode.workspace.getConfiguration('bookmarkPlugin');
  const storageType = config.get<string>('storageType', 'file') as StorageType;
  const storageLocation = config.get<string | undefined>('storageLocation',undefined);

  const storageConfig: StorageConfig = {
    type: storageType,
    location: storageLocation
  };

  // 创建存储实例
  const bookmarkStorage = StorageFactory.create<any[]>(storageConfig, context);

  // 创建书签管理器，传入统一的 storage 实例
  const bookmarkManager = new BookmarkManager(
    context,
    bookmarkStorage,
    bookmarkStorage as any
  );

  // 创建树形视图提供者
  const bookmarkTreeProvider = new BookmarkTreeProvider(bookmarkManager);

  // 创建可视化管理器
  const visualizationManager = new VisualizationManager(context);

  // 注册树形视图
  const treeView = vscode.window.createTreeView('bookmarkExplorer', {
    treeDataProvider: bookmarkTreeProvider,
    showCollapseAll: true,
    canSelectMany: true,
    dragAndDropController: bookmarkTreeProvider
  });

  // 维护一个 context key，当且仅当 tree view 中选中了单个条目时设置为 true
  function updateSingleSelectionContext() {
    try {
      const selection = treeView.selection || [];
      const isSingle = selection.length === 1;
      vscode.commands.executeCommand('setContext', 'bookmarkExplorerSingleSelection', isSingle);
    } catch (e) {
      // ignore
    }
  }

  // 初始设置
  updateSingleSelectionContext();

  // 监听 selection 变化
  treeView.onDidChangeSelection(() => {
    updateSingleSelectionContext();
  }, null, context.subscriptions);

  // 编辑器装饰：在行号左侧显示书签图标
  const bookmarkGutterDecoration = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath('media/mark.svg'),
    gutterIconSize: 'contain'
  });

  // 更新某个编辑器的装饰
  function updateEditorDecorations (editor?: vscode.TextEditor) {
    const activeEditor = editor ?? vscode.window.activeTextEditor;
    if (!activeEditor) { return; }

    const filePath = activeEditor.document.fileName;
    const bookmarksForFile = bookmarkManager.getBookmarksForFile(filePath);

    const ranges: vscode.DecorationOptions[] = bookmarksForFile.map(b => {
      const pos = new vscode.Position(b.line, b.column);
      const range = new vscode.Range(pos, pos);
      const groupName = b.groupId ? bookmarkManager.getGroupNameById(b.groupId) : '未分组';
      return {
        range,
        hoverMessage: `${b.label} — ${groupName}`
      } as vscode.DecorationOptions;
    });

    activeEditor.setDecorations(bookmarkGutterDecoration, ranges);
  }

  // 初次激活时更新当前编辑器
  updateEditorDecorations();

  // 监听活动编辑器切换
  vscode.window.onDidChangeActiveTextEditor(editor => {
    updateEditorDecorations(editor ?? undefined);
  }, null, context.subscriptions);

  // 监听文档改变（例如行号变化或文件保存）以更新装饰
  vscode.workspace.onDidChangeTextDocument(e => {
    if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
      updateEditorDecorations(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);

  // 监听书签树数据变化，刷新编辑器装饰
  bookmarkManager.getOnDidChangeTreeData()(() => {
    updateEditorDecorations(vscode.window.activeTextEditor ?? undefined);
  });


  // 注册命令
  const commands = [
    // 添加书签
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.addBookmark',
      () => {
        bookmarkManager.addBookmark();
      }
    ),

    // 删除书签
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.removeBookmark',
      async (item: any) => {
        // 支持直接传入 bookmarkId 或传入 TreeItem (BookmarkItem)
        let bookmarkId: string | undefined;
        if (!item) {
          // 如果没有传入，则从所有书签中选择
          const all = bookmarkManager.getAllBookmarks();
          if (all.length === 0) {
            vscode.window.showInformationMessage('没有可删除的书签');
            return;
          }
          const pick = await vscode.window.showQuickPick(
            all.map(b => ({ label: b.label, description: `${b.file}:${b.line + 1}`, id: b.id })),
            { placeHolder: '选择要删除的书签' }
          );
          if (!pick) { return; }
          bookmarkId = (pick as any).id;
        } else if (typeof item === 'string') {
          bookmarkId = item;
        } else if (item.bookmark && item.bookmark.id) {
          bookmarkId = item.bookmark.id;
        } else if (item.id) {
          bookmarkId = item.id;
        }

        if (!bookmarkId) { return; }

        await bookmarkManager.removeBookmark(bookmarkId);
      }
    ),

    // 跳转到书签
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.jumpToBookmark',
      (bookmarkId: string) => {
        bookmarkManager.jumpToBookmark(bookmarkId);
      }
    ),

    // 刷新书签列表
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.refreshBookmarks',
      () => {
        bookmarkTreeProvider.refresh();
      }
    ),

    // 添加分组/子分组
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.addGroup',
      async () => {
        // 第一步：输入分组名称（初始名），使用轻量的 showInputBox
        const groupName = await vscode.window.showInputBox({
          prompt: '请输入新分组名称',
          placeHolder: '新分组名称',
          value: '默认分组'
        });

        if (!groupName) {
          return;
        }
        const trimmedName = groupName.trim();
        // 创建分组并获取返回的分组对象
        const created = await bookmarkManager.createGroup(trimmedName, true, undefined); 
        if (!created) {
          return;
        }
        // 刷新并 reveal 新创建的分组
        bookmarkTreeProvider.refresh();
      }
    ),

    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.addSubGroup',
      async (item: any) => {
        const parentGroupId = item && item.group ? item.group.id : undefined;

        // 第一步：输入分组名称（初始名），使用轻量的 showInputBox
        const groupName = await vscode.window.showInputBox({
          prompt: '请输入子分组名称',
          placeHolder: '子分组名称'
        });

        if (!groupName) {
          return;
        }

        const trimmedName = groupName.trim();

        // 创建分组并获取返回的分组对象
        const created = await bookmarkManager.createGroup(trimmedName, false, parentGroupId);
        if (!created) {
          return;
        }

        // 刷新并 reveal 新创建的分组
        bookmarkTreeProvider.refresh();
      }
    ),

    // 重命名分组
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.renameGroup',
      async (item: any) => {
        if (!item || !item.group) {
          return;
        }
        const groupId = item.group.id;
        const oldName = item.group.name;

        // 使用 showInputBox 进行重命名
        const newName = await vscode.window.showInputBox({
          prompt: '请输入新的分组名称',
          placeHolder: '新的分组名称',
          value: oldName
        });

        if (!newName) {
          return;
        }
        const trimmedName = newName.trim();
        if (trimmedName === oldName) {
          return;
        }

        // 执行重命名
        bookmarkManager.renameGroup(groupId, trimmedName);
      }
    ),

    // 删除分组（直接删除，无需二次确认）
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.removeGroup',
      async (item: any) => {
        let groupId: string | undefined;
        if (item && item.group) {
          groupId = item.group.id;
        } else {
          const groups = bookmarkManager.getAllGroups();
          if (groups.length === 0) {
            vscode.window.showInformationMessage('没有可删除的分组');
            return;
          }
          const pick = await vscode.window.showQuickPick(
            groups.map(g => ({ label: g.name, description: g.isDefault ? '默认分组' : '', id: g.id })),
            { placeHolder: '选择要删除的分组' }
          );
          if (!pick) { return; }
          groupId = (pick as any).id;
        }

        if (!groupId) { return; }
        // 直接删除，不再弹出二次确认
        await bookmarkManager.removeGroup(groupId);
      }
    ),

    // 移动书签到分组
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.moveBookmarkToGroup',
      (item: any) => {
        let bookmarkId: string;
        if (item && item.bookmark) {
          bookmarkId = item.bookmark.id;
        } else {
          vscode.window.showErrorMessage('请在书签上右键使用此功能');
          return;
        }

        const groups = bookmarkManager.getAllGroups();
        const groupItems = groups.map(group => ({
          label: group.name,
          description: group.isDefault ? '默认分组' : '',
          groupId: group.id
        }));

        // 添加"移出分组"选项
        groupItems.unshift({
          label: '$(home) 移到根级别',
          description: '不属于任何分组',
          groupId: ''
        });

        vscode.window
          .showQuickPick(groupItems, {
            placeHolder: '选择目标分组'
          })
          .then(selectedGroup => {
            if (selectedGroup) {
              const targetGroupId = selectedGroup.groupId || undefined;
              bookmarkManager.moveBookmarkToGroupWithMessage(
                bookmarkId,
                targetGroupId
              );
            }
          });
      }
    ),

    // 设置分组为默认
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.setGroupAsDefault',
      (item: any) => {
        let groupId: string;
        if (item && item.group) {
          groupId = item.group.id;
          bookmarkManager.setGroupAsDefault(groupId);
        }
      }
    ),

    // 设置书签优先级
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.setBookmarkPriority',
      (bookmarkId: string) => {
        const priorityItems = [
          {
            label: '⭐ 高优先级',
            description: '重要书签，显示为红色星标',
            priority: -1
          },
          {
            label: '📌 普通优先级',
            description: '普通书签，默认显示',
            priority: 0
          },
          {
            label: '📝 低优先级',
            description: '参考书签，显示为蓝色',
            priority: 1
          }
        ];

        vscode.window
          .showQuickPick(priorityItems, {
            placeHolder: '选择书签优先级'
          })
          .then(selectedPriority => {
            if (selectedPriority) {
              bookmarkManager.setBookmarkPriority(
                bookmarkId,
                selectedPriority.priority
              );
            }
          });
      }
    ),

    // 重命名书签
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.renameBookmark',
      async (item: any) => {
        if (!item || !item.bookmark) {
          return;
        }
        const bookmarkId = item.bookmark.id;
        const oldLabel = item.bookmark.label;

        const newLabel = await vscode.window.showInputBox({
          prompt: '输入新的书签名称',
          value: oldLabel
        });

        if (!newLabel) {
          return;
        }

        const trimmed = newLabel.trim();
        if (trimmed === oldLabel) {
          return;
        }

        await bookmarkManager.renameBookmark(bookmarkId, trimmed);
        bookmarkTreeProvider.refresh();
      }
    ),

    // 上移激活项（组或书签）
    vscode.commands.registerCommand('vscode-bookmark-plugin.moveItemUp', async (item: any) => {
      // 如果没有传入 item，则尝试使用 treeView.selection
      const target = item ?? (treeView.selection && treeView.selection[0]);
      if (!target) { return; }

      if (target.bookmark && target.bookmark.id) {
        await bookmarkManager.moveBookmarkRelative(target.bookmark.id, 1);
      } else if (target.group && target.group.id) {
        await bookmarkManager.moveGroupRelative(target.group.id, 1);
      }

      bookmarkTreeProvider.refresh();
      updateEditorDecorations(vscode.window.activeTextEditor ?? undefined);
    }),

    // 下移激活项（组或书签）
    vscode.commands.registerCommand('vscode-bookmark-plugin.moveItemDown', async (item: any) => {
      const target = item ?? (treeView.selection && treeView.selection[0]);
      if (!target) { return; }

      if (target.bookmark && target.bookmark.id) {
        await bookmarkManager.moveBookmarkRelative(target.bookmark.id, -1);
      } else if (target.group && target.group.id) {
        await bookmarkManager.moveGroupRelative(target.group.id, -1);
      }

      bookmarkTreeProvider.refresh();
      updateEditorDecorations(vscode.window.activeTextEditor ?? undefined);
    }),

    // 打开可视化视图
    vscode.commands.registerCommand(
      'vscode-bookmark-plugin.openVisualization',
      () => {
        const bookmarks = bookmarkManager.getAllBookmarks();
        visualizationManager.openVisualization(bookmarks);
      }
    ),

    // Hello World 命令（保留）
    vscode.commands.registerCommand('vscode-bookmark-plugin.helloWorld', () => {
      vscode.window.showInformationMessage(
        'Hello World from vscode-bookmark-plugin!'
      );
    })
  ];

  // 将所有命令添加到订阅列表
  commands.forEach(command => context.subscriptions.push(command));

  // 添加树形视图到订阅列表
  context.subscriptions.push(treeView);
}

// This method is called when your extension is deactivated
export function deactivate () {}
