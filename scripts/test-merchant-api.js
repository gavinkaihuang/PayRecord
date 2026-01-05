const port = 3000;

async function main() {
    // 1. Login
    console.log('Logging in...');
    const loginRes = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'gavin', password: 'gavinhuang' }),
    });

    if (!loginRes.ok) {
        console.error('Login failed');
        return;
    }

    const { token } = await loginRes.json();

    // 2. Test POST /api/merchants
    const testName = 'TestMerchant_' + Date.now();
    const testIcon = '/uploads/icons/test.png';
    console.log(`Creating merchant: ${testName}`);

    const res = await fetch(`http://localhost:${port}/api/merchants`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: testName, icon: testIcon })
    });

    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log('Response:', data);
}

main();
