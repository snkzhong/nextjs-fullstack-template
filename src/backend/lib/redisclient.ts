import IORedis, {
  Cluster,
  Redis,
  RedisOptions,
  ClusterOptions,
  ChainableCommander,
  Callback,
} from 'ioredis';
import { EventEmitter } from 'events';
import BloomFilters from 'bloom-filters';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

type ProxiedRedis<T extends object> = T & {
  [K in keyof Redis]: Redis[K];
};

//#region 类型定义
type RedisCommand = (...args: any[]) => Promise<any>;
type CommandHandler = (client: IORedis.Redis | Cluster, ...args: any[]) => any;

export interface RedisClientOptions extends RedisOptions {
  port?: number;
  host?: string;
  username?: string;
  password?: string;
  db?: number;
  prefix?: string;
  bloomFilter?: BloomFilterOptions;
  cluster?: boolean;
  redisNodes?: RedisOptions[];
  monitor?: boolean;
  tls?: Record<string, any>;
  connectionPool?: ConnectionPoolOptions;
  sentinel?: SentinelOptions;
  performance?: PerformanceOptions;
}

interface BloomFilterOptions {
  enabled?: boolean;
  size?: number;
  fpRate?: number;
}

interface ConnectionPoolOptions {
  min?: number;
  max?: number;
}

interface SentinelOptions {
  sentinels: Array<{ host: string; port: number }>;
  name: string;
}

interface PerformanceOptions {
  slowQueryThreshold?: number;
  logSlowQueries?: boolean;
}

interface CacheStats {
  commands: Record<string, { count: number; totalTime: number }>;
  hits: number;
  misses: number;
  connections: number;
}

interface LockOptions {
  ttl?: number;
  retries?: number;
  delay?: number;
}

interface PipelineExecutor {
  (pipeline: ChainableCommander): Promise<any[]>;
}

//#endregion

export default class RedisClient extends EventEmitter {
  public proxy:RedisClient;
  private client: Redis | Cluster;
  private bloomFilter?: BloomFilter;
  private commandCache = new Map<string, CommandHandler>();
  private stats: CacheStats = {
    commands: {},
    hits: 0,
    misses: 0,
    connections: 0,
  };


  public static i(options: RedisClientOptions = {}) {
    const instance = new RedisClient(options);
  }

  private constructor(private options: RedisClientOptions = {}) {
    super();
    this.initializeClient();
    this.initializeBloomFilter();
    this.registerCoreCommands();
    this.setupMonitoring();

    return this.initializeCommandProxy();
  }

  //#region 初始化逻辑
  private initializeClient() {
    const commonOptions: RedisOptions = {
      enableAutoPipelining: true,
      maxRetriesPerRequest: 3,
      showFriendlyErrorStack: true,
      ...(this.options.tls && { tls: this.options.tls }),
    };

    //分布式集群
    if (this.options.cluster) {
      this.client = new IORedis.Cluster(
        this.options.redisNodes as RedisOptions[],
        commonOptions
      );
    } 
    //主从集群
    else if (this.options.sentinel) {
      this.client = new IORedis({
        ...commonOptions,
        sentinels: this.options.sentinel.sentinels,
        name: this.options.sentinel.name,
        role: 'master',
      });
    } else {
      const _ptions: RedisOptions = {
        ...commonOptions,
        host: this.options.host || "localhost",
        port: this.options.port || 6379,
        username: this.options.username,
        password: this.options.password,
        db: this.options.db || 0,
      };
      this.client = new IORedis(_ptions);
    }

    this.setupConnectionPool();
  }

  public async connectPool(poolName:string, max:number): Promise<boolean> {
    const result = await this.client.acquire(poolName, max);
    if (result > 0) {
      return true;
    }

    return false;
  }

  public async releasePool(poolName:string): Promise<void> {
    await this.client.unacquire(poolName);
  }

  private setupConnectionPool() {
    this.client.defineCommand('acquire', {
      numberOfKeys: 1,
      lua: `
        local key = KEYS[1]
        local max = tonumber(ARGV[1])
        local current = tonumber(redis.call('GET', key) or 0)
        
        if current < max then
          redis.call('INCR', key)
          return 1
        end
        return 0
      `,
    });

    this.client.defineCommand('unacquire', {
      numberOfKeys: 1,
      lua: `
        local key = KEYS[1]
        local current = tonumber(redis.call('GET', key) or 0)
        
        if current > 0 then
          redis.call('DECR', key)
          return 1
        end
        return 0
      `,
    });
  }

