import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type StorageType = 'file' | 'sqlite' | 'database';

export interface StorageConfig {
  type: StorageType;

  // 通用配置
  location?: string;   // 文件路径 / SQLite 文件路径
  dbUrl?: string;      // 数据库连接地址
  username?: string;   // 数据库用户名
  password?: string;   // 数据库密码
}

export interface IStorage<T> {
  save(key: string, data: T): Promise<void>;
  load(key: string): Promise<T | undefined>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
}

/**
 * 文件存储：写 JSON 文件
 */
class FileStorage<T> implements IStorage<T> {
  private filePath: string;
  private data: Record<string, T> = {};

  constructor(private config: StorageConfig, private context: vscode.ExtensionContext) {
    // 如果没传 location，就存到插件的 globalStorageUri 下
    const projectName = vscode.workspace.name || 'default';
    const basePath = config.location
      ? path.resolve(config.location)
      : path.join(require('os').homedir(), '.vs_bookmark', projectName, 'storage.json');

    this.filePath = basePath;

    // expose storage path for debugging
    try {
      console.log(`[bookmark] FileStorage initialized at: ${this.filePath}`);
    } catch (e) {
      // ignore
    }

    // 确保存储目录存在
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        console.error('Failed to create storage directory:', dir, e);
        try { vscode.window.showErrorMessage('无法创建书签存储目录: ' + dir); } catch {};
      }
    }

    // 初始化时加载数据
    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
      } catch (e) {
        console.error('Failed to load storage file:', e);
        this.data = {};
      }
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
      try { console.log(`[bookmark] Persisted storage to ${this.filePath}`); } catch {}
    } catch (e: unknown) {
      console.error('Failed to write storage file:', this.filePath, e);
      const errMsg = (e instanceof Error) ? e.message : String(e);
      try { vscode.window.showErrorMessage('保存书签到文件失败: ' + errMsg); } catch {}
    }
  }

  async save(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.persist();
  }

  async load(key: string): Promise<T | undefined> {
    return this.data[key];
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
    this.persist();
  }

  async listKeys(): Promise<string[]> {
    return Object.keys(this.data);
  }
}

export class StorageFactory {
  static create<T>(config: StorageConfig, context: vscode.ExtensionContext): IStorage<T> {
    switch (config.type) {
      case 'file':
        return new FileStorage<T>(config, context);
      case 'sqlite':
        throw new Error('SQLite storage not implemented yet.');
      case 'database':
        throw new Error('Database storage not implemented yet.');
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }
}