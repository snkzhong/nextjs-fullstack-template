import type { Knex, AnyRecord } from '~/backend/lib/db/types';

interface UpdateResult {
  rowCount: number; // PostgreSQL 用
  affectedRows?: number; // MySQL 用
}

export class Sql 
{
  protected db: Knex;

  private constructor(dbInstance: Knex) {
    this.db = dbInstance
  }

  public static i(dbInstance: Knex) {
    return new Sql(dbInstance);
  }

  public async create(sql: string, ...bindings: any[]) {
  	const rawResult:Knex.Raw = await this.execute(sql, ...bindings);

  	// 根据数据库类型提取ID和受影响行数
	  switch (this.db.client.config.client) {
	  	case 'pg':
	    case 'postgresql':
	      id = rawResult.rows[0]?.id;
	      rowCount = rawResult.rowCount || 0;
	      break;
	    case 'mysql':
	    case 'mysql2':
	      id = rawResult[0]?.insertId;
	      rowCount = rawResult[0]?.affectedRows || 0;
	      break;
	    case 'sqlite3':
	      id = rawResult[0]?.lastInsertRowid;
	      rowCount = rawResult[0]?.changes || 0;
	      break;
	    default:
	      // 未知数据库，尝试通用提取
	      id = rawResult.rows?.[0]?.id || rawResult[0]?.insertId;
	      rowCount = rawResult.rowCount || rawResult[0]?.affectedRows || 0;
	  }
  }

  public async fetchRow(sql: string, ...bindings: any[]): Promise<AnyRecord> {
  	const result = await this.fetchRows(sql, ...bindings);
  	return result[0];
  }

  public async fetchRows(sql: string, ...bindings: any[]): Promise<AnyRecord[]> {
  	const result:Knex.Raw<AnyRecord[]> = await this.execute(sql, ...bindings);
  	return result.rows || result[0];
  }

  public async update(sql: string, ...bindings: any[]): Promise<Boolean> {
  	const result:Knex.Raw<UpdateResult> = await this.execute(sql, ...bindings);
  	return (result.rowCount || result.affectedRows || 0) > 0;
  }

  public async delete(sql: string, ...bindings: any[]): Promise<Boolean> {
  	const result:Knex.Raw<UpdateResult> = await this.execute(sql, ...bindings);
  	return (result.rowCount || result.affectedRows || 0) > 0;
  }

  public async transaction(func: (trx: Knex.Transaction) => Promise<void>) {
  	const trx: Knex.Transaction = await this.db.transaction();
  	try {
  		await func(trx);
  		await trx.commit();
  	} catch(error) {
  		await trx.rollback();
  		throw error;
  	}
  }

  public async execute(sql: string, ...bindings: any[]): Promise<any> {
    try {
      console.log(`execute sql: ${sql}, bindings: ${bindings}`);
      const result = await this.db.raw(sql, bindings);
      return result;
    } catch (error) {
      console.error('Error execute sql:', error);
      throw error;
    }
  }
}