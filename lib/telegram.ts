export async function sendTelegramMessage(token: string, chatId: string, text: string) {
    if (!token || !chatId) {
        throw new Error('Missing Telegram token or chat ID');
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API Error: ${errorData.description || response.statusText}`);
    }

    return await response.json();
}
