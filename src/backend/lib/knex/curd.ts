import type { Knex, BaseEntity, CreateInput, UpdateInput, FindCondition, PaginationOptions } from '~/backend/lib/Knex/types';

/**
 * 通用的 CRUD 操作基础仓库类。
 * 使用泛型 T 确保类型安全。
 */
export class Curd<T extends BaseEntity> {
  protected tableName: string;
  protected db: Knex;
  protected idColumn: string;
  private databaseType: 'pg' | 'mysql' | 'mysql2' | 'sqlite3' | string; // 数据库类型

  public static i(dbInstance: Knex) {
    return new Curd<T>(dbInstance);
  }

  /**
   * 构造函数
   * @param tableName - 数据库表名
   * @param dbInstance - 可选的 Knex 实例，主要用于测试
   */
  private constructor(dbInstance: Knex, tableName: string, pk: string = "id") {
    this.db = dbInstance;
    this.databaseType = this.db.client.config.client;
  }

  public table(tableName: string, pk: string = "id") {
    this.tableName = tableName;
    this.idColumn = pk;
    return this;
  }

  /**
   * 创建一条新记录
   * @param data - 要创建的数据
   * @returns 创建的实体
   */
  async create(data: CreateInput<T>): Promise<T> {
    const [created] = await this.db(this.tableName)
      .insert(data)
      .returning('*'); // PostgreSQL, MySQL 8.0.19+, SQLite 3.35+
    return created;
  }

  /**
   * 根据条件查找多条记录
   * @param condition - 查询条件
   * @param pagination - 分页选项
   * @returns 记录数组
   */
  async find(condition: FindCondition<T> = {}, pagination?: PaginationOptions): Promise<T[]> {
    let query = this.db(this.tableName) as Knex.QueryBuilder<T, T[]>;

    // 应用查询条件
    if (typeof condition === 'function') {
      condition(query);
    } else {
      query = query.where(condition);
    }

    // 应用分页
    if (pagination) {
      const { page = 1, limit = 10 } = pagination;
      const offset = (page - 1) * limit;
      query = query.limit(limit).offset(offset);
    }

    return await query;
  }

  /**
   * 根据条件查找一条记录
   * @param condition - 查询条件
   * @returns 单个实体或 null
   */
  async findOne(condition: FindCondition<T> = {}): Promise<T | null> {
    let query = this.db(this.tableName).first() as Knex.QueryBuilder<T, T | undefined>;

    if (typeof condition === 'function') {
      condition(query);
    } else {
      query = query.where(condition);
    }

    const result = await query;
    return result || null;
  }

  /**
   * 根据 ID 查找一条记录
   * @param id - 记录 ID
   * @returns 单个实体或 null
   */
  async findById(id: number): Promise<T | null> {
    return this.findOne({ id } as FindCondition<T>);
  }

  /**
   * 更新符合条件的记录
   * @param condition - 更新条件
   * @param data - 要更新的数据
   * @returns 更新的记录数量
   */
  async update(condition: FindCondition<T>, data: UpdateInput<T>): Promise<number> {
    let query = this.db(this.tableName);

    if (typeof condition === 'function') {
      condition(query);
    } else {
      query = query.where(condition);
    }

    const result = await query.update(data);
    return result; // 返回受影响的行数
  }

  /**
   * 根据 ID 更新记录
   * @param id - 记录 ID
   * @param data - 要更新的数据
   * @returns 更新的记录数量
   */
  async updateById(id: number, data: UpdateInput<T>): Promise<number> {
    return this.update({ id } as FindCondition<T>, data);
  }

