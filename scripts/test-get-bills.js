const port = 3000;

async function main() {
    // 1. Login to get token
    console.log('Logging in...');
    const loginRes = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'gavin', password: 'gavinhuang' }),
    });

    if (!loginRes.ok) {
        console.error('Login failed:', await loginRes.text());
        return;
    }

    const { token } = await loginRes.json();
    console.log('Got token:', token.substring(0, 20) + '...');

    // 2. Get bills
    const year = 2024;
    const month = 10;
    const url = `http://localhost:${port}/api/bills?year=${year}&month=${month}`;
    console.log(`Fetching bills from: ${url}`);

    const billsRes = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!billsRes.ok) {
        console.error('Get bills failed:', await billsRes.text());
        return;
    }

    const bills = await billsRes.json();
    console.log('Bills:', JSON.stringify(bills, null, 2));
}

main();