  private createValidBloomFilter(expectedItems: number, falsePositiveRate: number) {
    // 边界检查：防止不合理的输入
    if (expectedItems <= 0) throw new Error("预期元素数量必须大于0");
    if (falsePositiveRate <= 0 || falsePositiveRate >= 1) {
        throw new Error("误判率必须在(0, 1)之间，例如0.01表示1%");
    }

    // 计算最优位数组大小 (m)
    const m = Math.ceil(
        (expectedItems * Math.log(falsePositiveRate)) / 
        Math.log(1 / Math.pow(2, Math.log(2)))
    );

    // 计算最优哈希函数数量 (k)，并确保至少为1
    let k = Math.round((m / expectedItems) * Math.log(2));
    k = Math.max(k, 1); // 关键：确保哈希函数数量至少为1

    // 输出参数用于验证
    console.log(`计算得到的参数 - 位数组大小: ${m}, 哈希函数数量: ${k}`);

    // 创建布隆过滤器（参数：位数组大小，哈希函数数量）
    return new BloomFilters.BloomFilter(m, k);
  }

  private initializeBloomFilter() {
    if (this.options.bloomFilter?.enabled) {
      this.bloomFilter = this.createValidBloomFilter(this.options.bloomFilter.size || 100000,
        this.options.bloomFilter.fpRate || 0.01);
    }
  }
  //#endregion

  //#region 核心功能
  public async get<T = any>(key: string): Promise<T | null> {
    const prefixedKey = this.prefixedKey(key);
    const result = await this.client.get(prefixedKey);
    console.log("get", prefixedKey, result);
    if (result === null) {
      this.stats.misses++;
      if (this.bloomFilter && !this.bloomFilter.has(key)) {
        return null;
      }
      return this.handleCachePenetration(key);
    }

    this.stats.hits++;
    return this.deserialize(result);
  }

  public async set<T = any>(
    key: string,
    value: T,
    ttl?: number,
    options?: { nx?: boolean; xx?: boolean }
  ): Promise<'OK' | null> {
    const prefixedKey = this.prefixedKey(key);
    const serialized = this.serialize(value);
    const args: (string | number)[] = [prefixedKey, serialized];

    if (ttl) {
      args.push('EX', ttl + Math.floor(Math.random() * 300));
    }

    if (options?.nx) args.push('NX');
    if (options?.xx) args.push('XX');

    await this.client.set(...args);
    this.bloomFilter?.add(key);
    return 'OK';
  }

  public async delete(...keys: string[]): Promise<number> {
    try {
      const result = await this.client.del(...keys);
      return result;
    } catch (error) {
      console.error(`删除多个 key 失败:`, error);
    }

    return 0;
  }

  public async deleteByPattern(pattern: string): Promise<number> {
    try {
      // 先查找匹配的 key
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        const result = await this.client.del(...keys);
        return result;
      }
    } catch (error) {
      console.error(`删除 key 失败:`, error);
    }

