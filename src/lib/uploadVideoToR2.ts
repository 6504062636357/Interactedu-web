export async function uploadVideoToR2(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const uploadUrlController = new AbortController();
  const uploadUrlTimeout = window.setTimeout(() => uploadUrlController.abort(), 20_000);
  let res: Response;

  try {
    res = await fetch('/api/r2-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, fileType: file.type }),
      signal: uploadUrlController.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('ระบบเตรียมการอัปโหลดนานเกินไป กรุณาลองใหม่อีกครั้ง');
    }
    throw new Error('เชื่อมต่อระบบอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  } finally {
    window.clearTimeout(uploadUrlTimeout);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || 'ขอลิงก์อัปโหลดไม่สำเร็จ');
  }

  const body = await res.json() as { uploadUrl?: unknown; publicUrl?: unknown };
  if (typeof body.uploadUrl !== 'string' || typeof body.publicUrl !== 'string') {
    throw new Error('ระบบส่งข้อมูลอัปโหลดกลับมาไม่ครบ กรุณาลองใหม่อีกครั้ง');
  }

  const { uploadUrl, publicUrl } = body;
  onProgress?.(0);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    // ป้องกันสถานะอัปโหลดค้างจนปุ่มบันทึก/ส่งตรวจถูกปิดตลอด
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`อัปโหลดวิดีโอไม่สำเร็จ (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('เชื่อมต่อ R2 ไม่สำเร็จ'));
    xhr.ontimeout = () => reject(new Error('อัปโหลดวิดีโอนานเกิน 15 นาที กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'));
    xhr.onabort = () => reject(new Error('การอัปโหลดวิดีโอถูกยกเลิก'));
    xhr.send(file);
  });

  return publicUrl;
}
