import RedisClient, { RedisClientOptions } from '~/backend/lib/redisclient';
import { getConfig } from "~/backend/kernel";

let redisConfig = getConfig("redis") as RedisClientOptions;
redisConfig["bloomFilter"] = { enabled: true };
redisConfig["performance"] = { logSlowQueries: true };
// console.log("redisConfig:", redisConfig);

const redisClient = new RedisClient(redisConfig);

export default redisClient;