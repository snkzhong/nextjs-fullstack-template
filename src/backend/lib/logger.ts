import pino, { Logger } from 'pino';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

// 日志配置接口
interface LoggerConfig {
  logDir?: string;
  baseFileName?: string;
  logLevel?: string;
}

class DailyRotateLogger {
  private logger: Logger;
  private logDir: string;
  private baseFileName: string;
  private currentLogPath: string;
  private logStream: fs.WriteStream;

  constructor(config: LoggerConfig = {}) {
    this.logDir = config.logDir || path.join(process.cwd(), 'logs');
    this.baseFileName = config.baseFileName || 'app';
    const today = this.getFormattedDate();
    
    // 确保日志目录存在
    this.ensureLogDirectoryExists();
    
    // 初始化当前日志文件路径
    this.currentLogPath = this.getLogPath(today);
    
    // 创建日志流
    // const logStream = pino.destination({
    //   dest: this.currentLogPath,
    //   sync: false
    // });

    this.logStream = this.createLogStream(this.currentLogPath);
    
    // 创建 Pino 日志实例
    this.logger = pino(
      {
        level: config.logLevel || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label })
        }
      },
      this.logStream
    );
    
    // 设置每日轮换检查
    this.setupDailyRotation();
  }

  // 获取格式化日期 (YYYY-MM-DD)
  private getFormattedDate(date: Date = new Date()): string {
    return dayjs(date).format('YYYY-MM-DD');
  }

  // 生成日志文件路径
  private getLogPath(dateString: string): string {
    return path.join(this.logDir, `${this.baseFileName}-${dateString}.log`);
  }

  // 确保日志目录存在
  private ensureLogDirectoryExists(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private createLogStream(logPath: string): fs.WriteStream {
    return fs.createWriteStream(logPath, { flags: 'a' });
  }

  // 设置每日轮换逻辑
  private setupDailyRotation(): void {
    // 计算到明天凌晨的毫秒数
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const firstDelay = tomorrow.getTime() - now.getTime();
    
    // 首次在明天凌晨执行轮换
    setTimeout(() => {
      this.rotateLogFile();
      // 之后每天固定时间执行
      setInterval(() => this.rotateLogFile(), 24 * 60 * 60 * 1000);
    }, firstDelay);
  }

  // 执行日志文件轮换
  private async rotateLogFile(): Promise<void> {
    const today = this.getFormattedDate();
    const newLogPath = this.getLogPath(today);
    
    if (newLogPath !== this.currentLogPath) {
      try {
        // 销毁旧流
        this.logStream.end();
        
        // 创建新流
        this.logStream = this.createLogStream(newLogPath);
        
        // 更新 logger 的输出目标
        (this.logger as any).bindings().stream = this.logStream;
        
        this.currentLogPath = newLogPath;
        this.logger.info(`日志文件已轮换到: ${newLogPath}`);
      } catch (error) {
        console.error(`日志文件轮换失败: ${(error as Error).message}`);
      }
    }
  }

  // 暴露日志方法
  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }
}

// 创建并导出单例日志实例
const logger = new DailyRotateLogger({
  logDir: path.join(process.cwd(), 'logs'),
  baseFileName: 'app',
  logLevel: 'info'
});

export default logger;