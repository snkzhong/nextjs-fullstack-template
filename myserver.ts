import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import type { NextApiRequest, NextApiResponse } from 'next';
import { EventEmitter } from 'events';

import { EventSystem } from "~/backend/lib/eventsystem";
import { HookSystem } from "~/backend/lib/hooksystem";
import { MessageQueue } from "~/backend/lib/messagequeue";

import path from "path";
import { readFileSync, existsSync } from "fs";
import { parse as parseToml, stringify } from "smol-toml";

let configMerged: Record<string, any> = {};

function parseEnv(filePath: string) {
  try {
    // 读取 .env 文件内容
    const envFile = readFileSync(filePath, 'utf8');
    
    // 按行分割文件内容
    const lines = envFile.split('\n');

    // 存储临时环境变量
    const tempEnv: Record<string, any> = {};

    // 解析每一行
    lines.forEach((line) => {
      // 去除前后空格和注释
      line = line.trim().replace(/#.*/, '');
      
      if (line === '') return;

      // 分割键值对
      const [key, value] = line.split('=');
      if (!key || !value) return;

      // 存储到临时对象
      tempEnv[key.trim()] = value.trim();
    });

    // 处理变量引用
    Object.keys(tempEnv).forEach(key => {
      let value = tempEnv[key];
      while (/\$\{([^}]+)\}/g.test(value)) {
        value = value.replace(/\$\{([^}]+)\}/g, (_: string, refKey: string) => {
          return tempEnv[refKey] !== undefined ? tempEnv[refKey] : `\${${refKey}}`;
        });
      }

      //设置环境变量
      // process.env[key] = value;
      configMerged[key] = value;
    });

    console.log('Environment variables loaded successfully.');
  } catch (error) {
    console.error('Failed to load environment variables:', error);
  }
}

let myserverConfigFile = "myserver.config.{env}toml";
let realMyserverConfigFile = "myserver.config.toml";
let envConfigFile = ".env";
if (process.env.NODE_ENV == "production") {
  if (existsSync(myserverConfigFile.replace("{env}", "production."))) {
    realMyserverConfigFile = myserverConfigFile.replace("{env}", "production.");
  }
  if (existsSync(`${envConfigFile}.production`)) {
    envConfigFile = `${envConfigFile}.production`;
  }
} else if (process.env.NODE_ENV == "development") {
  if (existsSync(myserverConfigFile.replace("{env}", "development."))) {
    realMyserverConfigFile = myserverConfigFile.replace("{env}", "development.");
  }
  if (existsSync(`${envConfigFile}.development`)) {
    envConfigFile = `${envConfigFile}.development`;
  }
} else if (process.env.NODE_ENV == "test") {
  if (existsSync(myserverConfigFile.replace("{env}", "test."))) {
    realMyserverConfigFile = myserverConfigFile.replace("{env}", "test.");
  }
  if (existsSync(`${envConfigFile}.test`)) {
    envConfigFile = `${envConfigFile}.test`;
  }
}

if (existsSync(envConfigFile)) {
  parseEnv(envConfigFile)
}
if (existsSync(realMyserverConfigFile)) {
  const configRaw = readFileSync(realMyserverConfigFile, "utf8");
  const configToml = parseToml(configRaw);
  configMerged = {...configMerged, ...configToml}
}

function getConfig(path: string) : any {
  // 将路径按点分割成数组
  const keys = path.split('.');
  
  // 使用 reduce 方法遍历路径并获取最终值
  return keys.reduce((acc, key) => {
    if (acc && acc.hasOwnProperty(key)) {
      return acc[key];
    }
    return ""; // 如果路径不存在
  }, configMerged);
}

// // 事件系统
// class EventSystem {
//   private emitter: EventEmitter;

//   constructor() {
//     this.emitter = new EventEmitter();
//   }

//   on(event: string, listener: (...args: any[]) => void) {
//     this.emitter.on(event, listener);
//     return this;
//   }

