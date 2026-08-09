// Test file: checks authMiddleware.test behavior and protects it from later changes.
const request = require('supertest');
const app = require('../src/server');

describe('Auth middleware', () => {
  it('returns 401 for protected route without token', async () => {
    const res = await request('http://localhost:5000').get('/api/roles');
    expect([401, 302]).toContain(res.status); // 302 for redirect in some setups
  });
});
