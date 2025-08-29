import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RouteOptions } from "fastify";
import type { NextApiRequest, NextApiResponse } from "next";
import { FastifyRouteOptions, EventHandler, HookHandler } from "~/backend/types";
import { HookSystem } from "~/backend/lib/hooksystem";
import { EventSystem } from "~/backend/lib/eventsystem";
import path from "path";
import { readFileSync, existsSync } from "fs";
import { parse as parseToml, stringify } from "smol-toml";

export enum ServerType {
  HTTP = "HTTP",
  FASTIFY = "FASTIFY",
  EXPRESS = "EXPRESS",
}

// parser config
let configMerged: Record<string, any> = {};

function parseEnv(filePath: string) {
  try {
    // 读取 .env 文件内容
    const envFile = readFileSync(filePath, "utf8");

    // 按行分割文件内容
    const lines = envFile.split("\n");

    // 存储临时环境变量
    const tempEnv: Record<string, any> = {};

    // 解析每一行
    lines.forEach((line) => {
      // 去除前后空格和注释
      line = line.trim().replace(/#.*/, "");

      if (line === "") return;

      // 分割键值对
      const [key, value] = line.split("=");
      if (!key || !value) return;

      // 存储到临时对象
      tempEnv[key.trim()] = value.trim();
    });

    // 处理变量引用
    Object.keys(tempEnv).forEach((key) => {
      let value = tempEnv[key];
      while (/\$\{([^}]+)\}/g.test(value)) {
        value = value.replace(/\$\{([^}]+)\}/g, (_: string, refKey: string) => {
          return tempEnv[refKey] !== undefined
            ? tempEnv[refKey]
            : `\${${refKey}}`;
        });
      }

      //设置环境变量
      // process.env[key] = value;
      configMerged[key] = value;
    });

    console.log("Environment variables loaded successfully.");
  } catch (error) {
    console.error("Failed to load environment variables:", error);
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
    realMyserverConfigFile = myserverConfigFile.replace(
      "{env}",
      "development.",
    );
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
  parseEnv(envConfigFile);
}
if (existsSync(realMyserverConfigFile)) {
  const configRaw = readFileSync(realMyserverConfigFile, "utf8");
  const configToml = parseToml(configRaw);
  configMerged = { ...configMerged, ...configToml };
}

export function getConfig(path: string): any {
  // 将路径按点分割成数组
  const keys = path.split(".");

  // 使用 reduce 方法遍历路径并获取最终值
  return keys.reduce((acc, key) => {
    if (acc && acc.hasOwnProperty(key)) {
      return acc[key];
    }
    return ""; // 如果路径不存在
  }, configMerged);
}

// 自定义中间件类型
export type Middleware = (
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void,
) => void | Promise<void>;

// 自定义中间件数组
const middlewares: Middleware[] = [];

// 注册中间件
export function use(middleware: Middleware) {
  middlewares.push(middleware);
}

// 执行中间件链
export async function executeMiddlewares(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  let index = 0;

  const nextMiddleware = async () => {
    if (index < middlewares.length) {
      await middlewares[index++](req, res, nextMiddleware);
    }
  };

  await nextMiddleware();
}

// 自定义路由处理器
export type CustomRouteHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  params: Record<string, string>,
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
export function route(
  method: string,
  path: string,
  handler: CustomRouteHandler,
) {
  if (!customRoutes[method]) {
    customRoutes[method] = {};
  }
  customRoutes[method][path] = handler;
}

// 解析路由参数
function parseRouteParams(path: string, routeTemplate: string) {
  const pathSegments = path.split("/").filter(Boolean);
  const templateSegments = routeTemplate.split("/").filter(Boolean);

  if (pathSegments.length !== templateSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < templateSegments.length; i++) {
    const templateSegment = templateSegments[i];
    if (templateSegment.startsWith(":")) {
      const paramName = templateSegment.slice(1);
      params[paramName] = pathSegments[i];
    } else if (templateSegment !== pathSegments[i]) {
      return null;
    }
  }

  return params;
}

// 检查自定义路由
export async function performCustomRoutes(
  req: NextApiRequest,
  res: NextApiResponse,
  pathname: string,
): Promise<Boolean> {
  const method = req.method || "GET";
  const routeHandlers = customRoutes[method] || {};
  let routeMatched = false;

  for (const routeTemplate in routeHandlers) {
    const params = parseRouteParams(pathname!, routeTemplate);
    if (params) {
      routeMatched = true;
      await routeHandlers[routeTemplate](req, res, params);
      break;
    }
  }

  return routeMatched;
}

// fastify route config list
const fastifyRouteList: (FastifyRouteOptions)[] = [];

export async function registerFastifyRoute(opts: FastifyRouteOptions) {
  fastifyRouteList.push(opts);
}

export async function performFastifyRoutes(server: FastifyInstance) {
  for (const routeOptions of fastifyRouteList) {
    const opts = routeOptions as RouteOptions;
    server.route(opts);
  }
}


type fastifyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
) => void;

const fastifyMiddlewareList: (fastifyMiddleware)[] = [];

// register fastify middleware
export function fastifyUse(middleware: fastifyMiddleware) {
  fastifyMiddlewareList.push(middleware);
}

export async function executeFastifyMiddlewares(request: FastifyRequest, reply: FastifyReply) {
  for (const middleware of fastifyMiddlewareList) {
    await new Promise((resolve, reject) => {
      middleware(request, reply, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve(null);
        }
      });
    });
  }
}

const hookMap: Record<string, (HookHandler)[]> = {};
export function addHook(hookName: string, handler: HookHandler) {
  if (!hookMap[hookName]) {
    hookMap[hookName] = [];
  }
  hookMap[hookName].push(handler);
}

export function applyHooks(hookSystem: HookSystem) {
  for (const hookName in hookMap) {
    for (const handler of hookMap[hookName]) {
      hookSystem.register(hookName, handler);
    }
  }
}

const eventMap: Record<string, (EventHandler)[]> = {};
export function addEvent(eventName: string, handler: EventHandler) {
  if (!eventMap[eventName]) {
    eventMap[eventName] = [];
  }
  eventMap[eventName].push(handler);
}

export function applyEvents(eventSystem: EventSystem) {
  for (const eventName in eventMap) {
    for (const handler of eventMap[eventName]) {
      eventSystem.on(eventName, handler);
    }
  }
}