//   off(event: string, listener: (...args: any[]) => void) {
//     this.emitter.off(event, listener);
//     return this;
//   }

//   emit(event: string, ...args: any[]) {
//     this.emitter.emit(event, ...args);
//     return this;
//   }
// }


// // Hook 系统
// class HookSystem {
//   private hooks: Record<string, ((...args: any[]) => any)[]> = {};

//   register(hookName: string, callback: (...args: any[]) => any) {
//     if (!this.hooks[hookName]) {
//       this.hooks[hookName] = [];
//     }
//     this.hooks[hookName].push(callback);
//     return this;
//   }

//   async run(hookName: string, ...args: any[]) {
//     const callbacks = this.hooks[hookName] || [];
//     let result = args;

//     for (const callback of callbacks) {
//       result = await callback(...result);
//     }

//     return result;
//   }
// }


// // 消息队列
// class MessageQueue {
//   private queue: any[] = [];
//   private processing = false;

//   async enqueue(task: () => Promise<void>) {
//     this.queue.push(task);
//     await this.processQueue();
//   }

//   private async processQueue() {
//     if (this.processing) return;

//     this.processing = true;
//     while (this.queue.length > 0) {
//       const task = this.queue.shift()!;
//       try {
//         await task();
//       } catch (error) {
//         console.error('MessageQueue task error:', error);
//       }
//     }
//     this.processing = false;
//   }
// }




const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);


// 全局对象扩展
declare global {
  var serverContext: {
    getConfig: (path: string) => any,
    eventSystem: EventSystem;
    hookSystem: HookSystem;
    messageQueue: MessageQueue;
    // 可以添加更多全局属性
  };
}

// 自定义中间件类型
type Middleware = (
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
) => void | Promise<void>;


// 实例化扩展系统
const eventSystem = new EventSystem();
const hookSystem = new HookSystem();
const messageQueue = new MessageQueue();

// 设置全局上下文
global.serverContext = {
  getConfig,
  eventSystem,
  hookSystem,
  messageQueue,
};

// 创建 Next.js 应用
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// 自定义中间件数组
const middlewares: Middleware[] = [];

// 注册中间件
function use(middleware: Middleware) {
  middlewares.push(middleware);
}

// 执行中间件链
async function executeMiddlewares(req: NextApiRequest, res: NextApiResponse) {
  let index = 0;

  const nextMiddleware = async () => {
    if (index < middlewares.length) {
      await middlewares[index++](req, res, nextMiddleware);
    }
  };

  await nextMiddleware();
}

// 自定义路由处理器
type CustomRouteHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  params: Record<string, string>
) => void | Promise<void>;

const customRoutes: {
  [method: string]: {
    [path: string]: CustomRouteHandler;
  };
} = {
  GET: {},
  POST: {},
  PUT: {},
  DELETE: {},
};

// 注册自定义路由
function route(method: string, path: string, handler: CustomRouteHandler) {
  if (!customRoutes[method]) {
    customRoutes[method] = {};
  }
  customRoutes[method][path] = handler;
}

// 解析路由参数
function parseRouteParams(path: string, routeTemplate: string) {
  const pathSegments = path.split('/').filter(Boolean);
  const templateSegments = routeTemplate.split('/').filter(Boolean);

  if (pathSegments.length !== templateSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < templateSegments.length; i++) {
    const templateSegment = templateSegments[i];
    if (templateSegment.startsWith(':')) {
      const paramName = templateSegment.slice(1);
      params[paramName] = pathSegments[i];
    } else if (templateSegment !== pathSegments[i]) {
      return null;
    }
  }

  return params;
}


