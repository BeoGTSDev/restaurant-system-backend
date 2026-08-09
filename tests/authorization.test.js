// Test file: checks authorization.test behavior and protects it from later changes.
jest.mock('../src/models', () => ({ User: {}, Role: {}, Permission: {} }));

const { extractToken, verifyAdmin, authorize } = require('../src/middleware/authMiddleware');

// Function: runs the response step and returns its result to the caller.
const response = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('authorization middleware', () => {
    test('extracts legacy auth-token header', () => {
        const req = { header: name => name === 'auth-token' ? 'legacy-token' : undefined };
        expect(extractToken(req)).toBe('legacy-token');
    });

    test('extracts bearer token', () => {
        const req = { header: name => name === 'Authorization' ? 'Bearer bearer-token' : undefined };
        expect(extractToken(req)).toBe('bearer-token');
    });

    test('admin check permits Admin only', () => {
        const next = jest.fn();
        verifyAdmin({ user: { role: 'Admin' } }, response(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('admin check rejects non-admin', () => {
        const res = response();
        verifyAdmin({ user: { role: 'Leader' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('authorization rejects unauthenticated request', () => {
        const res = response();
        authorize('manage_staff')({}, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('admin bypasses permission lookup', () => {
        const next = jest.fn();
        authorize('anything')({ user: { role: 'Admin', permissions: [] } }, response(), next);
        expect(next).toHaveBeenCalled();
    });

    test('accepts one matching permission from an array', () => {
        const next = jest.fn();
        authorize(['manage_staff', 'deploy_shift'])({
            user: { role: 'Leader', permissions: ['deploy_shift'] }
        }, response(), next);
        expect(next).toHaveBeenCalled();
    });

    test('rejects missing permission', () => {
        const res = response();
        authorize('manage_staff')({
            user: { role: 'Waiter', permissions: ['create_order'] }
        }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
