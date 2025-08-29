import type { Knex } from 'knex';

export type { Knex } from 'knex';

export type AnyRecord = Record<string, any>;

/**
 * 通用的数据库实体基础接口。
 * 所有实体类型都应包含 id 和时间戳。
 */
export interface BaseEntity {
  id: number;
  created_at?: string | Date;
  updated_at?: string | Date;
  // deleted_at?: string | Date; // 如果支持软删除
}

/**
 * 用于创建操作的输入类型。
 * 排除了 id 和时间戳（通常由数据库自动生成）。
 */
export type CreateInput<T extends BaseEntity> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

/**
 * 用于更新操作的输入类型。
 * 所有字段都是可选的。
 */
export type UpdateInput<T extends BaseEntity> = Partial<Omit<T, 'id' | 'created_at'>>;

/**
 * 用于查询操作的条件类型。
 * 可以是简单的键值对，也可以是更复杂的 Knex 查询构建器回调。
 */
export type FindCondition<T extends BaseEntity> = 
  | Partial<Record<keyof T, any>>
  | ((queryBuilder: Knex.QueryBuilder<T, T[]>) => void);

/**
 * 分页查询的选项
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
}