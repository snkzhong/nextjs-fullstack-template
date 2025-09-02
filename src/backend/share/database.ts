import { Prisma, PrismaClient } from '@prisma/client'
import knex, { Knex } from 'knex';
import { Sql, Curd, AnyRecord } from '~/backend/lib/knex';
import { PrismaSql } from '~/backend/lib/prisma/prismasql';

/** 
 * 1. Prisma 为主
 *  负责 数据模型定义（schema.prisma）
 *  执行 数据库迁移（prisma migrate）
 *  处理 基础 CRUD 操作（自动生成的 TypeScript 类型）
 * 2. Knex 为辅
 *  仅用于 复杂查询（如多表联查、子查询、复杂聚合）
 *  执行 原生 SQL 语句（需 Prisma $queryRaw 无法满足时）
 */

export const prismaInst = new PrismaClient({
	log: [
      {
        level: 'query', // 监听 query 级别
        emit: 'event'   // 重要！必须设置为 'event' 才能触发 $on('query')
      },
      'info',  // 其他级别可以保持默认 (emit 到 stdout)，也可以设为 'event'
      'warn',
      'error',
    ],
});

try {
  await prismaInst.$connect();
  console.log('✅ Prisma 连接成功');
} catch (error) {
  console.error('❌ Prisma 连接失败:', error);
}

type PrismaMetric = {
  key: string
  value: number
  description: string
  labels?: Record<string, string>
}

type MetricsResult = {
  counters: PrismaMetric[]
  gauges: PrismaMetric[]
  histograms: any[]
}

// 通用指标获取函数
function getMetricValue(metrics: MetricsResult, targetKey: string): number {
  const allMetrics = [...metrics.counters, ...metrics.gauges]
  const found = allMetrics.find(m => m.key === targetKey)
  return found?.value ?? 0
}

// 专用获取器
const metricGetters = {
  active: (m: MetricsResult) => getMetricValue(m, 'prisma_pool_connections_busy'),
  idle: (m: MetricsResult) => getMetricValue(m, 'prisma_pool_connections_idle'),
  waiting: (m: MetricsResult) => getMetricValue(m, 'prisma_client_queries_wait'),
  totalQueries: (m: MetricsResult) => getMetricValue(m, 'prisma_client_queries_total'),
  openedConnections: (m: MetricsResult) => getMetricValue(m, 'prisma_pool_connections_opened_total'),
  closedConnections: (m: MetricsResult) => getMetricValue(m, 'prisma_pool_connections_closed_total')
}


let lastTotalQueries = 0
let lastTimestamp = Date.now()

async function getEnhancedMetrics() {
  const metrics = await prismaInst.$metrics.json() as MetricsResult
  
  // 连接池状态
  const poolMetrics = {
    active: metricGetters.active(metrics),
    idle: metricGetters.idle(metrics),
    waiting: metricGetters.waiting(metrics),
    open: getMetricValue(metrics, 'prisma_pool_connections_open'),
    lifetimeOpened: metricGetters.openedConnections(metrics),
    lifetimeClosed: metricGetters.closedConnections(metrics)
  }

  // QPS计算
  const currentTotal = metricGetters.totalQueries(metrics)
  const currentTime = Date.now()
  const timeDiffSec = (currentTime - lastTimestamp) / 1000

  const qps = timeDiffSec > 0 
    ? Number(((currentTotal - lastTotalQueries) / timeDiffSec).toFixed(2))
    : 0

  // 更新记录
  lastTotalQueries = currentTotal
  lastTimestamp = currentTime

  return {
    connection_pool: poolMetrics,
    queries: {
      qps,
      total: currentTotal,
      active: getMetricValue(metrics, 'prisma_client_queries_active'),
      waitHistogram: metrics.histograms.find(h => h.key === 'prisma_client_queries_wait_histogram_ms')?.value
    }
  }
}

// // 格式化输出示例
// setInterval(async () => {
//   const stats = await getEnhancedMetrics()
  
//   console.log(`
// === 数据库监控 (${new Date().toLocaleTimeString()}) ===
// 连接池:
//   活动: ${stats.connection_pool.active}
//   空闲: ${stats.connection_pool.idle}
//   等待: ${stats.connection_pool.waiting}
//   当前开放: ${stats.connection_pool.open}
//   历史打开: ${stats.connection_pool.lifetimeOpened}
//   历史关闭: ${stats.connection_pool.lifetimeClosed}

// 查询统计:
//   QPS: ${stats.queries.qps}/s
//   总次数: ${stats.queries.total}
//   活跃查询: ${stats.queries.active}
//   `)
// }, 5000);


prismaInst.$on('query', (e) => {
	console.log(`SQL: ${e.query}, Params: ${e.params}, Duration: ${e.duration}`);
});

prismaInst.$on('error' as const, (e) => {
  console.error('Prisma Error:', e.message)
  console.error('Timestamp:', e.timestamp)
  // 触发告警、记录到错误追踪系统
  // alertService.send('Prisma Error', e.message)
});

prismaInst.$on('warn', (e) => {
  console.warn('Prisma Warning:', e.message)
  // 例如：检测到 N+1 查询警告
});


