import { addEvent } from "~/backend/kernel";

addEvent("serverStarted", ({ port }) => {
  console.log(`Event: Server started on port ${port}`);
});

addEvent("requestArrive", ({ nextReq, nextRes, parsedUrl }) => {
  console.log("requestArrive", parsedUrl);
});