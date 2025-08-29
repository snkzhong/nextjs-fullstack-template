import { Prisma, PrismaClient } from '@prisma/client';

export class PrismaSql {
  private prismaClient: PrismaClient;
  private placeholderRegex = /(?:\$[0-9]+)|\?/g;

  public constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  }

  public async fetchRow<T = any>(sql: TemplateStringsArray, ...values: any[]): Promise<T> {
    try {
      const result = await this.fetchRows(sql, ...values);
      if (result && result.length > 0) {
        return result[0];
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error executing SQL:', error);
      throw error;
    }
  }
  
  public async fetchRows<T = any>(sql: TemplateStringsArray, ...values: any[]): Promise<T[]> {
    console.log("database type:", this.getDatabaseType());
    try {
      const result = await this.prismaClient.$queryRaw<T>(sql, ...values);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('Error executing SQL:', error);
      throw error;
    }
  }

  public async update(sql: TemplateStringsArray, ...values: any[]): Promise<number> {
    try {
      return await this.execute(sql, ...values);
    } catch (error) {
      console.error('Error executing SQL:', error);
      throw error;
    }
  }

  public async delete(sql: TemplateStringsArray, ...values: any[]): Promise<number> {
    try {
      return await this.execute(sql, ...values);
    } catch (error) {
      console.error('Error executing SQL:', error);
      throw error;
    }
  }

  public async execute(sql: TemplateStringsArray, ...values: any[]): Promise<number> {
    try {
      return await this.prismaClient.$executeRaw(sql, ...values);
    } catch (error) {
      console.error('Error executing SQL:', error);
      throw error;
    }
  }

  private getDatabaseType() {
    return process.env.DATABASE_URL?.split(':')[0].replace('file+', '') || 'unknown';
  }

  /**
   * 解析 SQL 和绑定参数 - 修正版本
   */
  private parseSQL(sql: string, bindings: any[]): Prisma.Sql {
    // 如果没有绑定参数，直接返回 SQL 字符串
    if (bindings.length === 0) {
      return Prisma.sql`${sql}`;
    }

    // 检查占位符
    const placeholders = sql.match(this.placeholderRegex);
    
    if (!placeholders) {
      // 没有占位符但有绑定参数 - 可能是错误
      if (bindings.length > 0) {
        throw new Error('Bindings provided but no placeholders found in SQL');
      }
      return Prisma.sql`${sql}`;
    }

    // 验证参数数量
    if (placeholders.length !== bindings.length) {
      throw new Error(
        `Parameter count mismatch: SQL has ${placeholders.length} placeholders, ` +
        `but ${bindings.length} parameters provided`
      );
    }

    // 处理 ? 占位符
    if (placeholders[0] === '?') {
      return this.handleQuestionPlaceholders(sql, bindings);
    }
    
    // 处理 $1, $2 占位符
    if (placeholders[0]?.startsWith('$')) {
      return this.handleDollarPlaceholders(sql, bindings);
    }

    // 默认情况
    return Prisma.sql`${sql}`;
  }

  private handleQuestionPlaceholders(sql: string, bindings: any[]): Prisma.Sql {
    const parts = sql.split('?');
    let query = Prisma.sql([parts[0]]);
    
    for (let i = 0; i < bindings.length; i++) {
      query = Prisma.sql([query.strings.join(''), parts[i + 1] || ''], ...query.values, bindings[i]);
    }
    
    return query;
  }

  private handleDollarPlaceholders(sql: string, bindings: any[]): Prisma.Sql {
    let remainingSql = sql;
    const strings: string[] = [];
    const values: Prisma.Value[] = [];
    
    // 按顺序处理 $1, $2, $3...
    for (let i = 0; i < bindings.length; i++) {
      const placeholder = `$${i + 1}`;
      const index = remainingSql.indexOf(placeholder);
      
      if (index === -1) {
        throw new Error(`Placeholder ${placeholder} not found in SQL`);
      }
      
      // 添加前面的部分
      strings.push(remainingSql.substring(0, index));
      values.push(bindings[i]);
      
      // 更新剩余 SQL
      remainingSql = remainingSql.substring(index + placeholder.length);
    }
    
    // 添加最后的部分
    strings.push(remainingSql);
    
    return Prisma.sql(strings, ...values);
  }
}