import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from '@/lib/r2';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่ก่อนอัปโหลดวิดีโอ' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[r2-upload-url] profile lookup failed:', profileError.message);
      return NextResponse.json({ error: 'ตรวจสอบสิทธิ์อัปโหลดไม่สำเร็จ กรุณาลองใหม่' }, { status: 503 });
    }

    if (profile?.role !== 'admin' && profile?.role !== 'teacher') {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อัปโหลดวิดีโอ' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as { fileName?: unknown; fileType?: unknown } | null;
    if (typeof body?.fileName !== 'string' || typeof body.fileType !== 'string') {
      return NextResponse.json({ error: 'ข้อมูลไฟล์ไม่ครบ' }, { status: 400 });
    }
    if (!body.fileType.startsWith('video/')) {
      return NextResponse.json({ error: 'รองรับเฉพาะไฟล์วิดีโอเท่านั้น' }, { status: 400 });
    }

    const safeFileName = body.fileName
      .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
      .slice(-180) || 'video';
    const key = `videos/${crypto.randomUUID()}-${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: body.fileType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
    const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error('[r2-upload-url] unexpected failure:', error);
    return NextResponse.json(
      { error: 'เตรียมการอัปโหลดวิดีโอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' },
      { status: 500 }
    );
  }
}
