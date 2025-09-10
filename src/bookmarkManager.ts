import * as vscode from 'vscode';
import * as path from 'path';
import { StorageFactory, IStorage } from './storage';


export interface BookmarkGroup {
  id: string
  name: string
  isDefault: boolean
  created: Date
  parentId?: string // 添加父分组ID，支持嵌套
  priority?: number // 用于排序，数字越大，优先级越高
}

export interface Bookmark {
  id: string
  label: string
  file: string
  line: number
  column: number
  description?: string
  created: Date
  groupId?: string // 可选，不属于任何组时为undefined
  priority?: number // 用于排序，数字越大优先级越高
}

export class BookmarkManager {
  private bookmarks: Bookmark[] = [];
  private groups: BookmarkGroup[] = [];
  private context: vscode.ExtensionContext;
  private onDidChangeTreeData: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  private bookmarkStorage: IStorage<Bookmark[]>;
  private groupStorage: IStorage<BookmarkGroup[]>;
  private ready: Promise<void> = Promise.resolve();

  constructor (
    context: vscode.ExtensionContext,
    bookmarkStorage?: IStorage<Bookmark[]>,
    groupStorage?: IStorage<BookmarkGroup[]>
  ) {
    this.context = context;
    // use provided storages or fall back to default file storage
    this.bookmarkStorage =
      bookmarkStorage ??
      StorageFactory.create<Bookmark[]>({ type: 'file' }, context);
    this.groupStorage =
      groupStorage ??
      StorageFactory.create<BookmarkGroup[]>({ type: 'file' }, context);
    // kick off initial load and keep the promise so other ops can await it
    this.ready = this.loadData();
  }

  public getOnDidChangeTreeData (): vscode.Event<void> {
    return this.onDidChangeTreeData.event;
  }

  private async loadData (): Promise<void> {
    // 加载书签
    const storedBookmarks = await this.bookmarkStorage.load('bookmarks');
    this.bookmarks = storedBookmarks
      ? storedBookmarks.map(bookmark => ({
          ...bookmark,
          created: new Date(bookmark.created)
        }))
      : [];

    // 加载分组
    const storedGroups = await this.groupStorage.load('bookmarkGroups');
    this.groups = storedGroups
      ? storedGroups.map(group => ({
          ...group,
          created: new Date(group.created),
          priority: (group.priority ?? 0)
        }))
      : [];
    // notify any listeners that initial data is ready
    this.onDidChangeTreeData.fire();
  }

  private async saveData (): Promise<void> {
    try {
      await this.bookmarkStorage.save('bookmarks', this.bookmarks);
      await this.groupStorage.save('bookmarkGroups', this.groups);
      this.onDidChangeTreeData.fire();
    } catch (error) {
      console.error('Failed to save data:', error);
      vscode.window.showErrorMessage('保存书签数据时出错，请检查存储配置。');
    }
  }

  public async addBookmark (label?: string): Promise<void> {
    await this.ready;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('没有活动的编辑器');
      return;
    }

    const position = editor.selection.active;
    const document = editor.document;

    // 生成默认标签
    const defaultLabel =
      label || `${path.basename(document.fileName)}:${position.line + 1}`;

    const inputLabel = await vscode.window.showInputBox({
      prompt: '输入书签标签',
      value: defaultLabel
    });

