import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'icons');
        const filepath = join(uploadDir, filename);

        if (!existsSync(filepath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const buffer = await readFile(filepath);

        // Determine content type (basic check)
        const ext = filename.split('.').pop()?.toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === 'png') contentType = 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
        if (ext === 'svg') contentType = 'image/svg+xml';
        if (ext === 'webp') contentType = 'image/webp';

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });
    } catch (e) {
        console.error('Error serving file:', e);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