    return 0;
  }

  public async withLock(key: string, options: LockOptions, fn: () => Promise<any>) {
    const lockKey = this.prefixedKey(`lock:${key}`);
    const token = uuidv4();
    const ttl = options.ttl || 5000;

    for (let i = 0; i < (options.retries || 3); i++) {
      const acquired = await this.client.set(lockKey, token, 'PX', ttl, 'NX');
      if (acquired) {
        try {
          return await fn();
        } finally {
          await this.releaseLock(lockKey, token);
        }
      }
      await new Promise(r => setTimeout(r, options.delay || 100));
    }
    throw new Error(`Failed to acquire lock for ${key}`);
  }

  private async releaseLock(lockKey: string, token: string) {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    return this.client.eval(script, 1, lockKey, token);
  }
  //#endregion

  //#region 高级功能
  /**
   * 事务处理
   */
  public async transaction<T = any>(executor: PipelineExecutor, ...watchKeys: string[]): Promise<null | Array<any>> {
    if (watchKeys.length > 0) {
      this.client.watch(...watchKeys);
    }

    const pipe = this.client.multi();
    try {
      // 确保执行器返回 exec() 的结果
      const results = await executor(pipe);

      // 事务失败
      if (results === null) {
        return null;
      }
      
      // 强制结果类型校验
      if (!Array.isArray(results)) {
        throw new Error(`Pipeline must return results array, got ${typeof results}`);
      }

      // 安全处理每个结果项
      return results.map(([err, data], index) => {
        if (err) {
          throw new Error(`Command ${index + 1} failed: ${err.message}`);
        }
        return data as T;
      });
    } catch (err) {
      throw new Error(`Pipeline failed: ${err.message}`);
    }
  }

  /**
   * 管道执行
   */
  public async pipeline<T = any>(executor: PipelineExecutor): Promise<Array<any>> {
    const pipe = this.client.pipeline();
    try {
      // 确保执行器返回 exec() 的结果
      const results = await executor(pipe);

      // 强制结果类型校验
      if (!Array.isArray(results)) {
        throw new Error(`Pipeline must return results array, got ${typeof results}`);
      }

      // 安全处理每个结果项
      return results.map(([err, data], index) => {
        if (err) {
          throw new Error(`Command ${index + 1} failed: ${err.message}`);
        }
        return data as T;
      });
    } catch (err) {
      throw new Error(`Pipeline failed: ${err.message}`);
    }

  }

  /**
   * 批量执行多个命令
   */
  public async batch(commands: Array<[string, ...any[]]>): Promise<Array<any>> {
    const pipeline = this.client.pipeline();
    const commandStack: string[] = [];

    try {
      commands.forEach(([cmd, ...args], index) => {
        const command = cmd.toLowerCase();
        commandStack.push(`${index + 1}. ${command}`);

        // 参数验证
        if (args.some(arg => typeof arg === 'undefined')) {
          throw new Error(`Command ${command} contains undefined arguments`);
        }

        // 特殊命令处理
        if (command === 'hset') {
          if (args.length < 2) {
            throw new Error('HSET requires at least field/value pair');
          }
          const [key, ...fieldValues] = args;
          pipeline.hset(key, ...fieldValues);
        } else {
          // 通用命令调用
          if (!(command in pipeline)) {
            throw new Error(`Unsupported command: ${command}`);
          }
          (pipeline as any)[command](...args);
        }
      });

      const results = await pipeline.exec();
      return results.map(([err, result], index) => {
        if (err) {
          const originalCommand = commands[index][0];
          throw new Error(`[${originalCommand}] ${err.message}`);
        }
        return result;
      });
    } catch (error) {
      throw new Error(`Pipeline execution failed (${commandStack.join(', ')}): ${error.message}`);
    }
  }

  private wrapError(error: Error, command: string) {
    return new Error(`Redis command failed: ${command} - ${error.message}`, {
      cause: error
    });
  }

  public createReadStream(pattern = '*', count = 100) {
    return this.client.scanStream({
      match: this.prefixedKey(pattern),
      count,
    });
  }

  public getClusterInfo() {
    if (!this.isCluster) return {};
    const nodes = (this.client as Cluster).nodes();
    return nodes.map(node => ({
      host: node.options.host,
      port: node.options.port,
      status: node.status,
    }));
  }
  //#endregion

  //#region 性能优化
  private async executeCachedCommand(command: string, ...args: any[]) {
    const handler = this.commandCache.get(command)!;
    return this.withPerformanceLogging(command, () => handler(this.client, ...args));
  }

  private async sendCommand(command: string, ...args: any[]) {
    return this.withPerformanceLogging(command, () =>
      this.client.call(command, ...args)
    );
  }

  private async withPerformanceLogging<T>(command: string, fn: () => Promise<T>) {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const duration = Date.now() - start;
      this.recordCommandStats(command, duration);
      this.checkSlowQuery(command, duration);
    }
  }
  //#endregion

  //#region 工具方法
  private prefixedKey(key: string) {
    return this.options.prefix ? `${this.options.prefix}:${key}` : key;
  }

  private serialize(data: any) {
    const type = typeof data;
    if (data === undefined) return '__undefined__';
    return JSON.stringify({ type, data });
  }

  private deserialize<T>(payload: string): T {
    if (payload === '__undefined__') return undefined as T;
    const { type, data } = JSON.parse(payload);

    const r = this.castType(data, type);
    return r;
  }

  private castType(data: any, type: string) {
    switch (type) {
      case 'number':
        return Number(data);
      case 'boolean':
        return Boolean(data);
      case 'object':
        return data;
      default:
        return data;
    }
  }

  private get isCluster() {
    return this.client instanceof IORedis.Cluster;
  }
  //#endregion

  //#region 统计监控
  private setupMonitoring() {
    if (this.options.monitor) {
      this.client.monitor((err, monitor) => {
        monitor.on('monitor', (time, args) => {
          this.emit('command', { time, command: args });
        });
      });
    }

    setInterval(() => this.logStats(), 60000);
  }

  private recordCommandStats(command: string, duration: number) {
    const stats = this.stats.commands[command] || { count: 0, totalTime: 0 };
    stats.count++;
    stats.totalTime += duration;
    this.stats.commands[command] = stats;
  }

  private checkSlowQuery(command: string, duration: number) {
    const threshold = this.options.performance?.slowQueryThreshold || 100;
    if (duration > threshold && this.options.performance?.logSlowQueries) {
      console.warn(`Slow query detected: ${command} took ${duration}ms`);
    }
  }

  private logStats() {
    console.log('\n=== Redis Client Statistics ===');
    console.log(`Connections: ${this.stats.connections}`);
    console.log(`Hit Rate: ${((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 || 0).toFixed(1)}%`);
    
    console.log('\nCommand Statistics:');
    Object.entries(this.stats.commands).forEach(([cmd, { count, totalTime }]) => {
      console.log(`- ${cmd}: ${count} calls, Avg: ${(totalTime / count).toFixed(2)}ms`);
    });
  }
  //#endregion

  //#region 动态命令支持
  private initializeCommandProxy():RedisClient {
    return new Proxy(this, {
      get: (target, propKey) => {
        // 优先返回显式实现的属性
        if (Reflect.has(target, propKey)) {
          return Reflect.get(target, propKey);
        }

        // 动态代理原生方法
        const nativeMethod = (this.client as any)[propKey];
        if (typeof nativeMethod === 'function') {
          return (...args: any[]) => {
            const result = nativeMethod.apply(this.client, args);
            return result instanceof Redis 
              ? this.proxyChainable(result) // 处理链式调用
              : result;
          };
        }

        return Reflect.get(target, propKey);
      }
    }) as ProxiedRedis<this>;
  }

  // 代理链式命令（如 multi、pipeline）
  private proxyChainable(chainable: ChainableCommander) {
    return new Proxy(chainable, {
      get: (target, propKey) => {
        const value = (target as any)[propKey];
        return typeof value === 'function' 
          ? (...args: any[]) => {
              const result = value.apply(target, args);
              return result === target 
                ? this.proxyChainable(result) // 维持链式调用
                : result;
            }
          : value;
      }
    });
  }

  public registerCommand(name: string, handler: CommandHandler) {
    this.commandCache.set(name.toLowerCase(), handler);
    (this as any)[name] = (...args: any[]) => this.executeCachedCommand(name, ...args);
  }

  private registerCoreCommands() {
    this.registerCommand('hgetall', (client, key) => client.hgetall(key));
    this.registerCommand('zrangebyscore', (client, key, min, max) =>
      client.zrangebyscore(key, min, max)
    );
    // 注册所有其他核心命令...
  }
  //#endregion

  // 实现可调用接口
  public async call(command: string, ...args: any[]) {
    return this.sendCommand(command, ...args);
  }

  // 类型合并声明
  // public readonly keys: KeyCommands;
  // public readonly strings: StringCommands;
  // public readonly hash: HashCommands;
  // public readonly list: ListCommands;
  // public readonly set: SetCommands;
  // public readonly zset: SortedSetCommands;
}

// // 补充类型定义
// interface KeyCommands {
//   exists: (...keys: string[]) => Promise<number>;
//   expire: (key: string, seconds: number) => Promise<number>;
//   // 其他键命令...
// }

// interface StringCommands {
//   set: (key: string, value: string, ttl?: number) => Promise<'OK'>;
//   get: (key: string) => Promise<string | null>;
//   // 其他字符串命令...
// }

// 其他命令集接口定义...

// 使用示例
/*
const redis = new RedisClient({
  prefix: 'app',
  bloomFilter: { enabled: true },
  performance: { logSlowQueries: true }
});

// 使用原生命令
await redis.call('SET', 'key', 'value');
await redis.call('HGETALL', 'user:1');

// 使用类型化方法
await redis.strings.set('counter', '0');
const count = await redis.strings.get('counter');

// 使用高级功能
await redis.withLock('resource', { ttl: 5000 }, async () => {
  // 临界区代码
});

// 性能批处理
await redis.batch([
  ['SET', 'a', 1],
  ['INCR', 'a'],
  ['GET', 'a']
]);

// 监控事件
redis.on('command', ({ time, command }) => {
  console.log(`Executed: ${command} at ${time}`);
});
*/
