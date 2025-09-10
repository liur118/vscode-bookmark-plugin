import * as vscode from 'vscode';
import * as path from 'path';
import { Bookmark, BookmarkGroup, BookmarkManager } from './bookmarkManager';

export class BookmarkItem extends vscode.TreeItem {
    constructor(
        public readonly bookmark: Bookmark,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(bookmark.label, collapsibleState);
        
        this.tooltip = `${bookmark.file}:${bookmark.line + 1}:${bookmark.column + 1}`;
        this.description = `${path.basename(bookmark.file)}:${bookmark.line + 1}`;
        this.contextValue = 'bookmark';
        
        // 设置图标，根据优先级显示不同颜色
        if (bookmark.priority && bookmark.priority < 0) {
            this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.red'));
        } else if (bookmark.priority && bookmark.priority > 0) {
            this.iconPath = new vscode.ThemeIcon('bookmark', new vscode.ThemeColor('charts.blue'));
        } else {
            this.iconPath = new vscode.ThemeIcon('bookmark');
        }
        
        // 设置点击命令
        this.command = {
            command: 'vscode-bookmark-plugin.jumpToBookmark',
            title: '跳转到书签',
            arguments: [bookmark.id]
        };
    }
}

export class GroupItem extends vscode.TreeItem {
    constructor(
        public readonly group: BookmarkGroup,
        public readonly bookmarkCount: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(group.name, collapsibleState);
        
        this.tooltip = `分组: ${group.name} (${bookmarkCount} 个书签)${group.isDefault ? ' [默认]' : ''}`;
        this.description = `${bookmarkCount} 个书签${group.isDefault ? ' ⭐' : ''}`;
        this.contextValue = 'bookmarkGroup';
        
        // 设置分组图标，默认分组显示不同颜色
        if (group.isDefault) {
            this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.orange'));
        } else {
            this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.yellow'));
        }
    }
}

