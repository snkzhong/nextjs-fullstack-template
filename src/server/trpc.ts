import { initTRPC } from '@trpc/server';
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { type NextRequest } from 'next/server';

interface CreateContextOptions {
  // session: Session | null
}

export async function createContextInner(_opts: CreateContextOptions) {
  return {};
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;

// /**
//  * Creates context for an incoming request
//  * @see https://trpc.io/docs/v11/context
//  */
// export async function createContext(
//   opts: CreateNextContextOptions,
// ): Promise<Context> {
//   // for API-response caching see https://trpc.io/docs/v11/caching

//   return await createContextInner({});
// }

// 类型守卫
function isAppRouterRequest(opts: any): opts is { req: NextRequest } {
  return 'req' in opts && typeof opts.req.json === 'function';
}

export const createTRPCContext = (opts: CreateNextContextOptions | { req: NextRequest }) => {
  let req: NextRequest | CreateNextContextOptions['req'];
  
  if (isAppRouterRequest(opts)) {
    // App Router 请求对象
    req = opts.req;
  } else {
    // 传统 API 路由请求对象
    req = opts.req;
  }
  
  // 提取常用属性（根据需要调整）
  const headers = req.headers instanceof Headers 
    ? Object.fromEntries(req.headers.entries())
    : req.headers;
  
  return {
    req,
    headers,
    // 其他上下文数据...
  };
};


/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;

export const publicProcedure = t.procedure;

export const createCallerFactory = t.createCallerFactory;