import { FastifyRequest, FastifyReply } from 'fastify';
import { fastifyUse } from '~/backend/kernel';

fastifyUse(async (req: FastifyRequest, res: FastifyReply, next) => {
  console.log(`Incoming ${req.method} request to ${req.url}`);
  const start = Date.now();

  await next();
});