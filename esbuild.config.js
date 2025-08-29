import { build } from 'esbuild';
import * as path from 'path';

build({
  entryPoints: ['myserver.ts'],
  outfile: 'dist/myserver.js',
  bundle: true,
  minify: true, // 设置为 true 以压缩代码
  platform: 'node',
  target: 'node21', // 根据你的 Node.js 版本调整
  format: 'esm',
  external: [
    'next',
    'http',
    'url',
    'fs',
    'path',
    'events',
    'pino',
    'dayjs',
    'fastify',
    'prsima',
    '@prisma/client',
    '@fastify/swagger',
    '@fastify/swagger-ui',
    'knex',
  ],
  define: {
    'process.env.NODE_ENV': '"production"', // 定义环境变量
  },
  sourcemap: true, // 生成 source map 便于调试
}).catch(() => process.exit(1));