jest.mock('../src/models', () => ({
  User: { findByPk: jest.fn() },
  Role: {},
  Permission: {},
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ id: 42 })),
}));

const { User } = require('../src/models');
const { verifyToken } = require('../src/middleware/authMiddleware');

const response = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('verifyToken active-account enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a previously issued token after the user is disabled', async () => {
    User.findByPk.mockResolvedValue({
      id: 42,
      isActive: false,
      roleId: 2,
      role: { name: 'Waiter', Permissions: [] },
    });
    const req = {
      header: jest.fn((name) => (name === 'Authorization' ? 'Bearer valid-token' : null)),
    };
    const res = response();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Account is disabled' });
    expect(next).not.toHaveBeenCalled();
  });
});
