import { createCallerFactory, publicProcedure, router } from "~/server/trpc";
// import { testRouter } from "~/server/routers/test";
import { readdirSync, existsSync } from "fs"
import path from "path";

const routerPath = "routes";

const routerRoot = path.join(path.dirname(new URL(import.meta.url).pathname), routerPath);
if (!existsSync(routerRoot)) {
    // logger.error(`router directory not found: ${routerRoot}`)
    process.exit(1)
}
// auto load routers
const autoLoadRouters = await readdirSync(routerRoot)
.filter(dir => dir.endsWith('.ts') || dir.endsWith('.js') )
.reduce(async (acc, routerFile) => {
  const routerName = path.basename(routerFile, path.extname(routerFile));
  // const routerModuleDir = `~/server/${routerPath}/${routerName}`;
  // console.log("routerModuleDir:", routerModuleDir);
  const routerModule = await import(`./${routerPath}/${routerName}`);
  try {
    const routerDefines = routerModule.default || routerModule.router;
    if (routerDefines) {
      return { ...acc, ...routerDefines };
    } else {
      console.warn(`Router ${routerName} not any export`);
    }
  } catch (e) {
    console.warn(`Router ${routerName} load failed:`, e);
    return acc;
  }
}, {});


const defineRouters = {
  ping: publicProcedure
    .query(async () => {
      return "pang!";
  }),
}

export const appRouter = router({...autoLoadRouters, ...defineRouters})

// export const appRouter = router({
//   healthcheck: publicProcedure.query(() => 'yay!'),

//   test: testRouter,
// });

export const createCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;