    if (inputLabel) {
      // 查找默认分组
      const defaultGroup = this.groups.find(g => g.isDefault);

      const bookmark: Bookmark = {
        id: this.generateId(),
        label: inputLabel,
        file: document.fileName,
        line: position.line,
        column: position.character,
        created: new Date(),
        groupId: defaultGroup?.id, // 如果有默认分组，自动加入
        priority: 0
      };

      this.bookmarks.push(bookmark);
      await this.saveData(); // 保存到文件存储

      const groupInfo = defaultGroup ? ` 到分组 "${defaultGroup.name}"` : '';
      vscode.window.showInformationMessage(
        `书签 "${inputLabel}" 已添加${groupInfo}`
      );
    }
  }

  public async removeBookmark (bookmarkId: string): Promise<void> {
    await this.ready;
    const index = this.bookmarks.findIndex(b => b.id === bookmarkId);
    if (index !== -1) {
      const removedBookmark = this.bookmarks.splice(index, 1)[0];
      await this.saveData();
      vscode.window.showInformationMessage(
        `书签 "${removedBookmark.label}" 已删除`
      );
    }
  }

  public jumpToBookmark (bookmarkId: string): void {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
      vscode.window.showErrorMessage('书签不存在');
      return;
    }

    vscode.workspace
      .openTextDocument(bookmark.file)
      .then(document => {
        return vscode.window.showTextDocument(document);
      })
      .then(
        editor => {
          const position = new vscode.Position(bookmark.line, bookmark.column);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        },
        (error: any) => {
          vscode.window.showErrorMessage(`无法打开文件: ${error.message}`);
        }
      );
  }

  public getAllBookmarks (): Bookmark[] {
    return [...this.bookmarks];
  }

  public getBookmarksGrouped (): {
    ungrouped: Bookmark[]
    rootGroups: BookmarkGroup[]
    groupedBookmarks: Map<string, Bookmark[]>
    groupedSubGroups: Map<string, BookmarkGroup[]>
  } {
    const ungrouped: Bookmark[] = [];
    const groupedBookmarks = new Map<string, Bookmark[]>();
    const groupedSubGroups = new Map<string, BookmarkGroup[]>();

    // 初始化所有分组的书签数组
    this.groups.forEach(group => {
      groupedBookmarks.set(group.id, []);
    });

    // 分类书签
    this.bookmarks.forEach(bookmark => {
      if (!bookmark.groupId) {
        ungrouped.push(bookmark);
      } else {
        const bookmarks = groupedBookmarks.get(bookmark.groupId);
        if (bookmarks) {
          bookmarks.push(bookmark);
        } else {
          // 如果分组不存在，放入未分组
          ungrouped.push(bookmark);
        }
      }
    });

    // 分类分组（根据是否有父分组）
    const rootGroups: BookmarkGroup[] = [];
    this.groups.forEach(group => {
      if (!group.parentId) {
        rootGroups.push(group);
      } else {
        if (!groupedSubGroups.has(group.parentId)) {
          groupedSubGroups.set(group.parentId, []);
        }
        groupedSubGroups.get(group.parentId)!.push(group);
      }
    });

    // 对书签进行排序（按 priority 降序，然后按创建时间）
    ungrouped.sort(this.sortBookmarks);
    groupedBookmarks.forEach(bookmarks => {
      bookmarks.sort(this.sortBookmarks);
    });

    // 对分组进行排序
    // 按 priority 降序排列分组，priority 相同时按创建时间升序
    rootGroups.sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) { return pb - pa; }
      return a.created.getTime() - b.created.getTime();
    });
    groupedSubGroups.forEach(subGroups => {
      subGroups.sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pa !== pb) { return pb - pa; }
        return a.created.getTime() - b.created.getTime();
      });
    });

    return { ungrouped, rootGroups, groupedBookmarks, groupedSubGroups };
  }

  private sortBookmarks = (a: Bookmark, b: Bookmark): number => {
  // 先按优先级降序排序（数字越大优先级越高），再按创建时间升序
  const pa = a.priority ?? 0;
  const pb = b.priority ?? 0;
  if (pa !== pb) { return pb - pa; }
  return a.created.getTime() - b.created.getTime();
  };

  public getAllGroups (): BookmarkGroup[] {
    return [...this.groups];
  }

  // 示例：创建分组时调用
  public async createGroup (groupName: string, isDefault: boolean = false, parentId?: string): Promise<BookmarkGroup | undefined> {
    if (!groupName) {
      vscode.window.showWarningMessage('用户取消输入');
      return undefined;
    }

    // 检查同级是否存在同名分组
    const siblings = this.groups.filter(g => g.parentId === parentId);
    if (siblings.some(g => g.name === groupName)) {
      vscode.window.showWarningMessage(`创建分组失败：同级已存在名为 "${groupName}" 的分组`);
      return undefined;
    }

    // 如果要创建为默认分组，先取消其他分组的默认状态，确保只有一个默认分组
    if (isDefault) {
      this.groups.forEach(g => {
        g.isDefault = false;
      });
    }

    // 计算当前最大 priority，并为新分组分配更高的优先级
    const maxPriority = this.groups.reduce((max, g) => Math.max(max, g.priority ?? 0), 0);
    const newGroup: BookmarkGroup = {
      id: this.generateId(),
      name: groupName,
      isDefault: isDefault,
      created: new Date(),
      parentId: parentId,
      priority: maxPriority + 1
    };

    this.groups.push(newGroup);
    await this.saveData(); // 保存到文件存储

    const defaultInfo = isDefault ? ' (默认分组)' : '';
    const parentInfo = parentId
      ? ` 在分组 "${this.getGroupNameById(parentId)}" 下`
      : '';
    vscode.window.showInformationMessage(
      `分组 "${groupName}"${defaultInfo} 已创建${parentInfo}`
    );
    // 返回创建的分组，调用方可以选择进一步操作（例如 reveal & rename）
    return newGroup;
  }

  public async renameGroup (groupId: string, newName: string): Promise<boolean> {
    await this.ready;
    const group = this.groups.find(g => g.id === groupId);
    if (!group) {
      return false;
    }

    // 检查同级是否存在同名分组（排除自身）
    const siblings = this.groups.filter(g => g.parentId === group.parentId && g.id !== groupId);
    if (siblings.some(g => g.name === newName)) {
      vscode.window.showWarningMessage(`重命名失败：同级已存在名为 "${newName}" 的分组`);
      return false;
    }

    group.name = newName;
    await this.saveData();
    return true;
  }

  // public async createGroup(name: string, isDefault: boolean = false, parentId?: string): Promise<void> {
  //     await this.ready;
  //     // 如果设置为默认，先取消其他分组的默认状态
  //     if (isDefault) {
  //         this.groups.forEach(group => {
  //             group.isDefault = false;
  //         });
  //     }

  //     const newGroup: BookmarkGroup = {
  //         id: this.generateId(),
  //         name: name,
  //         isDefault: isDefault,
  //         created: new Date(),
  //         parentId: parentId
  //     };

  //     this.groups.push(newGroup);
  //     await this.saveData(); // 保存到文件存储

  //     const defaultInfo = isDefault ? ' (默认分组)' : '';
  //     const parentInfo = parentId ? ` 在分组 "${this.getGroupNameById(parentId)}" 下` : '';
  //     vscode.window.showInformationMessage(`分组 "${name}"${defaultInfo} 已创建${parentInfo}`);
  // }

  public getGroupNameById (groupId: string): string {
    const group = this.groups.find(g => g.id === groupId);
    return group ? group.name : '未知分组';
  }

  public getGroupPath (groupId: string): string {
    const path: string[] = [];
    let currentGroup = this.groups.find(g => g.id === groupId);

    while (currentGroup) {
      path.unshift(currentGroup.name);
      if (currentGroup.parentId) {
        currentGroup = this.groups.find(g => g.id === currentGroup!.parentId);
      } else {
        break;
      }
    }

    return path.join(' > ');
  }

  public async removeGroup (groupId: string): Promise<void> {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) {
      return;
    }

    // 递归删除所有子分组
    const subGroups = this.groups.filter(g => g.parentId === groupId);
    for (const subGroup of subGroups) {
      await this.removeGroup(subGroup.id);
    }

    // 将该分组下的书签移出分组
    this.bookmarks.forEach(bookmark => {
      if (bookmark.groupId === groupId) {
        bookmark.groupId = group.parentId; // 移到父分组，如果没有父分组则为undefined
      }
    });

    // 删除分组
    this.groups = this.groups.filter(g => g.id !== groupId);
    await this.saveData();

    const moveInfo = group.parentId ? `移至父分组` : `移至根级别`;
    vscode.window.showInformationMessage(
      `分组 "${group.name}" 已删除，其下内容已${moveInfo}`
    );
  }

  public async moveBookmarkToGroup (
    bookmarkId: string,
    groupId?: string
  ): Promise<void> {
    await this.ready;
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (bookmark) {
      bookmark.groupId = groupId;
      await this.saveData();
    }
  }

  public async moveBookmarkToGroupWithMessage (
    bookmarkId: string,
    groupId?: string
  ): Promise<void> {
    await this.ready;
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (bookmark) {
      bookmark.groupId = groupId;
      await this.saveData();

      if (groupId) {
        const group = this.groups.find(g => g.id === groupId);
        vscode.window.showInformationMessage(
          `书签已移动到分组 "${group?.name}"`
        );
      } else {
        vscode.window.showInformationMessage('书签已移动到根级别');
      }
    }
  }

  public async setGroupAsDefault (groupId: string): Promise<void> {
    await this.ready;
    // 先取消所有分组的默认状态
    this.groups.forEach(group => {
      group.isDefault = false;
    });

    // 设置指定分组为默认
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.isDefault = true;
      // 将默认分组置顶：分配更高的 priority
      const maxPriority = this.groups.reduce((max, g) => Math.max(max, g.priority ?? 0), 0);
      group.priority = maxPriority + 1;
      await this.saveData();
      vscode.window.showInformationMessage(
        `分组 "${group.name}" 已设置为默认分组`
      );
    }
  }

  /**
   * 将书签在其所在同级中相对移动（delta: 1 = 向上/优先级增大, -1 = 向下/优先级减小）
   */
  public async moveBookmarkRelative (bookmarkId: string, delta: 1 | -1): Promise<boolean> {
    await this.ready;
    const bm = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bm) { return false; }

    // 把未分组视为同一组，使用空串作为键
    const key = bm.groupId ?? '__root__';
    const siblings = this.bookmarks.filter(b => (b.groupId ?? '__root__') === key);
    siblings.sort(this.sortBookmarks);

    const idx = siblings.findIndex(b => b.id === bookmarkId);
    if (idx === -1) { return false; }

    const target = delta === 1 ? idx - 1 : idx + 1;
    if (target < 0 || target >= siblings.length) { return false; }

    const a = siblings[idx];
    const b = siblings[target];
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    // 交换优先级
    a.priority = pb;
    b.priority = pa;

    await this.saveData();
    return true;
  }

  /**
   * 将分组在其父级下相对移动（delta: 1 = 向上/优先级增大, -1 = 向下/优先级减小）
   */
  public async moveGroupRelative (groupId: string, delta: 1 | -1): Promise<boolean> {
    await this.ready;
    const group = this.groups.find(g => g.id === groupId);
    if (!group) { return false; }

    const siblings = this.groups.filter(g => g.parentId === group.parentId);
    siblings.sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) { return pb - pa; }
      return a.created.getTime() - b.created.getTime();
    });

    const idx = siblings.findIndex(g => g.id === groupId);
    if (idx === -1) { return false; }

    const target = delta === 1 ? idx - 1 : idx + 1;
    if (target < 0 || target >= siblings.length) { return false; }

    const a = siblings[idx];
    const b = siblings[target];
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    a.priority = pb;
    b.priority = pa;

    await this.saveData();
    return true;
  }

  /**
   * 将分组移动到新的父分组（或根级）并在目标兄弟分组中插入到指定位置前面
   * - groupId: 要移动的分组
   * - newParentId: 目标父分组 id，未指定则为根级
   * - insertBeforeGroupId: 在目标父分组下，将移动的分组插入到此分组之前（可选）
   *
   * 该方法会重新为目标父分组下的所有兄弟分配 priority，数值越大优先级越高，越靠前
   */
  public async moveGroupToParent (
    groupId: string,
    newParentId?: string,
    insertBeforeGroupId?: string
  ): Promise<void> {
    await this.ready;

    const movingGroup = this.groups.find(g => g.id === groupId);
    if (!movingGroup) { return; }

    // 从当前列表移除正在移动的分组（临时），以便计算新的兄弟列表
    this.groups = this.groups.filter(g => g.id !== groupId);

    // 将分组设为新的父分组
    // 在实际改变 parentId 之前，检查目标父级同级是否存在同名分组
    const targetSiblings = this.groups.filter(g => g.parentId === newParentId && g.id !== groupId);
    if (targetSiblings.some(g => g.name === movingGroup.name)) {
      vscode.window.showWarningMessage(`移动失败：目标位置已存在同名分组 "${movingGroup.name}"`);
      return;
    }

    movingGroup.parentId = newParentId;

    // 收集目标父分组下的兄弟（不包含正在移动的分组）
    const siblings = this.groups.filter(g => g.parentId === newParentId);

    // 计算插入位置（默认为顶部）
    let insertIndex = 0;
    if (insertBeforeGroupId) {
      const idx = siblings.findIndex(g => g.id === insertBeforeGroupId);
      insertIndex = idx === -1 ? 0 : idx;
    }

    // 在兄弟列表中插入正在移动的分组
    siblings.splice(insertIndex, 0, movingGroup);

    // 重新分配 priority：兄弟越靠前 priority 越大（从 siblings.length 到 1）
    const total = siblings.length;
    for (let i = 0; i < siblings.length; i++) {
      siblings[i].priority = total - i;
    }

    // 将之前属于该父分组的项从主组数组中移除，然后把重新排序后的 siblings 放回去
    this.groups = this.groups.filter(g => g.parentId !== newParentId);
    this.groups.push(...siblings);

    await this.saveData();
  }

  public async setBookmarkPriority (
    bookmarkId: string,
    priority: number
  ): Promise<void> {
    await this.ready;
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (bookmark) {
      bookmark.priority = priority;
      await this.saveData();
    }
  }

  public async renameBookmark (bookmarkId: string, newLabel: string): Promise<boolean> {
    await this.ready;
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) {
      return false;
    }
    const old = bookmark.label;
    bookmark.label = newLabel;
    await this.saveData();
    vscode.window.showInformationMessage(`书签 "${old}" 已重命名为 "${newLabel}"`);
    return true;
  }

  /**
   * 返回指定文件路径下的所有书签（内存中的快照）
   */
  public getBookmarksForFile (filePath: string): Bookmark[] {
    return this.bookmarks.filter(b => b.file === filePath);
  }

  private generateId (): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