// 初始化服务器
async function startServer() {
  try {
    // 触发启动前的钩子
    await hookSystem.run('beforeServerStart', { app, handle });

    // 准备 Next.js 应用
    await app.prepare();

    // 创建 HTTP 服务器
    const server = createServer(async (req, res) => {
      try {
        // 确保请求和响应对象类型正确
        const nextReq = req as NextApiRequest;
        const nextRes = res as NextApiResponse;

        // 触发请求开始钩子
        await hookSystem.run('onRequestStart', { req: nextReq, res: nextRes });

        // 解析 URL
        const parsedUrl = parse(req.url!, true);
        const { pathname } = parsedUrl;

        // 执行自定义中间件
        await executeMiddlewares(nextReq, nextRes);

        // 检查自定义路由
        const method = req.method || 'GET';
        const routeHandlers = customRoutes[method] || {};
        let routeMatched = false;

        for (const routeTemplate in routeHandlers) {
          const params = parseRouteParams(pathname!, routeTemplate);
          if (params) {
            routeMatched = true;
            console.log(pathname, routeTemplate);
            await routeHandlers[routeTemplate](nextReq, nextRes, params);
            break;
          }
        }

        // 如果没有匹配的自定义路由，使用默认的 Next.js 处理
        if (!routeMatched && !nextRes.headersSent) {
          await handle(nextReq, nextRes, parsedUrl);
        }

        // 触发请求结束钩子
        await hookSystem.run('onRequestEnd', { req: nextReq, res: nextRes });
      } catch (err) {
        console.error('Error handling request:', err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });

    // // 集成 Socket.IO 用于实时通信
    // const io = new Server(server, {
    //   cors: {
    //     origin: '*',
    //   },
    // });

    // 触发服务器创建后的钩子
    await hookSystem.run('afterServerCreated', { server });

    // // 监听 Socket.IO 连接
    // io.on('connection', (socket) => {
    //   console.log('A user connected');
    //   eventSystem.emit('socketConnection', socket);

    //   socket.on('disconnect', () => {
    //     console.log('User disconnected');
    //     eventSystem.emit('socketDisconnection', socket);
    //   });
    // });

    // 启动服务器
    server.listen(port, hostname, () => {
      console.log(`> Server listening at http://${hostname}:${port}`);
      eventSystem.emit('serverStarted', { port, hostname });
      hookSystem.run('afterServerStarted', { port, hostname });
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      eventSystem.emit('uncaughtException', err);
      hookSystem.run('onUncaughtException', err);
    });

    // 处理未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      eventSystem.emit('unhandledRejection', reason, promise);
      hookSystem.run('onUnhandledRejection', reason, promise);
    });

    // 触发启动完成的钩子
    await hookSystem.run('serverReady', { app, server });
  } catch (err) {
    console.error('Failed to start server:', err);
    eventSystem.emit('serverError', err);
    process.exit(1);
  }
}

// 示例：注册自定义路由
route('GET', '/api/custom', async (req, res) => {
  // console.log(res);
  res.end('Custom API route ' + Date.now());
  // res.status(200).json({ message: 'Custom API route', timestamp: Date.now() });
});

route('GET', '/api/user/:id', async (req, res) => {
  res.end(`User`);
});

// 示例：注册中间件
use(async (req, res, next) => {
  console.log(`Incoming ${req.method} request to ${req.url}`);
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`Request to ${req.url} completed in ${duration}ms with status ${res.statusCode}`);
  });

  await next();
});

// 示例：使用事件系统
eventSystem.on('serverStarted', ({ port }) => {
  console.log(`Event: Server started on port ${port}`);
});

// 示例：使用 Hook 系统
hookSystem.register('beforeServerStart', async (context) => {
  console.log('Hook: Before server start');
  return context;
});

hookSystem.register('afterServerStarted', async ({ port }) => {
  console.log(`Hook: Server started on port ${port}`);
  // 可以在这里执行初始化任务
  return { port };
});

// 示例：使用消息队列
messageQueue.enqueue(async () => {
  console.log('MessageQueue: Processing initial task');
  // 模拟异步任务
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('MessageQueue: Initial task completed');
});

// 启动服务器
startServer();


