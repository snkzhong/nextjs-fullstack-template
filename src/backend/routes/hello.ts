import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import type { FastifySchema } from 'fastify';
import { registerFastifyRoute } from '~/backend/kernel';
import { prisma } from '~/backend/context';
import { sql, curd } from '~/backend/share/database';


interface Query {
  name: string;
}

registerFastifyRoute({
  method: 'GET',
  url: '/fastify/hello',
  schema: {
    description: "fastify hello route define!",
    summary: "A simple hello route", // 可选
    tags: ['Hello'], // 可选，用于分组
    querystring: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
  },
  handler: async (request: FastifyRequest<{Querystring: Query}>, reply: FastifyReply) => {
    // let rs = await prisma.test.findMany();
    // console.log("prisma rs:", rs);
    // const rs = await Sql.i(db).fetchRow(`SELECT * FROM blog WHERE title=?`, 'world');
    // const rs = await db.raw(`SELECT * FROM blog`, []);
    // console.log("sql rs:", rs);
    const rs = await curd.table("blog").findOne();
    console.log("curd rs:", rs);
    reply.send(`${request.query.name}, hello fastify!`);
  },
});