// 1. 全局性能监控中间件
prismaInst.$use(async (params, next) => {
  const start = Date.now()

  // 执行查询
  const result = await next(params)

  const end = Date.now()
  const duration = end - start

  console.log(
    `Query ${params.model}.${params.action} took ${duration}ms`
  )

  // 可以将此信息附加到返回结果或发送到监控系统
  return result
});


// // 2. 实现软删除 (Soft Delete)
// // 假设你的 User 模型有一个 deletedAt 字段
// prismaInst.$use(async (params, next) => {
//   // 拦截 delete 操作
//   if (params.model === 'User' && params.action === 'delete') {
//     // 将 delete 转换为 update，设置 deletedAt
//     params.action = 'update'
//     params.args = {
//       ...params.args,
//       data: { deletedAt: new Date() },
//     }
//   }

//   // 拦截 deleteMany 操作
//   if (params.model === 'User' && params.action === 'deleteMany') {
//     params.action = 'updateMany'
//     if (params.args.data !== undefined) {
//       params.args.data = { ...params.args.data, deletedAt: new Date() }
//     } else {
//       params.args.data = { deletedAt: new Date() }
//     }
//   }

//   return next(params)
// })

// // 3. 自动设置 createdAt/updatedAt (虽然 Prisma 有 @default(now()), 但中间件可用于更复杂逻辑)
// prismaInst.$use(async (params, next) => {
//   if (params.action === 'create') {
//     // 例如，为所有 create 操作添加 createdAt
//     if (params.args.data instanceof Object) {
//       params.args.data = {
//         ...params.args.data,
//         createdAt: new Date(),
//         // updatedAt: new Date(), // create 时通常也设为 createdAt
//       }
//     }
//   }

//   if (params.action === 'update' || params.action === 'updateMany') {
//     // 为 update 操作添加 updatedAt
//     if (params.args.data instanceof Object) {
//       params.args.data = {
//         ...params.args.data,
//         updatedAt: new Date(),
//       }
//     }
//   }

//   return next(params)
// })

// // 4. 基于条件的查询拦截 (例如，多租户)
// prismaInst.$use(async (params, next) => {
//   // 假设通过某种方式获取当前租户ID (例如从请求上下文，这里简化)
//   const currentTenantId = getCurrentTenantIdSomehow()

//   // 只对特定模型进行租户过滤
//   if (['Post', 'Comment'].includes(params.model) && 
//       ['findMany', 'findUnique', 'findFirst'].includes(params.action)) {
    
//     // 如果查询没有明确指定 tenantId，则自动添加
//     if (!params.args.where || !params.args.where.tenantId) {
//       if (params.args.where) {
//         params.args.where.tenantId = currentTenantId
//       } else {
//         params.args.where = { tenantId: currentTenantId }
//       }
//     }
//   }

//   return next(params)
// })

// // 5. 处理 Prisma Client 已经关闭的错误 (优雅降级)
// prismaInst.$use(async (params, next) => {
//   try {
//     return await next(params)
//   } catch (error) {
//     // 检查是否是 Prisma Client 已断开连接的错误
//     if (error instanceof prismaInst.PrismaClientKnownRequestError && 
//         error.code === 'P2010') { // P2010 是 "Raw query failed" 可能包括连接问题
//       // 或者更通用的检查
//       if (error.message.includes('Client is not connected')) {
//         console.warn('Prisma Client disconnected, reconnecting...')
//         await prismaInst.$connect() // 尝试重新连接
//         return next(params) // 重试查询
//       }
//     }
//     throw error // 重新抛出其他错误
//   }
// })


// 解析 DATABASE_URL 参数
const parsePoolConfig = (connectionString: string) => {
  const url = new URL(connectionString)
  return {
    min: parseInt(url.searchParams.get('min_connections') || '2'),
    max: parseInt(url.searchParams.get('connection_limit') || '20')
  }
}

// 获取环境变量配置
const poolConfig = parsePoolConfig(process.env.DATABASE_URL!)


// 创建可动态调整的连接池类
class AdaptivePoolKnex extends knex.Client {
  private _currentMax: number

  constructor(config: knex.Config) {
    super(config)
    this._currentMax = config.pool?.max || 20
  }

  updatePoolSize(newMax: number) {
    this._currentMax = newMax
    this.pool.destroyAllNow()
    this.initializePool()
  }

  getCurrentMax() {
    return this._currentMax
  }
}


// 动态调整示例
function adjustPoolBasedOnMetrics() {
  setInterval(async () => {
    const metrics = await prisma.$metrics.json()
    const active = metrics.gauges.find(
      (g: any) => g.key === 'prisma_pool_connections_busy'
    )?.value || 0
    
    const newMax = Math.min(50, Math.max(10, active * 2))
    
    if (newMax !== adaptiveKnex.getCurrentMax()) {
      console.log(`动态调整连接池大小: ${newMax}`)
      adaptiveKnex.updatePoolSize(newMax)
    }
  }, 60000)
}


//共享环境变量配置
export const knexInst: Knex = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: { 
    min: poolConfig.min,
    max: poolConfig.max,
    // 添加连接生命周期管理
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  }
});

export const sql = Sql.i(knexInst);
export const curd = Curd.i(knexInst);
export const prismaSql = new PrismaSql(prismaInst);
