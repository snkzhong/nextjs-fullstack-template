import nodemon from "nodemon";
import { execSync } from "child_process";

nodemon({
    ext: 'js ts',   // 监控的文件扩展名
    watch: ["myserver.ts", "src/**"],    // 监控的目录
    exec: 'tsx myserver.ts',
    ignore: ["node_modules", "dist"],
    env: {
        "NODE_ENV": "development"
    },
    verbose: true, // 开启详细日志
});

nodemon
.on('start', () => {
    console.log('App has started');
})
.on('change', (files) => {
  // files 是变更文件的路径数组（可能多个文件同时变更）
  console.log('检测到文件变更：', files);
})
.on('quit', () => {
    console.log('App has quit');
    process.exit();
})
.on('restart', (files) => {
    console.log('App restarted due to: ', files);
    const targetDir = ["backend/events", "backend/hooks", "backend/middlewares", "backend/routes"];
    if (containsAny(files, targetDir)) {
        console.log("autoloadindex start!");
        execSync("tsx ./scripts/autoloadindex.ts");
    }
});

function containsAny(sourceList, targetList) {
  return targetList.some(target => sourceList.some(source => source.includes(target)));
}