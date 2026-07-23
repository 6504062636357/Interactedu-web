export async function uploadVideoToR2(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const res = await fetch('/api/r2-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type }),
  });

  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error || 'ขอ upload URL ไม่สำเร็จ');
  }

  const { uploadUrl, publicUrl } = await res.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error('อัปโหลดไม่สำเร็จ')));
    xhr.onerror = () => reject(new Error('เชื่อมต่อ R2 ไม่สำเร็จ'));
    xhr.send(file);
  });

  return publicUrl;
}