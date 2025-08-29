import { Prisma, PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
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

prisma.$on('query', (e) => {
	console.log(`SQL: ${e.query}, Params: ${e.params}, Duration: ${e.duration}`);
});

prisma.$on('error' as const, (e) => {
  console.error('Prisma Error:', e.message)
  console.error('Timestamp:', e.timestamp)
  // 触发告警、记录到错误追踪系统
  // alertService.send('Prisma Error', e.message)
});

prisma.$on('warn', (e) => {
  console.warn('Prisma Warning:', e.message)
  // 例如：检测到 N+1 查询警告
});


// 1. 全局性能监控中间件
prisma.$use(async (params, next) => {
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
// prisma.$use(async (params, next) => {
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
// prisma.$use(async (params, next) => {
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
// prisma.$use(async (params, next) => {
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
// prisma.$use(async (params, next) => {
//   try {
//     return await next(params)
//   } catch (error) {
//     // 检查是否是 Prisma Client 已断开连接的错误
//     if (error instanceof Prisma.PrismaClientKnownRequestError && 
//         error.code === 'P2010') { // P2010 是 "Raw query failed" 可能包括连接问题
//       // 或者更通用的检查
//       if (error.message.includes('Client is not connected')) {
//         console.warn('Prisma Client disconnected, reconnecting...')
//         await prisma.$connect() // 尝试重新连接
//         return next(params) // 重试查询
//       }
//     }
//     throw error // 重新抛出其他错误
//   }
// })

