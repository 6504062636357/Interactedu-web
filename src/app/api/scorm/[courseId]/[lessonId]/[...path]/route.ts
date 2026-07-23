import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});


async function fetchFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  const response = await r2.send(command);
  if (!response.Body) throw new Error('Empty body');
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; lessonId: string; path: string[] }> }
) {
  // 1. เช็คสิทธิ์การเข้าถึงผ่านตัวจัดการของโปรเจกต์
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { courseId, lessonId, path } = await params;

  const filePath = path.join('/');
  const basePath = `scorm-packages/${courseId}/${lessonId}`;
  const primaryPath = `${basePath}/${filePath}`;

  try {
    let buffer: Buffer;

    
    try {
      buffer = await fetchFromR2(primaryPath);
    } catch (err: any) {
      if (err?.name === 'NoSuchKey') {
        const filename = filePath.substring(filePath.lastIndexOf('/') + 1);
        buffer = await fetchFromR2(`${basePath}/shared/${filename}`);
      } else {
        throw err;
      }
    }
   

    const mimeType = mime.lookup(filePath);
    const actualContentType = typeof mimeType === 'string' ? mimeType : 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': actualContentType,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('R2 Proxy Error:', {
      primaryPath,
      name: error?.name,
      message: error?.message,
    });
    return new NextResponse(
      JSON.stringify({ error: error?.name, message: error?.message, storagePath: primaryPath }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}