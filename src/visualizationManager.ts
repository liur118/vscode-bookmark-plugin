import * as vscode from 'vscode';
import * as path from 'path';
import { Bookmark } from './bookmarkManager';

export interface LinkNode {
    id: string;
    label: string;
    bookmarkId?: string;
    file?: string;
    line?: number;
    column?: number;
    x?: number;
    y?: number;
}

export interface LinkEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

export interface VisualizationData {
    nodes: LinkNode[];
    edges: LinkEdge[];
}

export class VisualizationManager {
    private context: vscode.ExtensionContext;
    private panel: vscode.WebviewPanel | undefined;
    private data: VisualizationData = { nodes: [], edges: [] };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadVisualizationData();
    }

    private loadVisualizationData(): void {
        const storedData = this.context.workspaceState.get<VisualizationData>('visualizationData');
        if (storedData) {
            this.data = storedData;
        }
    }

    private saveVisualizationData(): void {
        this.context.workspaceState.update('visualizationData', this.data);
    }

    public openVisualization(bookmarks: Bookmark[]): void {
        if (this.panel) {
            this.panel.reveal();
            this.updateVisualizationData(bookmarks);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'bookmarkVisualization',
            '书签可视化链路',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.updateVisualizationData(bookmarks);

        // 监听来自 webview 的消息
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'jumpToBookmark':
                        this.jumpToBookmark(message.bookmarkId);
                        break;
                    case 'addNode':
                        this.addNode(message.data);
                        break;
                    case 'addEdge':
                        this.addEdge(message.data);
                        break;
                    case 'deleteNode':
                        this.deleteNode(message.nodeId);
                        break;
                    case 'deleteEdge':
                        this.deleteEdge(message.edgeId);
                        break;
                    case 'saveData':
                        this.data = message.data;
                        this.saveVisualizationData();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private updateVisualizationData(bookmarks: Bookmark[]): void {
        // 从书签创建节点
        const bookmarkNodes: LinkNode[] = bookmarks.map(bookmark => ({
            id: bookmark.id,
            label: bookmark.label,
            bookmarkId: bookmark.id,
            file: bookmark.file,
            line: bookmark.line,
            column: bookmark.column
        }));

        // 合并现有节点和书签节点
        const existingNodeIds = new Set(this.data.nodes.map(n => n.id));
        const newNodes = bookmarkNodes.filter(n => !existingNodeIds.has(n.id));
        
        this.data.nodes = [...this.data.nodes.filter(n => !n.bookmarkId || bookmarks.some(b => b.id === n.bookmarkId)), ...newNodes];

        // 发送数据到 webview
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'updateData',
                data: this.data
            });
        }
    }

    private jumpToBookmark(bookmarkId: string): void {
        vscode.commands.executeCommand('vscode-bookmark-plugin.jumpToBookmark', bookmarkId);
    }

    private addNode(nodeData: Partial<LinkNode>): void {
        const node: LinkNode = {
            id: this.generateId(),
            label: nodeData.label || '新节点',
            ...nodeData
        };
        this.data.nodes.push(node);
        this.saveVisualizationData();
    }

    private addEdge(edgeData: Partial<LinkEdge>): void {
        const edge: LinkEdge = {
            id: this.generateId(),
            source: edgeData.source!,
            target: edgeData.target!,
            label: edgeData.label
        };
        this.data.edges.push(edge);
        this.saveVisualizationData();
    }

    private deleteNode(nodeId: string): void {
        this.data.nodes = this.data.nodes.filter(n => n.id !== nodeId);
        this.data.edges = this.data.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
        this.saveVisualizationData();
    }

    private deleteEdge(edgeId: string): void {
        this.data.edges = this.data.edges.filter(e => e.id !== edgeId);
        this.saveVisualizationData();
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private getWebviewContent(): string {
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'visualization.js'))
        );
        const styleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'visualization.css'))
        );

        return `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>书签可视化链路</title>
    <link href="${styleUri}" rel="stylesheet">
    <script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body>
    <div id="toolbar">
        <button id="addNodeBtn">添加节点</button>
        <button id="addEdgeBtn">添加连接</button>
        <button id="deleteMode">删除模式</button>
        <button id="saveBtn">保存</button>
        <button id="exportBtn">导出</button>
        <button id="importBtn">导入</button>
        <input type="file" id="importFile" accept=".json" style="display: none;">
    </div>
    <div id="visualization"></div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
