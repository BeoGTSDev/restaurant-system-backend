// Cache abstraction: prefer Redis when REDIS_URL is provided, otherwise in-memory map
const REDIS_URL = process.env.REDIS_URL || null;

if (REDIS_URL) {
    // Lazy require to avoid platform issues when Redis isn't used
    const IORedis = require('ioredis');
    const client = new IORedis(REDIS_URL);

    const set = async (key, value, ttl = 600) => {
        await client.set(key, JSON.stringify(value), 'EX', ttl);
    };

    const get = async (key) => {
        const v = await client.get(key);
        return v ? JSON.parse(v) : null;
    };

    const del = async (key) => await client.del(key);
    const clear = async () => await client.flushdb();

    module.exports = { set, get, del, clear };

} else {
    const cache = new Map();

    const set = (key, value, ttl = 600) => {
        const expires = Date.now() + ttl * 1000;
        cache.set(key, { value, expires });
    };

    const get = (key) => {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            cache.delete(key);
            return null;
        }
        return entry.value;
    };

    const del = (key) => cache.delete(key);
    const clear = () => cache.clear();

    module.exports = { set, get, del, clear };
}
