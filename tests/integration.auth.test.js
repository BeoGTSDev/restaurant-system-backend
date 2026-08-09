// Test file: checks integration.auth.test behavior and protects it from later changes.
const mockFindOne = jest.fn();

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

jest.mock('../src/models/User', () => ({ findOne: mockFindOne }));
jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));

const { login } = require('../src/controllers/authControllers');

const admin = {
  id: 1,
  fullName: 'System Admin',
  email: 'admin@rms.com',
  password: 'hashed-password',
  roleId: 1,
  isActive: true,
  role: {
    name: 'Admin',
    Permissions: [{ name: 'manage_system' }, { name: 'manage_users' }]
  }
};

// Function: runs the execute login step and returns its result to the caller.
const executeLogin = async (email) => {
  const req = {
    body: { email, password: 'admin123' },
    headers: {},
    ip: '127.0.0.1'
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  const next = jest.fn();

  await login(req, res, next);
  return { res, next };
};

describe('Auth integration', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockFindOne.mockResolvedValue(admin);
  });

  it('admin login returns token and permissions', async () => {
    const { res, next } = await executeLogin('admin@rms.com');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      token: expect.any(String),
      user: expect.objectContaining({
        email: 'admin@rms.com',
        permissions: ['manage_system', 'manage_users']
      })
    }));
    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'admin@rms.com' }
    }));
  });

  it('admin email login is case-insensitive', async () => {
    const { res, next } = await executeLogin('  ADMIN@RMS.COM  ');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ email: 'admin@rms.com' })
    }));
    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'admin@rms.com' }
    }));
  });
});
