import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '~/server/trpc';
import { appRouter } from '~/server/trpc_routers';
import { NextRequest, NextResponse } from 'next/server';

// 配置 Edge Runtime
// export const config = {
//   runtime: 'edge',
// };

// 处理所有 HTTP 方法
export async function POST(req: NextRequest) {
  return handleTRPCRequest(req);
}

export async function GET(req: NextRequest) {
  return handleTRPCRequest(req);
}

// 统一处理 tRPC 请求
async function handleTRPCRequest(req: NextRequest) {
  try {
    // 创建 tRPC 上下文
    const ctx = await createTRPCContext({ req });
    
    // 使用 fetch 适配器处理请求（兼容 Edge Runtime）
    const trpcRes = await fetchRequestHandler({
      endpoint: '/api/trpc',
      req: req as Request, // 类型断言为标准 Request
      router: appRouter,
      createContext: () => ctx,
      onError: ({ error }) => {
        console.error(`tRPC 请求错误:`, error);
      },
    });
    
    // 将标准 Response 转换为 NextResponse
    return new NextResponse(trpcRes.body, {
      status: trpcRes.status,
      headers: trpcRes.headers,
    });
  } catch (error) {
    console.error('tRPC 处理错误:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
