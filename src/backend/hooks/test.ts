import { addHook } from "~/backend/kernel";

// 示例：使用 Hook 系统
addHook("server.beforeStart", async (context) => {
  console.log("Hook: server.beforeStart");
  return context;
});

addHook("server.onReady", async ({ port }) => {
  console.log(`Hook: server.onReady ${port}`);
  // 可以在这里执行初始化任务
  return { port };
});


addHook("app.onResponse", async ({ server, request, reply }) => {
  console.log(`Hook: app.onResponse`);
});