  /**
   * 更新或创建一条记录。
   * 根据 `whereData` 中的条件查找记录。
   * - 如果找到匹配的记录，则使用 `setData` 中的数据更新它。
   * - 如果未找到匹配的记录，则使用 `whereData` 和 `setData` 中的数据（合并）创建一条新记录。
   *
   * @param whereData - 用于查找记录的条件对象。通常包含唯一标识字段（如 email, username, 或复合唯一键）。
   * @param setData - 包含要设置（插入时）或更新（更新时）的字段和值的对象。
   * @returns 更新或创建后的完整记录。
   *
   * @example
   * // 假设 User 表有唯一约束 (email)
   * const user = await userRepository.updateOrCreate(
   *   { email: 'alice@example.com' }, // whereData: 查找条件
   *   { name: 'Alice', age: 25 }      // setData: 要设置/更新的数据
   * );
   * // 如果 email='alice@example.com' 的用户存在，则更新其 name 和 age。
   * // 如果不存在，则创建一个新用户，email='alice@example.com', name='Alice', age=25。
   */
  async updateOrCreate(
    whereData: Partial<T>, // 条件数据，类型为 T 的部分属性
    setData: Partial<T>    // 设置/更新数据，类型为 T 的部分属性
  ): Promise<T> {
    // 1. 首先尝试根据 whereData 查找记录
    const existingRecord = await this.findOne(whereData as FindCondition<T>);

    if (existingRecord) {
      // 2a. 记录存在：执行更新操作
      // 将 setData 合并到 whereData 上（如果需要，whereData 中的唯一键通常不需要更新）
      // 这里我们只使用 setData 进行更新，whereData 用于定位
      const [updatedRecord] = await this.db(this.tableName)
        .where(whereData)
        .update(setData)
        .returning('*'); // 返回更新后的完整记录

      if (!updatedRecord) {
        throw new Error(`Failed to update record with ${JSON.stringify(whereData)}`);
      }
      return updatedRecord;
    } else {
      // 2b. 记录不存在：执行创建操作
      // 将 whereData (查找条件) 和 setData (设置数据) 合并，作为新记录的所有数据
      const createData = { ...whereData, ...setData } as CreateInput<T>;
      const [createdRecord] = await this.db(this.tableName)
        .insert(createData)
        .returning('*'); // 返回创建的完整记录

      if (!createdRecord) {
        throw new Error(`Failed to create record with data ${JSON.stringify(createData)}`);
      }
      return createdRecord;
    }
  }


  /**
   * 删除符合条件的记录
   * @param condition - 删除条件
   * @returns 删除的记录数量
   */
  async delete(condition: FindCondition<T>): Promise<number> {
    let query = this.db(this.tableName);

    if (typeof condition === 'function') {
      condition(query);
    } else {
      query = query.where(condition);
    }

    const result = await query.del();
    return result;
  }

  /**
   * 根据 ID 删除记录
   * @param id - 记录 ID
   * @returns 删除的记录数量
   */
  async deleteById(id: number): Promise<number> {
    return this.delete({ id } as FindCondition<T>);
  }

  /**
   * 获取符合条件的记录总数
   * @param condition - 查询条件
   * @returns 记录总数
   */
  async count(condition: FindCondition<T> = {}): Promise<number> {
    let query = this.db(this.tableName).count<{ count: string }>('id as count');

    if (typeof condition === 'function') {
      condition(query);
    } else {
      query = query.where(condition);
    }

    const result = await query.first();
    return parseInt(result?.count || '0', 10);
  }

