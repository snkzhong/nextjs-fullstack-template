import { publicProcedure, router } from "~/server/trpc";
// import { readdirSync, existsSync } from 'fs';
import { promises as fs } from 'fs';

export default {
  test: publicProcedure
    .query(async () => {
      return "test!";
  }),
  post: publicProcedure.mutation(async () => {
    await fs.writeFile("trpc.log", "hello world!");
    return {"hello":"world"}
  }),
};