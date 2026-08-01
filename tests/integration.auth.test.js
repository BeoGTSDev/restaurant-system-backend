const request = require('supertest');

// Tests expect the server to be running on localhost:5000 (server.js starts automatically when required)
describe('Auth integration', () => {
  it('admin login returns token and permissions', async () => {
    const res = await request('http://localhost:5000')
      .post('/api/auth/login')
      .send({ email: 'admin@rms.com', password: 'admin123' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(Array.isArray(res.body.user.permissions)).toBe(true);
    expect(res.body.user.permissions.length).toBeGreaterThan(0);
  }, 20000);

  it('admin email login is case-insensitive', async () => {
    const res = await request('http://localhost:5000')
      .post('/api/auth/login')
      .send({ email: '  ADMIN@RMS.COM  ', password: 'admin123' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('admin@rms.com');
  }, 20000);
});
