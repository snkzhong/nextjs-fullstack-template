import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import type { FastifySchema } from 'fastify';
import { registerFastifyRoute } from '~/backend/kernel';
import { prisma } from '~/backend/context';
import redis from '~/backend/share/cache';
import { prismaInst, prismaSql, sql, curd } from '~/backend/share/database';

interface Query {
  name: string;
}

registerFastifyRoute({
  method: 'GET',
  url: '/fastify/cache',
  schema: {
    description: "fastify hello route define!",
    summary: "A simple hello route", // 可选
    tags: ['Hello'], // 可选，用于分组
  },
  handler: async (request: FastifyRequest<{Querystring: Query}>, reply: FastifyReply) => {
    // const redis = new RedisClient({
    //   // host: "127.0.0.1",
    //   // port: 6379,
    //   password: "redis",
    //   prefix: 'app',
    //   bloomFilter: { enabled: true },
    //   performance: { logSlowQueries: true }
    // });

    // await redis.call('SET', 'fastify', 'hello fastify, cache');
    // await redis.call('GET', 'fastify');
    
    // await redis.set('fastify', {"name":"zhong qin"});
    // const rs = await redis.get('fastify');

    let prismaRs = await prismaInst.test.findMany();
    console.log("prisma rs:", prismaRs);

    let sqlRs = await sql.fetchRow(`SELECT * FROM "Test"`);
    console.log("sql rs:", sqlRs);

    let curdRs = await curd.table("Test").findOne();
    console.log("curd rs:", curdRs);

    let prismaSqlRs = await prismaSql.fetchRows`SELECT * FROM "Test"`;
    console.log("prismaSql rs:", prismaSqlRs);

    // let _name = "zhongqin";
    // let _email = "snkzhong@163.com";
    // let prismaSqlInsertRs = await prismaSql.execute`INSERT INTO "Test" (name, email) VALUES(${_name}, ${_email})`;
    // console.log("prismaSql insert rs:", prismaSqlInsertRs);

    // let prismaSqlDelRs = await prismaSql.delete`DELETE FROM "Test"`;
    // console.log("prismaSql delete rs:", prismaSqlDelRs);

    let prismaSqlUpdateRs = await prismaSql.update`UPDATE "Test" SET age=43`;
    console.log("prismaSql update rs:", prismaSqlUpdateRs);

    let batchRs = await redis.batch([
      ['SET', 'a', 1],
      ['INCR', 'a'],
      ['GET', 'a']
    ]);
    console.log("batch rs:", batchRs);

    let deleteRs = await redis.deleteByPattern("test*");
    console.log("delete rs:", deleteRs);

    const exists = await redis.exists("fastify");
    console.log("exists:", exists);

    const pipelineRs = await redis.pipeline(async pipe => {
      return pipe
      .set('pipe', "hello")
      .get('pipe')
      .incr('pipe_counter')
      .exec();
    });
    console.log("pipeline rs:", pipelineRs);

    // const poolRs = await redis.connectPool("poolTest", 100);
    // console.log("pool rs:", poolRs);
    await redis.releasePool("poolTest");

    const rs = await redis.transaction(async pipe => {
      return pipe
        .get('balance')
        .get('debt')
        .exec();
    });

    reply.send(rs);
  },
});
