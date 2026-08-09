// Reusable helper code used by startup or business files.
// Cache abstraction: prefer Redis when REDIS_URL is provided, otherwise in-memory map
const REDIS_URL = process.env.REDIS_URL || null;

if (REDIS_URL) {
    // Lazy require to avoid platform issues when Redis isn't used
    const IORedis = require('ioredis');
    const client = new IORedis(REDIS_URL);

    // Helper: changes and saves set and returns the value to its caller.
    const set = async (key, value, ttl = 600) => {
        await client.set(key, JSON.stringify(value), 'EX', ttl);
    };

    // Helper: loads get data and returns the value to its caller.
    const get = async (key) => {
        const v = await client.get(key);
        return v ? JSON.parse(v) : null;
    };

    // Helper: runs the del step and returns the value to its caller.
    const del = async (key) => await client.del(key);
    // Helper: runs the clear step and returns the value to its caller.
    const clear = async () => await client.flushdb();

    module.exports = { set, get, del, clear };

} else {
    const cache = new Map();

    // Helper: changes and saves set and returns the value to its caller.
    const set = (key, value, ttl = 600) => {
        const expires = Date.now() + ttl * 1000;
        cache.set(key, { value, expires });
    };

    // Helper: loads get data and returns the value to its caller.
    const get = (key) => {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            cache.delete(key);
            return null;
        }
        return entry.value;
    };

    // Helper: runs the del step and returns the value to its caller.
    const del = (key) => cache.delete(key);
    // Helper: runs the clear step and returns the value to its caller.
    const clear = () => cache.clear();

    module.exports = { set, get, del, clear };
}
