import { promises as fs } from 'fs';
import path from 'path';

console.log("postbuild success!")

const projectDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../../");
const distDir = path.join(projectDir, ".next/");
const source = path.join(projectDir, "dist/myserver.js");
const destination = path.join(distDir, "standalone/myserver.js");

setTimeout(()=>{
	copyServerFile(source, destination);
}, 3000);


async function copyServerFile(source, destination) {
	await fs.copyFile(source, destination);
	console.log("copyServerFile success: ", source, destination)
}