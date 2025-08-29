import Redis, { Cluster, RedisOptions, Sentinel } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { Worker, isMainThread } from 'worker_threads';
import * as promClient from 'prom-client';
import * as winston from 'winston';

// 配置类型定义
interface MQConfig {
  streamKey?: string;
  responseStreamKey?: string;
  concurrency?: number;
  clusterNodes?: Array<{ host: string; port: number }>;
  sentinels?: Array<{ host: string; port: number }>;
  sentinelName?: string;
  tls?: Record<string, any>;
  connectionPoolSize?: number;
  logLevel?: string;
}

// 扩展的消费者配置
interface EnhancedConsumerOptions extends ConsumerOptions {
  concurrency?: number;
  autoScaleThreshold?: number;
}

// 监控指标
const metrics = {
  messagesSent: new promClient.Counter({
    name: 'mq_messages_sent_total',
    help: 'Total messages sent',
    labelNames: ['type']
  }),
  messageProcessingTime: new promClient.Histogram({
    name: 'mq_message_processing_seconds',
    help: 'Message processing time',
    labelNames: ['status']
  }),
  consumerLag: new promClient.Gauge({
    name: 'mq_consumer_lag',
    help: 'Consumer lag in milliseconds'
  })
};

// 日志配置
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'mq.log' })
  ]
});

class EnhancedRedisStreamMQ extends RedisStreamMQ {
  private config: MQConfig;
  private workers: Worker[] = [];
  private connectionPool: Redis[] = [];
  private activeConsumers: number = 1;

  constructor(config: MQConfig) {
    super(EnhancedRedisStreamMQ.createRedisClient(config));
    this.config = config;
    this.initConnectionPool();
    this.startMonitoring();
  }

  private static createRedisClient(config: MQConfig): Redis | Cluster {
    if (config.clusterNodes) {
      return new Cluster(config.clusterNodes, {
        scaleReads: 'all',
        redisOptions: {
          tls: config.tls,
          connectionPoolSize: config.connectionPoolSize || 10
        }
      });
    }

    if (config.sentinels) {
      return new Redis({
        sentinels: config.sentinels,
        name: config.sentinelName,
        tls: config.tls
      });
    }

    return new Redis({
      host: 'localhost',
      port: 6379,
      tls: config.tls,
      connectionPoolSize: config.connectionPoolSize || 10
    });
  }

  private initConnectionPool() {
    for (let i = 0; i < (this.config.connectionPoolSize || 10); i++) {
      this.connectionPool.push(EnhancedRedisStreamMQ.createRedisClient(this.config));
    }
  }

  private getConnection(): Redis | Cluster {
    return this.connectionPool[Math.floor(Math.random() * this.connectionPool.length)];
  }

  // 增强的批量发送方法
  async sendBatchAsync(messages: Array<{ body: any; headers?: Record<string, string> }>) {
    const pipeline = this.getConnection().pipeline();
    const ids: string[] = [];

    messages.forEach(msg => {
      const id = uuidv4();
      const message: Message = {
        id,
        body: msg.body,
        timestamp: Date.now(),
        headers: msg.headers || {}
      };
      pipeline.xadd(this.streamKey, '*', 'message', JSON.stringify(message));
      ids.push(id);
    });

    await pipeline.exec();
    metrics.messagesSent.inc(messages.length);
    return ids;
  }

  // 持久化增强
  private async ensurePersistence() {
    await this.getConnection().config('SET', 'save', '900 1 300 10 60 10000');
    await this.getConnection().config('SET', 'appendonly', 'yes');
  }

  // 心跳检测
  private startHeartbeatCheck() {
    setInterval(async () => {
      const consumers = await this.getConnection().xinfo('CONSUMERS', this.streamKey, 'GROUP');
      consumers.forEach(async (consumer: any) => {
        const idleTime = Date.now() - consumer.idle;
        if (idleTime > 300000) { // 5分钟无活动
          logger.warn(`Consumer ${consumer.name} is inactive, restarting...`);
          await this.restartConsumer(consumer.name);
        }
      });
    }, 60000);
  }

  // 幂等性处理
  private async checkIdempotency(messageId: string): Promise<boolean> {
    const key = `mq:idempotent:${messageId}`;
    const result = await this.getConnection().set(key, 'processed', 'EX', 86400, 'NX');
    return result === 'OK';
  }

