import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { headers } from 'next/headers';
import { writeFile } from 'fs/promises';
import { join } from 'path';

async function isAuthenticated() {
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    return await verifyToken(token);
}

export async function POST(request: Request) {
    const user = await isAuthenticated();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.name.replace(/[^a-zA-Z0-9.]/g, ''); // Sanitize
        const filename = `${uniqueSuffix}-${originalName}`;

        // Save to public/uploads/icons
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'icons');
        const filepath = join(uploadDir, filename);

        await writeFile(filepath, buffer);

        return NextResponse.json({ url: `/uploads/icons/${filename}` });
    } catch (e) {
        console.error('Upload error:', e);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
