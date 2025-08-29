import knex, { Knex } from 'knex';

let dbInstance: Knex = null;
let isInitialized = false;

// 定义返回结果的接口
export interface DatabaseConnectionInfo {
  type: string;      // 数据库类型 (e.g., 'mysql', 'postgresql', 'mongodb')
  host?: string;     // 主机地址 (对于 sqlite 通常是 undefined)
  port?: number;     // 端口号 (可选)
  username?: string; // 用户名 (可选)
  password?: string; // 密码 (可选)
  database?: string; // 数据库名称
  [key: string]: any; // 允许其他可能的参数 (如查询参数)
}

/**
 * 解析数据库连接 URL
 * 支持格式: protocol://[username[:password]@]host[:port]/database[?parameters]
 * 例如: mysql://user:pass@localhost:3306/mydb, postgresql://user@host/db, sqlite://:memory:, mongodb://host/db
 *
 * @param url - 数据库连接 URL 字符串
 * @returns 包含解析出的连接信息的对象
 * @throws 如果 URL 格式无效则抛出错误
 */
function parseDatabaseUrl(url: string): DatabaseConnectionInfo {
  // 去除首尾空格
  const trimmedUrl = url.trim();

  // 正则表达式解析 URL
  // 这个正则表达式处理: protocol://[user[:pass]@]host[:port]/path[?query][#hash]
  const regex = /^(\w+):\/\/(?:(?:(.*?)(?::(.*?)?)?@)?([^\/:?#]+?)(?::(\d+))?)(?:\/([^?#]*))?(?:\?(.*?))?(?:#(.*?))?$/;
  const match = trimmedUrl.match(regex);

  if (!match) {
    throw new Error(`Invalid database URL format: ${url}`);
  }

  const [, protocol, username, password, host, portStr, path, query] = match;

  // 标准化数据库类型
  let dbType = protocol.toLowerCase();
  // 常见的同义词处理
  if (dbType === 'postgres' || dbType === 'postgresql') {
    dbType = 'postgresql';
  } else if (dbType === 'mongo' || dbType === 'mongodb+srv') {
    dbType = 'mongodb';
  }
  // 可以根据需要添加更多数据库类型的映射

  // 特殊处理 SQLite，它的 host 和 path 比较特殊
  if (dbType === 'sqlite') {
    // SQLite 的 URL 通常是 sqlite:///path/to/database 或 sqlite://:memory:
    // host 部分对于文件路径是空的，对于 :memory: 是 ':memory:'
    // path 就是数据库文件名或 ':memory:'
    return {
      type: 'sqlite',
      database: path || ':memory:', // 如果 path 为空，可能是 :memory:
      // host 和 port 对于 SQLite 通常不适用
    };
  }

  // 处理 MongoDB 的特殊情况，path 可能包含认证数据库 (authSource)
  let database = path || '';
  let authSource: string | undefined;
  if (dbType === 'mongodb' && database.includes('?')) {
    // 如果 path 里包含了 ?，说明查询参数混在 path 里了 (旧格式或特殊情况)
    const [dbPart, queryPart] = database.split('?', 2);
    database = dbPart;
    // 合并查询参数
    const combinedQuery = query ? `${queryPart}&${query}` : queryPart;
    // 解析 authSource
    const queryParams = new URLSearchParams(combinedQuery);
    authSource = queryParams.get('authSource') || undefined;
  }

  // 解析查询参数 (如果存在)
  const queryParams: { [key: string]: string } = {};
  if (query) {
    const searchParams = new URLSearchParams(query);
    for (const [key, value] of searchParams) {
      queryParams[key] = value;
    }
  }

  // 构建返回对象
  const result: DatabaseConnectionInfo = {
    type: dbType,
    host: host || undefined,
    port: portStr ? parseInt(portStr, 10) : undefined,
    username: username || undefined,
    password: password || undefined, // 注意: password 可能是 undefined (当只有 username 没有 :password@ 时)
    database: database || undefined,
    ...queryParams, // 将查询参数也添加到结果中
  };

  // MongoDB 特殊处理: 如果 authSource 在查询参数中已解析，则添加
  if (authSource) {
    result.authSource = authSource;
  }

  // 清理: 移除值为 undefined 的属性 (可选，取决于你的需求)
  // Object.keys(result).forEach(key => {
  //   if (result[key as keyof DatabaseConnectionInfo] === undefined) {
  //     delete result[key as keyof DatabaseConnectionInfo];
  //   }
  // });

  return result;
}

export function connectDb(url: string): Knex {
  const config: DatabaseConnectionInfo = parseDatabaseUrl(url);
  const dbInstance = knex({
      client: config.type,
      connection: {
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
      },
      // 对于 TypeScript，建议启用类型检查
      migrations: {
        directory: './migrations'
      }
    });

  return dbInstance;
}