  // 自动扩缩容
  private async autoScaleConsumer(options: EnhancedConsumerOptions) {
    const streamInfo = await this.getConnection().xinfo('STREAM', this.streamKey);
    const pendingCount = streamInfo?.length || 0;
    
    if (pendingCount > (options.autoScaleThreshold || 1000)) {
      this.activeConsumers = Math.min(
        this.activeConsumers * 2,
        options.concurrency || 10
      );
      this.scaleConsumers();
    }
  }

  // 消费者进程管理
  private scaleConsumers() {
    if (this.workers.length < this.activeConsumers) {
      const needed = this.activeConsumers - this.workers.length;
      for (let i = 0; i < needed; i++) {
        const worker = new Worker('./consumer.js', {
          workerData: {
            config: this.config,
            consumerOptions: this.consumerOptions
          }
        });
        this.workers.push(worker);
      }
    }
  }

  // 监控实现
  private startMonitoring() {
    setInterval(async () => {
      try {
        const info = await this.getConnection().xinfo('STREAM', this.streamKey);
        const lastEntry = await this.getConnection().xrevrange(
          this.streamKey, '+', '-', 'COUNT', 1
        );
        
        if (lastEntry.length > 0) {
          const lag = Date.now() - parseInt(lastEntry[0][1][1]);
          metrics.consumerLag.set(lag);
        }
      } catch (e) {
        logger.error('Monitoring error:', e);
      }
    }, 15000);

    // 暴露Prometheus指标端点
    require('http').createServer(async (req: any, res: any) => {
      if (req.url === '/metrics') {
        res.setHeader('Content-Type', promClient.register.contentType);
        res.end(await promClient.register.metrics());
      } else {
        res.statusCode = 404;
        res.end();
      }
    }).listen(9090);
  }

  // 灾难恢复
  async backupStream(targetRedis: Redis) {
    const entries = await this.getConnection().xrange(this.streamKey, '-', '+');
    const pipeline = targetRedis.pipeline();
    
    entries.forEach(([id, fields]: [string, string[]]) => {
      pipeline.xadd(this.streamKey, id, ...fields);
    });
    
    await pipeline.exec();
    logger.info(`Stream backup completed with ${entries.length} entries`);
  }

  // 增强的消费处理
  override async subscribeAsync<T = any>(
    handler: (message: Message<T>) => Promise<void>,
    options: EnhancedConsumerOptions
  ) {
    this.startHeartbeatCheck();
    
    // 幂等性检查
    const enhancedHandler = async (message: Message<T>) => {
      const isNew = await this.checkIdempotency(message.id);
      if (!isNew) {
        logger.warn(`Duplicate message detected: ${message.id}`);
        return;
      }

      const endTimer = metrics.messageProcessingTime.startTimer();
      try {
        await handler(message);
        endTimer({ status: 'success' });
      } catch (e) {
        endTimer({ status: 'error' });
        throw e;
      }
    };

    // 自动扩缩容
    setInterval(() => this.autoScaleConsumer(options), 30000);

    // 多线程处理
    if (isMainThread && (options.concurrency || 1) > 1) {
      this.activeConsumers = options.concurrency || 1;
      this.scaleConsumers();
    } else {
      super.subscribeAsync(enhancedHandler, options);
    }
  }

  // TLS连接封装
  private createSecureConnection() {
    return new Redis({
      host: this.config.clusterNodes?.[0].host || 'localhost',
      port: this.config.clusterNodes?.[0].port || 6379,
      tls: this.config.tls,
      reconnectOnError: (err: Error) => {
        logger.error('TLS connection error:', err);
        return true;
      }
    });
  }

  // 关闭增强
  override async disconnect() {
    await super.disconnect();
    this.connectionPool.forEach(conn => conn.quit());
    this.workers.forEach(worker => worker.terminate());
  }
}

// 使用示例
const config: MQConfig = {
  clusterNodes: [
    { host: 'redis-node1', port: 6379 },
    { host: 'redis-node2', port: 6379 }
  ],
  tls: {
    rejectUnauthorized: false,
    ca: [process.env.REDIS_CA_CERT!]
  },
  connectionPoolSize: 20,
  logLevel: 'debug'
};

const mq = new EnhancedRedisStreamMQ(config);

// 生产环境部署时需要：
// 1. 配置Prometheus监控
// 2. 设置日志管理系统
// 3. 配置自动扩缩容策略
// 4. 启用TLS加密
// 5. 定期执行备份
setInterval(() => mq.backupStream(backupRedis), 3600000);
