#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('command')
  .description('Command line scripting tool')
  .version('0.0.1');

// 获取 commands 目录路径
const commandsPath = path.join(__dirname, 'commands');

// 读取 commands 目录下的所有文件和子目录
const commandFiles = fs.readdirSync(commandsPath);
// console.log("commandFiles:", commandFiles);

// 遍历 commands 目录下的所有文件和子目录
for (let i=0; i<commandFiles.length; i++) 
{
  const fileOrDir = commandFiles[i];
  const fullPath = path.join(commandsPath, fileOrDir);
  const stat = fs.statSync(fullPath);

  if (stat.isFile() && (fileOrDir.endsWith('.ts') || fileOrDir.endsWith('.js')) ) {
    const commandName = path.basename(fileOrDir, '.ts');
    const commandModule = await import(`./commands/${commandName}`);
    // console.log(commandModule.default);
    // console.log("fileOrDir:", fileOrDir, `./commands/${commandName}`, commandModule);
    try {
      const {name, description, argumentList, optionList, action} = commandModule.default;
      // 处理根命令
      let cmd = program.command(name)
      .description(description);

      // console.log(cmd, argumentList, optionList);
      if (argumentList) {
        argumentList.forEach((_argument)=>{
          cmd.argument(..._argument);
        });
      }
      
      if (optionList) {
        optionList.forEach((_option)=>{
          cmd.option(..._option);
        });
      }

      cmd.action(action);
    } catch(err) {
      console.error(`Failed to load command ${fullPath}:`, err);
    }

  }

}

// 处理未知命令
program.on('command:*', ([cmd]) => {
  console.error(`Unknown command '${cmd}'`);
  program.outputHelp();
  process.exit(1);
});

// 显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse(process.argv);