  /**
   * 开启一个事务
   * @param callback - 在事务中执行的操作
   * @returns 事务执行结果
   */
  async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }


  /**
   * 根据数据库类型生成 JSON 路径字符串。
   * PostgreSQL: {path,to,value} (用于 jsonb_set, #-)
   * MySQL: $.path.to.value (用于 JSON_SET, JSON_REMOVE, JSON_CONTAINS_PATH)
   * @private
   */
  private buildJsonPath(path: string | string[]): string {
    const pathArray = Array.isArray(path) ? path : path.split('.');
    if (this.databaseType === 'pg' || this.databaseType === 'sqlite3') {
      // PostgreSQL/SQLite: 使用 '{a,b,c}' 格式
      return `{${pathArray.join(',')}}`;
    } else if (this.databaseType === 'mysql' || this.databaseType === 'mysql2') {
      // MySQL: 使用 '$.a.b.c' 格式
      return '$.' + pathArray.join('.');
    } else {
      throw new Error(`Unsupported database client for JSON operations: ${this.databaseType}`);
    }
  }

  // --- 工具方法：生成更新 JSON 字段的 raw 表达式 ---
  /**
   * 生成用于更新 JSON 字段的 Knex.raw 表达式。
   * @private
   */
  private generateUpdateJsonRaw(
    jsonColumn: keyof T,
    path: string | string[],
    value: any
  ): Knex.Raw {
    const pathStr = this.buildJsonPath(path);
    const valueStr = JSON.stringify(value); // 大多数情况下需要 stringify

    if (this.databaseType === 'pg' || this.databaseType === 'sqlite3') {
      // PostgreSQL/SQLite: jsonb_set(??, path, value::jsonb, create_if_missing)
      return this.db.raw(
        `jsonb_set(??, ?, ?::jsonb, ?)`,
        [jsonColumn, pathStr, valueStr, true]
      );
    } else if (this.databaseType === 'mysql' || this.databaseType === 'mysql2') {
      // MySQL: JSON_SET(??, path, value)
      // 注意：对于复杂对象，value 可能需要 JSON.stringify，Knex 有时会处理，保险起见 stringify
      return this.db.raw(
        `JSON_SET(??, ?, ?)`,
        [jsonColumn, pathStr, valueStr] // MySQL 的 JSON_SET 能处理 JSON 字符串
      );
    } else {
      throw new Error(`Unsupported database client for JSON update: ${this.databaseType}`);
    }
  }

  // --- 工具方法：生成移除 JSON 字段的 raw 表达式 ---
  /**
   * 生成用于移除 JSON 字段的 Knex.raw 表达式。
   * @private
   */
  private generateRemoveJsonRaw(
    jsonColumn: keyof T,
    path: string | string[]
  ): Knex.Raw {
    const pathStr = this.buildJsonPath(path);

    if (this.databaseType === 'pg' || this.databaseType === 'sqlite3') {
      // PostgreSQL/SQLite: ?? #- path
      return this.db.raw(`?? #- ?`, [jsonColumn, pathStr]);
    } else if (this.databaseType === 'mysql' || this.databaseType === 'mysql2') {
      // MySQL: JSON_REMOVE(??, path)
      return this.db.raw(`JSON_REMOVE(??, ?)`, [jsonColumn, pathStr]);
    } else {
      throw new Error(`Unsupported database client for JSON remove: ${this.databaseType}`);
    }
  }

  // --- 工具方法：生成检查 JSON 包含的 raw WHERE 条件 ---
  /**
   * 生成用于检查 JSON 包含的 Knex.raw WHERE 条件。
   * @private
   */
  private generateContainsWhereRaw(
    jsonColumn: keyof T,
    jsonObject: Record<string, any>
  ): { sql: string; bindings: any[] } {
    const jsonString = JSON.stringify(jsonObject);
    if (this.databaseType === 'pg' || this.databaseType === 'sqlite3') {
      // PostgreSQL/SQLite: ?? @> ?
      return {
        sql: `?? @> ?`,
        bindings: [jsonColumn, jsonString]
      };
    } else if (this.databaseType === 'mysql' || this.databaseType === 'mysql2') {
      // MySQL: JSON_CONTAINS(??, ?)
      // 注意：JSON_CONTAINS 语义与 @> 不完全相同，但对于对象包含检查通常可用
      return {
        sql: `JSON_CONTAINS(??, ?)`,
        bindings: [jsonColumn, jsonString]
      };
    } else {
      throw new Error(`Unsupported database client for JSON contains: ${this.databaseType}`);
    }
  }

  // --- 工具方法：生成检查 JSON 路径存在的 raw WHERE 条件 ---
  /**
   * 生成用于检查 JSON 路径存在的 Knex.raw WHERE 条件。
   * @private
   */
  private generatePathExistsWhereRaw(
    jsonColumn: keyof T,
    paths: string[],
    matchAll: boolean
  ): { sql: string; bindings: any[] } {
    const mysqlPaths = paths.map(p => this.buildJsonPath(p)); // MySQL 格式
    const pgPathsArray = paths; // PostgreSQL 的 ARRAY 直接用字符串数组

    if (this.databaseType === 'pg' || this.databaseType === 'sqlite3') {
      // PostgreSQL/SQLite: ?? ?| ARRAY[?] 或 ?? ?& ARRAY[?]
      const operator = matchAll ? '?&' : '?|';
      return {
        sql: `?? ${operator} ARRAY[?]`,
        bindings: [jsonColumn, pgPathsArray]
      };
    } else if (this.databaseType === 'mysql' || this.databaseType === 'mysql2') {
      // MySQL: JSON_CONTAINS_PATH(??, 'one'/'all', path1, path2, ...)
      const mode = matchAll ? 'all' : 'one';
      // 构建 bindings: [jsonColumn, mode, ...mysqlPaths]
      const bindings = [jsonColumn, mode, ...mysqlPaths];
      // 构建 SQL: JSON_CONTAINS_PATH(??, ?, ?, ?, ...)
      const placeholders = mysqlPaths.map(() => '?').join(', ');
      const sql = `JSON_CONTAINS_PATH(??, ?, ${placeholders})`;
      return { sql, bindings };
    } else {
      throw new Error(`Unsupported database client for JSON path exists: ${this.databaseType}`);
    }
  }

  // --- 主要 JSON 操作方法 (现在支持多数据库) ---

  /**
   * 更新 JSON 字段中的特定路径。支持 PostgreSQL, MySQL, SQLite。
   * 支持嵌套路径 (e.g., 'preferences.theme', 'settings.apiKey')。
   * 
   * @param id - 记录的 ID。
   * @param jsonColumn - JSON 字段的列名 (默认 'metadata')。
   * @param path - JSON 路径 (字符串数组或 '.' 分隔的字符串)。
   * @param value - 要设置的新值。
   * @returns 更新后的完整记录。
   */
  async updateJsonField(
    id: number,
    jsonColumn: keyof T = 'metadata' as keyof T,
    path: string | string[],
    value: any
  ): Promise<T> {
    const rawUpdate = this.generateUpdateJsonRaw(jsonColumn, path, value);

    const [updatedRecord] = await this.db(this.tableName)
      .where(this.idColumn, id)
      .update({
        [jsonColumn]: rawUpdate
      } as any)
      .returning('*');

    if (!updatedRecord) {
      throw new Error(`Record with id ${id} not found or failed to update JSON field`);
    }
    return updatedRecord;
  }

  /**
   * 查找 JSON 字段包含指定对象的记录。支持 PostgreSQL, MySQL, SQLite。
   * 
   * @param jsonColumn - JSON 字段的列名 (默认 'metadata')。
   * @param jsonObject - 要匹配的 JSON 对象。
   * @returns 匹配的记录数组。
   */
  async findWhereJsonContains(
    jsonColumn: keyof T = 'metadata' as keyof T,
    jsonObject: Record<string, any>
  ): Promise<T[]> {
    const { sql, bindings } = this.generateContainsWhereRaw(jsonColumn, jsonObject);

    return await this.db(this.tableName)
      .whereRaw(sql, bindings)
      .select('*') as Promise<T[]>;
  }

  /**
   * 查找 JSON 字段中存在指定路径的记录。支持 PostgreSQL, MySQL, SQLite。
   * 
   * @param jsonColumn - JSON 字段的列名 (默认 'metadata')。
   * @param paths - 要检查的路径数组 (字符串数组)。
   * @param matchAll - true 表示所有路径都必须存在，false 表示任意一个存在。
   * @returns 匹配的记录数组。
   */
  async findWhereJsonPathExists(
    jsonColumn: keyof T = 'metadata' as keyof T,
    paths: string[],
    matchAll: boolean = false
  ): Promise<T[]> {
    const { sql, bindings } = this.generatePathExistsWhereRaw(jsonColumn, paths, matchAll);

    return await this.db(this.tableName)
      .whereRaw(sql, bindings)
      .select('*') as Promise<T[]>;
  }

  /**
   * 移除 JSON 字段中的特定路径。支持 PostgreSQL, MySQL, SQLite。
   * 
   * @param id - 记录的 ID。
   * @param jsonColumn - JSON 字段的列名 (默认 'metadata')。
   * @param path - 要移除的路径 (字符串数组或 '.' 分隔的字符串)。
   * @returns 更新后的完整记录。
   */
  async removeJsonField(
    id: number,
    jsonColumn: keyof T = 'metadata' as keyof T,
    path: string | string[]
  ): Promise<T> {
    const rawUpdate = this.generateRemoveJsonRaw(jsonColumn, path);

    const [updatedRecord] = await this.db(this.tableName)
      .where(this.idColumn, id)
      .update({
        [jsonColumn]: rawUpdate
      } as any)
      .returning('*');

    if (!updatedRecord) {
      throw new Error(`Record with id ${id} not found or failed to remove JSON field`);
    }
    return updatedRecord;
  }

  
}