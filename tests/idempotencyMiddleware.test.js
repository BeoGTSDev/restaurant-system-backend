jest.mock('../src/models', () => ({
    IdempotencyRecord: {
        findOne: jest.fn(),
        create: jest.fn(),
    },
}));

const { IdempotencyRecord } = require('../src/models');
const idempotency = require('../src/middleware/idempotency');

const response = () => ({
    statusCode: 200,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(body) { this.body = body; return this; }),
});

describe('idempotency middleware', () => {
    beforeEach(() => jest.clearAllMocks());

    it('replays a completed mutation without invoking the controller', async () => {
        IdempotencyRecord.findOne.mockResolvedValue({ completed: true, statusCode: 201, responseBody: { id: 42 } });
        const req = { method: 'POST', originalUrl: '/api/orders/create', get: () => 'operation-1' };
        const res = response();
        const next = jest.fn();

        await idempotency(req, res, next);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ id: 42 });
        expect(next).not.toHaveBeenCalled();
    });

    it('records a successful response for later replay', async () => {
        const record = { update: jest.fn().mockResolvedValue(), destroy: jest.fn().mockResolvedValue() };
        IdempotencyRecord.findOne.mockResolvedValue(null);
        IdempotencyRecord.create.mockResolvedValue(record);
        const req = { method: 'PUT', originalUrl: '/api/tables/1/open', get: () => 'operation-2' };
        const res = response();
        const next = jest.fn();

        await idempotency(req, res, next);
        res.statusCode = 200;
        res.json({ success: true });
        await Promise.resolve();

        expect(next).toHaveBeenCalledTimes(1);
        expect(record.update).toHaveBeenCalledWith({ completed: true, statusCode: 200, responseBody: { success: true } });
    });
});
