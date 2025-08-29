import {
  FastifyInstance,
  RouteGenericInterface,
  RawServerBase,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  FastifySchema,
  FastifyTypeProvider,
  ContextConfigDefault,
  FastifyContextConfig,
  FastifyRequestHandler,
  FastifyError,
  HookHandlerDoneFunction
} from 'fastify';


interface CustomFastifySchema {
  description?: string,
  summary?: string,
  tags?: (string)[],
  body?: unknown;
  querystring?: unknown;
  params?: unknown;
  headers?: unknown;
  response?: unknown;
}

export type FastifyRouteOptions<
  RawServer extends RawServerBase = RawServerBase,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
  TypeProvider extends FastifyTypeProvider = FastifyTypeProvider,
  ContextConfig = ContextConfigDefault
> = {
  // 必需参数
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'>;
  url: string;
  handler: FastifyRequestHandler<
    RawServer,
    RawRequest,
    RawReply,
    RouteGeneric,
    Logger,
    TypeProvider,
    ContextConfig
  >;
  
  // 可选参数
  schema?: CustomFastifySchema;
  config?: FastifyContextConfig;
  attachValidation?: boolean;
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  logSerializers?: { [key: string]: (value: any) => any };
  errorHandler?: (error: FastifyError, request: FastifyRequestHandler, reply: FastifyReply) => void;
  
  preParsing?: (
    request: FastifyRequestHandler, 
    payload: any, 
    done: (err: Error | null, payload: any) => void
  ) => void | Promise<void>;
  
  preValidation?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply, 
    done: HookHandlerDoneFunction
  ) => void | Promise<void>;
  
  preHandler?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply, 
    done: HookHandlerDoneFunction
  ) => void | Promise<void>;
  
  preSerialization?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply, 
    payload: any, 
    done: (err: Error | null, payload: any) => void
  ) => void | Promise<void>;
  
  onRequest?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply, 
    done: HookHandlerDoneFunction
  ) => void | Promise<void>;
  
  onResponse?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply
  ) => void | Promise<void>;
  
  onError?: (
    error: FastifyError, 
    request: FastifyRequestHandler, 
    reply: FastifyReply
  ) => void | Promise<void>;
  
  onSend?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply, 
    payload: any, 
    done: (err: Error | null, payload: any) => void
  ) => void | Promise<void>;
  
  onTimeout?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply
  ) => void | Promise<void>;
  
  prefixTrailingSlash?: 'slash' | 'no-slash' | 'both';
  bodyLimit?: number;
  disableRequestLogging?: boolean;
  exposeHeadRoute?: boolean;
  version?: string;
  websocket?: boolean;
  handlerIsAsync?: boolean;
  skipOverride?: boolean;
  params?: Record<string, any>;
  querystring?: Record<string, any>;
  body?: Record<string, any>;
  response?: Record<string, any>;
  headers?: Record<string, any>;
  constraints?: Record<string, any>;
  contentTypeParser?: Record<string, (
    req: FastifyRequestHandler, 
    payload: any, 
    done: (err: Error | null, body: any) => void
  ) => void>;
  schemaCompiler?: (schema: any, httpPart: string) => (data: any) => boolean;
  serializerCompiler?: (opts: { 
    schema: any; 
    method: string; 
    url: string; 
    httpStatus: string 
  }) => (data: any) => string;
  validatorCompiler?: (opts: { 
    schema: any; 
    method: string; 
    url: string; 
    httpPart: string 
  }) => (data: any) => any;
  onRoute?: (routeOptions: any) => void;
  beforeHandler?: (
    request: FastifyRequestHandler, 
    reply: FastifyReply, 
    done: HookHandlerDoneFunction
  ) => void | Promise<void>;
  deprecation?: string;
};