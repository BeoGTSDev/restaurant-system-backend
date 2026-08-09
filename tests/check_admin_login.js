// Test file: checks check_admin_login behavior and protects it from later changes.
// Simple integration check using built-in fetch (Node 18+)
(async () => {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@rms.com', password: 'admin123' }),
    });

    const body = await res.json().catch(() => null);
    console.log('Status:', res.status);
    console.log('Body:', body);

    if (res.status === 200 && body && body.token) {
      console.log('OK: admin login returned token and user');
      process.exit(0);
    }
    console.error('FAIL: admin login did not return expected result');
    process.exit(2);
  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exit(3);
  }
})();
