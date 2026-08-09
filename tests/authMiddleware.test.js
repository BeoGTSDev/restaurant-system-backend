// Test file: checks authMiddleware.test behavior and protects it from later changes.
const request = require('supertest');
const app = require('../src/server');

describe('Auth middleware', () => {
  it('returns 401 for protected route without token', async () => {
    const res = await request(app).get('/api/roles');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access Denied: No Token Provided' });
  });
});
