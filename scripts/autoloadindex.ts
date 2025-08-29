import fs from "fs/promises";
import path from "path";

/**
 * 读取指定目录下的所有 .js 和 .ts 文件（排除 index.js / index.ts）
 * @param pathname 目标目录路径
 */
async function readModuleFiles(pathname: string): Promise<string[]> {
  try {
    const files = await fs.readdir(pathname);
    const result: string[] = [];

    for (const file of files) {
      const fullPath = path.join(pathname, file);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        // 递归处理子目录（可选）
        const subFiles = await readModuleFiles(fullPath);
        result.push(...subFiles);
      } else {
        const ext = path.extname(file).toLowerCase();
        const baseName = path.basename(file, ext);

        // 排除 index.js / index.ts
        if ((ext === '.js' || ext === '.ts') && baseName !== 'index') {
          result.push(baseName); // 或者使用 file，根据需要决定是否返回完整路径
        }
      }
    }

    return result;
  } catch (error) {
    console.error(`读取目录出错: ${error.message}`);
    return [];
  }
}


async function appendModuleImport(filePath: string, importStr: string): Promise<void> {
  try {
  	const importCmd = `import "./${importStr}";`;

  	try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, "");
    }

    // 读取文件内容
    const data = await fs.readFile(filePath, 'utf-8');

    // 判断是否已包含目标 import 字符串
    if (!data.includes(importCmd)) {
      // 如果不包含，追加写入
      await fs.appendFile(filePath, `\n${importCmd}`);
      console.log(`✅ 已追加 ${importStr} 到文件: ${filePath}`);
    } else {
      console.log(`🔍 ${importStr} 已存在，无需操作: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 操作文件出错: ${error.message}`);
  }
}

const backendDirList = ["events", "hooks", "middlewares", "routes"];
for (const _dir of backendDirList) {
	const projectRoot = path.join(path.dirname(new URL(import.meta.url).pathname), "../");
	const backendDir = path.join(projectRoot, "src/backend");
	const backendSomeDir = path.join(backendDir, _dir);
	const backendSomeIndexFs = path.join(backendSomeDir, "index.ts");
	const backendSomeDefs = await readModuleFiles(backendSomeDir);
	await backendSomeDefs.forEach( async (f) => {
		await appendModuleImport(backendSomeIndexFs, f);
	});
}