export class BookmarkTreeProvider implements vscode.TreeDataProvider<BookmarkItem | GroupItem>, vscode.TreeDragAndDropController<BookmarkItem | GroupItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BookmarkItem | GroupItem | undefined | null | void> = new vscode.EventEmitter<BookmarkItem | GroupItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BookmarkItem | GroupItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // 拖拽支持：支持书签与分组两种 mime
    readonly dropMimeTypes = ['application/vnd.code.tree.bookmarkExplorer', 'application/vnd.code.tree.bookmarkExplorer.groups'];
    readonly dragMimeTypes = ['application/vnd.code.tree.bookmarkExplorer', 'application/vnd.code.tree.bookmarkExplorer.groups'];

    constructor(private bookmarkManager: BookmarkManager) {
        // 监听书签管理器的变化
        this.bookmarkManager.getOnDidChangeTreeData()(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookmarkItem | GroupItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BookmarkItem | GroupItem): Thenable<(BookmarkItem | GroupItem)[]> {
        if (!element) {
            // 返回根级别的项目：未分组的书签 + 根级别分组
            const data = this.bookmarkManager.getBookmarksGrouped();
            const result: (BookmarkItem | GroupItem)[] = [];
            
            // 先添加根级别分组（按 priority 排序），再添加未分组的书签
            data.rootGroups.forEach(group => {
                const bookmarkCount = this.getGroupTotalBookmarkCount(group.id, data);
                result.push(new GroupItem(
                    group,
                    bookmarkCount,
                    vscode.TreeItemCollapsibleState.Expanded
                ));
            });

            // 添加未分组的书签（按 priority 排序）
            data.ungrouped.forEach(bookmark => {
                result.push(new BookmarkItem(bookmark));
            });
            
            return Promise.resolve(result);
        } else if (element instanceof GroupItem) {
            // 返回分组下的书签和子分组
            const data = this.bookmarkManager.getBookmarksGrouped();
            const result: (BookmarkItem | GroupItem)[] = [];
            
            // 添加子分组
            const subGroups = data.groupedSubGroups.get(element.group.id) || [];
            subGroups.forEach(subGroup => {
                const bookmarkCount = this.getGroupTotalBookmarkCount(subGroup.id, data);
                result.push(new GroupItem(
                    subGroup,
                    bookmarkCount,
                    vscode.TreeItemCollapsibleState.Expanded
                ));
            });
            
            // 添加直接的书签
            const bookmarks = data.groupedBookmarks.get(element.group.id) || [];
            bookmarks.forEach(bookmark => {
                result.push(new BookmarkItem(bookmark));
            });
            
            return Promise.resolve(result);
        }
        
        return Promise.resolve([]);
    }

    // 计算分组的总书签数（包括子分组中的书签）
    private getGroupTotalBookmarkCount(groupId: string, data: ReturnType<typeof this.bookmarkManager.getBookmarksGrouped>): number {
        let count = 0;
        
        // 计算直接书签
        const directBookmarks = data.groupedBookmarks.get(groupId) || [];
        count += directBookmarks.length;
        
        // 递归计算子分组中的书签
        const subGroups = data.groupedSubGroups.get(groupId) || [];
        for (const subGroup of subGroups) {
            count += this.getGroupTotalBookmarkCount(subGroup.id, data);
        }
        
        return count;
    }

    getParent(element: BookmarkItem | GroupItem): vscode.ProviderResult<GroupItem> {
        if (element instanceof BookmarkItem && element.bookmark.groupId) {
            // 如果书签属于某个分组，返回该分组
            const groups = this.bookmarkManager.getAllGroups();
            const group = groups.find(g => g.id === element.bookmark.groupId);
            if (group) {
                const data = this.bookmarkManager.getBookmarksGrouped();
                const bookmarkCount = this.getGroupTotalBookmarkCount(group.id, data);
                return new GroupItem(group, bookmarkCount);
            }
        } else if (element instanceof GroupItem && element.group.parentId) {
            // 如果分组有父分组，返回父分组
            const groups = this.bookmarkManager.getAllGroups();
            const parentGroup = groups.find(g => g.id === element.group.parentId);
            if (parentGroup) {
                const data = this.bookmarkManager.getBookmarksGrouped();
                const bookmarkCount = this.getGroupTotalBookmarkCount(parentGroup.id, data);
                return new GroupItem(parentGroup, bookmarkCount);
            }
        }
        return null;
    }

    // 拖拽开始 - 处理被拖拽的项目
    async handleDrag(source: (BookmarkItem | GroupItem)[], treeDataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        // 支持拖拽书签与分组
        const bookmarkItems = source.filter(item => item instanceof BookmarkItem) as BookmarkItem[];
        if (bookmarkItems.length > 0) {
            const bookmarkIds = bookmarkItems.map(item => item.bookmark.id);
            treeDataTransfer.set('application/vnd.code.tree.bookmarkExplorer', new vscode.DataTransferItem(bookmarkIds));
        }

        const groupItems = source.filter(item => item instanceof GroupItem) as GroupItem[];
        if (groupItems.length > 0) {
            const groupIds = groupItems.map(item => item.group.id);
            treeDataTransfer.set('application/vnd.code.tree.bookmarkExplorer.groups', new vscode.DataTransferItem(groupIds));
        }
    }

    // 拖拽放置 - 处理放置目标
    async handleDrop(target: BookmarkItem | GroupItem | undefined, sources: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        // 优先处理分组拖拽（分组排序/移动）
        const groupTransfer = sources.get('application/vnd.code.tree.bookmarkExplorer.groups');
        if (groupTransfer) {
            const groupIds = groupTransfer.value as string[];
            if (!groupIds || groupIds.length === 0) { return; }

            // 目标 parentId 与插入点（在 target 分组之前）
            let targetParentId: string | undefined;
            let insertBeforeGroupId: string | undefined;

            if (target instanceof GroupItem) {
                // 将被拖拽分组插入到目标分组的同级，并放在目标之前
                targetParentId = target.group.parentId;
                insertBeforeGroupId = target.group.id;
            } else if (target instanceof BookmarkItem && target.bookmark.groupId) {
                // 拖拽到某个书签到该书签所在分组（成为该分组的子分组，插入到顶部）
                targetParentId = target.bookmark.groupId;
                insertBeforeGroupId = undefined;
            } else {
                // 拖拽到空白区域：移动到根级，插入到顶端
                targetParentId = undefined;
                insertBeforeGroupId = undefined;
            }

            for (const gid of groupIds) {
                await this.bookmarkManager.moveGroupToParent(gid, targetParentId, insertBeforeGroupId);
            }

            vscode.window.showInformationMessage(`✅ 已移动 ${groupIds.length} 个分组`);
            return;
        }

        // 处理书签的拖拽（原有逻辑）
        const transferItem = sources.get('application/vnd.code.tree.bookmarkExplorer');
        if (!transferItem) {
            return;
        }

        const bookmarkIds = transferItem.value as string[];
        if (!bookmarkIds || bookmarkIds.length === 0) {
            return;
        }

        let targetGroupId: string | undefined;
        let targetName: string;

        if (target instanceof GroupItem) {
            // 拖拽到分组上 - 移动到该分组
            targetGroupId = target.group.id;
            const groupPath = this.bookmarkManager.getGroupPath(targetGroupId);
            targetName = `分组 "${groupPath}"`;
        } else if (target instanceof BookmarkItem && target.bookmark.groupId) {
            // 拖拽到书签上 - 移动到该书签所在的分组
            targetGroupId = target.bookmark.groupId;
            const groupPath = this.bookmarkManager.getGroupPath(targetGroupId);
            targetName = `分组 "${groupPath}"`;
        } else {
            // 拖拽到空白区域或无分组的书签 - 移动到根级别
            targetGroupId = undefined;
            targetName = '根级别';
        }

        // 检查是否有书签需要移动（避免无意义的移动）
        const bookmarksToMove = bookmarkIds.filter(id => {
            const bookmark = this.bookmarkManager.getAllBookmarks().find(b => b.id === id);
            return bookmark && bookmark.groupId !== targetGroupId;
        });

        if (bookmarksToMove.length === 0) {
            vscode.window.showInformationMessage('书签已在目标位置，无需移动');
            return;
        }

        // 批量移动书签
        for (const bookmarkId of bookmarksToMove) {
            await this.bookmarkManager.moveBookmarkToGroup(bookmarkId, targetGroupId);
        }

        // 显示移动结果消息
        const bookmarkCount = bookmarksToMove.length;
        const bookmarkText = bookmarkCount === 1 ? '个书签' : '个书签';
        vscode.window.showInformationMessage(`✅ 已移动 ${bookmarkCount} ${bookmarkText}到 ${targetName}`);
    }
}
