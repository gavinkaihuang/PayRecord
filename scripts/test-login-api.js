const port = 3000; // Try 3000 first
// const port = 4180; 

async function testLogin(port) {
    const url = `http://localhost:${port}/api/auth/login`;
    console.log(`Testing login at ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'gavinhuang', // The new password
            }),
        });

        console.log(`Status: ${response.status}`);
        const data = await response.json();
        console.log('Response:', data);
    } catch (error) {
        console.error(`Error connecting to ${port}:`, error.message);
    }
}

// Check if running directly or just to import
if (require.main === module) {
    (async () => {
        await testLogin(3000);
        await testLogin(4180);
    })();
}
