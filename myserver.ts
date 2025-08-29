import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";

import { EventSystem } from "~/backend/lib/eventsystem";
import { HookSystem } from "~/backend/lib/hooksystem";
import { MessageQueue } from "~/backend/lib/messagequeue";

import { getConfig, executeMiddlewares, performCustomRoutes, performFastifyRoutes, executeFastifyMiddlewares, applyEvents, applyHooks } from "~/backend/kernel";
import logger from "~/backend/lib/logger";

import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'

import dotenv from 'dotenv';
dotenv.config();


const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// 全局对象扩展
declare global {
  var serverContext: {
    getConfig: (path: string) => any;
    eventSystem: EventSystem;
    hookSystem: HookSystem;
    messageQueue: MessageQueue;
    // 可以添加更多全局属性
  };
}


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
const nextApp = next({ dev, hostname, port });
const nextHandle = nextApp.getRequestHandler();


// 初始化服务器
async function startHttpServer() {
  try {
    // 触发启动前的钩子
    await hookSystem.run("beforeServerStart", { nextApp, nextHandle });

    // 准备 Next.js 应用
    await nextApp.prepare();

    // 创建 HTTP 服务器
    const server = createServer(async (req, res) => {
      try {
        // 确保请求和响应对象类型正确
        const nextReq = req as NextApiRequest;
        const nextRes = res as NextApiResponse;

        // 触发请求开始钩子
        await hookSystem.run("onRequestStart", { req: nextReq, res: nextRes });

        // 解析 URL
        const parsedUrl = parse(req.url!, true);
        const { pathname } = parsedUrl;

        // 执行自定义中间件
        await executeMiddlewares(nextReq, nextRes);

        // 执行自定义路由
        const customRouteMatched = await performCustomRoutes(nextReq, nextRes, pathname);

        // 如果没有匹配的自定义路由，使用默认的 Next.js 处理
        if (!customRouteMatched && !nextRes.headersSent) {
          await nextHandle(nextReq, nextRes, parsedUrl);
          // eventSystem.emit("requestArrive", { nextReq, nextRes, parsedUrl });
        }

        // 触发请求结束钩子
        await hookSystem.run("onRequestEnd", { req: nextReq, res: nextRes });
      } catch (err) {
        if (process.env.NODE_ENV != "production") {
          console.error("Error handling request:", err);
        } else {
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      }
    });

    // 触发服务器创建后的钩子
    await hookSystem.run("afterServerCreated", { server });

    // 启动服务器
    server.listen(port, hostname, () => {
      console.log(`> Server listening at http://${hostname}:${port}`);
      eventSystem.emit("serverStarted", { port, hostname });
      hookSystem.run("afterServerStarted", { port, hostname });
    });

    // 触发启动完成的钩子
    await hookSystem.run("serverReady", { nextApp, nextHandle });
  } catch (err) {
    console.error("Failed to start server:", err);
    eventSystem.emit("serverError", err);
    process.exit(1);
  }
}

async function startFastifyServer() {

  // import hooks
  await import('~/backend/hooks');
  await applyHooks(hookSystem);

  // import events
  await import('~/backend/events');
  await applyEvents(eventSystem);

  await hookSystem.run("server.beforeStart", { nextApp, nextHandle });

  await nextApp.prepare();

  await hookSystem.run("server.nextPrepared", { nextApp, nextHandle });

  const server = Fastify({
    logger: true,
    ignoreTrailingSlash: true,
    caseSensitive: false,
    bodyLimit: 64*1024*1024, //64Mb
    disableRequestLogging: false,

  });

  if (process.env.NODE_ENV == "development") {

    // 1. 注册 Swagger 插件 (用于生成 OpenAPI 规范)
    await server.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'My API',
          description: 'A sample API built with Fastify and Swagger',
          version: '1.0.0',
        },
        servers: [
          { url: 'http://localhost:3000', description: 'Development server' },
        ],
        // 可选：添加全局安全定义 (如 JWT)
        // components: {
        //   securitySchemes: {
        //     bearerAuth: {
        //       type: 'http',
        //       scheme: 'bearer',
        //       bearerFormat: 'JWT',
        //     }
        //   }
        // }
      },
      // 或者使用 legacy 'swagger' 属性 (OpenAPI 2.0), 但推荐用 'openapi' (OpenAPI 3.x)
      // swagger: {
      //   info: { ... }
      // }
    });

    // 2. 注册 Swagger UI 插件 (用于提供可视化界面)
    await server.register(fastifySwaggerUi, {
      routePrefix: '/docs', // 访问文档的路径，如 http://localhost:3000/docs
      uiConfig: {
        docExpansion: 'list', // 'list' | 'full' | 'none'
        deepLinking: true,
      },
      // 可选：自定义 CSS 或 JS
      // uiHooks: {
      //   onRequest: function (request, reply, next) { next() },
      //   preHandler: function (request, reply, next) { next() }
      // },
      staticCSP: true,
      transformStaticCSP: (header) => header,
      // transformSpecification: (swaggerObject) => { return swaggerObject },
      // transformSpecificationClone: true,
    });

  }


  await hookSystem.run("server.fastifyInstanced", { server });

  server.addHook('onReady', async () => {
    await hookSystem.run("server.onReady", { server });
  });

  server.addHook('onListen', async () => {
    await hookSystem.run("server.onListen", { server });
  });

  server.addHook('preClose', async () => {
  });

  server.addHook('onClose', async () => {
  });

  server.addHook('onRoute', (routeOptions) => {
    //Some code
    // routeOptions.method
    // routeOptions.schema
    // routeOptions.url // the complete URL of the route, it will include the prefix if any
    // routeOptions.path // `url` alias
    // routeOptions.routePath // the URL of the route without the prefix
    // routeOptions.bodyLimit
    // routeOptions.logLevel
    // routeOptions.logSerializers
    // routeOptions.prefix
  });

  server.addHook("onRegister", async (instance, opts) => {

  });


  // import routes
  await import('~/backend/routes');

  // register routes
  await performFastifyRoutes(server);


  // import middlewares
  await import('~/backend/middlewares');


  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    await hookSystem.run("app.onRequest", { server, request, reply });
    // execute middlewares
    await executeFastifyMiddlewares(request, reply);
  });

  server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    // await hookSystem.run("app.onSend", { server, request, reply });
    const err = null;
    // const newPayload = payload.replace('some-text', 'some-new-text');
    return payload;
  });

  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    await hookSystem.run("app.onResponse", { server, request, reply });
  });

  server.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error) => {
  });

  server.addHook('onTimeout', async (request: FastifyRequest, reply: FastifyReply) => {
  });


  // Non fastify routing is handled by NextJS
  server.setNotFoundHandler((request, reply) => {
    return nextHandle(request.raw, reply.raw)
  });

  // start server
  server.listen({ port, host: hostname }, (err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    console.log(`> Ready on http://${hostname}:${port}`)
  });

}


logger.info("server starting!");

// 启动服务器
switch (getConfig("serverType")) {
  case "http":
    await startHttpServer();
    break;
  case "fastify":
    await startFastifyServer();
    break;
  default:
    await startFastifyServer();
}

// 处理未捕获的异常
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  eventSystem.emit("uncaughtException", err);
  hookSystem.run("onUncaughtException", err);
});

// 处理未处理的 Promise 拒绝
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  eventSystem.emit("unhandledRejection", reason, promise);
  hookSystem.run("onUnhandledRejection", reason, promise);
});

console.log("server running!");