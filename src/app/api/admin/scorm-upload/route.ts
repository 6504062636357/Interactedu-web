// src/app/api/admin/scorm-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import JSZip from 'jszip';
import mime from 'mime-types';
import { XMLParser } from 'fast-xml-parser';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

// ---- ชนิดข้อมูลของ item ในเมนู SCORM ----
interface ScormMenuItem {
  identifier: string;
  title: string;
  href: string | null; // null ถ้าเป็นแค่หมวดหมู่ ไม่มี resource ให้เปิดตรงๆ
  children: ScormMenuItem[];
}

interface ScormManifestResult {
  organizationTitle: string;
  entryPoint: string; // SCO แรกสุด ใช้เป็นค่าเริ่มต้นตอนเปิดครั้งแรก
  version: '1.2' | '2004';
  items: ScormMenuItem[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'resource' || name === 'file',
});

function parseManifest(xml: string): ScormManifestResult {
  const parsed: unknown = xmlParser.parse(xml);
  const parsedRecord = isRecord(parsed) ? parsed : null;
  const manifest = parsedRecord && isRecord(parsedRecord.manifest) ? parsedRecord.manifest : null;
  if (!manifest) throw new Error('imsmanifest.xml ไม่ถูกต้อง: ไม่พบ <manifest>');

  // --- เวอร์ชัน SCORM ---
  const metadata = isRecord(manifest.metadata) ? manifest.metadata : null;
  const schemaVersion = metadata?.schemaversion ?? '';
  const isScorm2004 = /2004/.test(String(schemaVersion));
  const version: '1.2' | '2004' = isScorm2004 ? '2004' : '1.2';

// ฟังก์ชันช่วย: หา href ที่แท้จริงของ resource ---
  // บางแพ็กเกจ (เช่น golf-explained) ใช้ HTML template ร่วมกันใน shared/
  // แต่ questions.js ของแต่ละหัวข้อแยกอยู่คนละโฟลเดอร์ -> ต้อง launch จากโฟลเดอร์หัวข้อ ไม่ใช่ shared/
  function resolveResourceHref(res: UnknownRecord): string | undefined {
    const href = optionalString(res['@_href']);
    if (!href) return href;

    const filesRaw = res.file ?? [];
    const filesArr: unknown[] = Array.isArray(filesRaw) ? filesRaw : [filesRaw];
    const fileHrefs = filesArr
      .map((file) => (isRecord(file) ? optionalString(file['@_href']) : undefined))
      .filter((fileHref): fileHref is string => Boolean(fileHref));

    const folderOf = (p: string) => (p.includes('/') ? p.substring(0, p.lastIndexOf('/') + 1) : '');
    const hrefFolder = folderOf(href);

    // หาไฟล์ที่อยู่คนละโฟลเดอร์กับ href หลัก (เช่น "Etiquette/questions.js" ขณะที่ href คือ "shared/...")
    const topicFolder = fileHrefs
      .map(folderOf)
      .find((folder) => folder && folder !== hrefFolder);

    if (topicFolder) {
      const filename = href.substring(href.lastIndexOf('/') + 1);
      return `${topicFolder}${filename}`; // ex: "Etiquette/assessmenttemplate.html"
    }
    return href;
  }

  // --- สร้าง map: resource identifier -> href (พร้อมรวม xml:base เข้าไปด้วย) ---
  const resourceMap = new Map<string, string>();
  const resources = isRecord(manifest.resources) ? manifest.resources : null;
  const resourcesRaw = resources?.resource ?? [];
  const resourcesArr: unknown[] = Array.isArray(resourcesRaw) ? resourcesRaw : [resourcesRaw];

  const resourcesBase = optionalString(resources?.['@_xml:base']) ?? '';

  for (const resource of resourcesArr) {
    if (!isRecord(resource)) continue;
    const id = optionalString(resource['@_identifier']);
    const resolvedHref = resolveResourceHref(resource); //ใช้ตัวนี้แทน res?.['@_href']
    const resourceBase = optionalString(resource['@_xml:base']) ?? '';

    if (id && resolvedHref) {
      const fullBase = [resourcesBase, resourceBase].filter(Boolean).join('');
      const fullHref = fullBase ? `${fullBase}${resolvedHref}` : resolvedHref;
      resourceMap.set(id, fullHref);
    }
  }

  console.log('=== SCORM RESOURCES RAW ===');
  console.log(JSON.stringify(resourcesArr, null, 2));
  console.log('=== RESOURCE MAP (id -> href) ===');
  console.log(JSON.stringify(Array.from(resourceMap.entries()), null, 2));
  // --- เดิน item tree แบบ recursive ---
  function walkItems(rawItem: unknown): ScormMenuItem[] {
    if (!rawItem) return [];
    const arr: unknown[] = Array.isArray(rawItem) ? rawItem : [rawItem];

    return arr.map((rawItemValue): ScormMenuItem => {
      const item = isRecord(rawItemValue) ? rawItemValue : {};
      const identifier = optionalString(item['@_identifier']) ?? '';
      const identifierRef = optionalString(item['@_identifierref']) ?? null;
      const title = item.title ?? identifier ?? 'ไม่มีชื่อ';

      // 
      const parameters = optionalString(item['@_parameters']) ?? '';
      let href = identifierRef ? resourceMap.get(identifierRef) ?? null : null;
      if (href && parameters) {
        href = `${href}${parameters}`;
      }
      // 

      const children = item.item ? walkItems(item.item) : [];

      return { identifier, title: String(title), href, children };
    });
  }

  const organizations = isRecord(manifest.organizations) ? manifest.organizations : null;
  const org = organizations?.organization;
  // organization อาจเป็น array ถ้ามีหลาย org แต่ปกติ SCORM ใช้แค่ default org อันเดียว
  const orgValue = Array.isArray(org) ? org[0] : org;
  const orgObj = isRecord(orgValue) ? orgValue : null;
  if (!orgObj) throw new Error('imsmanifest.xml ไม่ถูกต้อง: ไม่พบ <organization>');

  const organizationTitle = String(orgObj?.title ?? 'บทเรียน');
  console.log('=== ORG ITEM RAW ===');
  console.log(JSON.stringify(orgObj?.item, null, 2));

  const items = walkItems(orgObj?.item);

  // --- หา entry point แรกสุด (SCO แรกที่เจอตาม depth-first order) ---
  function findFirstHref(nodes: ScormMenuItem[]): string | null {
    for (const node of nodes) {
      if (node.href) return node.href;
      const childHref = findFirstHref(node.children);
      if (childHref) return childHref;
    }
    return null;
  }

  const entryPoint = findFirstHref(items) ?? 'index.html';

  return { organizationTitle, entryPoint, version, items };
}


export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. auth + role check (แอดมินเท่านั้น)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  // 2. รับไฟล์
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('courseId') as string | null;
  const lessonId = formData.get('lessonId') as string | null;

  if (!file || !courseId || !lessonId) {
    return NextResponse.json({ error: 'ต้องมี file, courseId, lessonId' }, { status: 400 });
  }
  if (!file.name.endsWith('.zip')) {
    return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ .zip' }, { status: 400 });
  }

  try {
    // 3. แตก zip
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const manifestFile = zip.file('imsmanifest.xml');
    if (!manifestFile) {
      return NextResponse.json({ error: 'ไม่พบ imsmanifest.xml — ไม่ใช่แพ็กเกจ SCORM ที่ถูกต้อง' }, { status: 400 });
    }

    const manifestXml = await manifestFile.async('text');

    let manifestResult: ScormManifestResult;
    try {
      manifestResult = parseManifest(manifestXml);
    } catch (parseError: unknown) {
      return NextResponse.json(
        { error: `อ่านโครงสร้าง imsmanifest.xml ไม่สำเร็จ: ${errorMessage(parseError)}` },
        { status: 400 }
      );
    }

    const { entryPoint, version, items, organizationTitle } = manifestResult;

    // 4. อัปโหลดทุกไฟล์ขึ้น R2
    const basePath = `scorm-packages/${courseId}/${lessonId}`;
    const uploadTasks: Promise<unknown>[] = [];

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      const task = zipEntry.async('nodebuffer').then((buffer) => {
        const mimeType = mime.lookup(relativePath) || 'application/octet-stream';
        return r2.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: `${basePath}/${relativePath}`,
          Body: buffer,
          ContentType: mimeType as string,
        }));
      });
      uploadTasks.push(task);
    });

    await Promise.all(uploadTasks);

    // 5. อัปเดต lessons table — เก็บทั้ง entry point เดิม และ manifest tree ทั้งก้อน
    const { error: updateError } = await supabase
      .from('lessons')
      .update({
        is_scorm: true,
        scorm_entry_point: entryPoint,
        scorm_version: version,
        scorm_manifest: { organizationTitle, items },
      })
      .eq('id', lessonId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      entryPoint,
      version,
      itemCount: items.length,
      filesUploaded: uploadTasks.length,
    });
  } catch (error: unknown) {
    console.error('SCORM Upload Error:', error);
    return NextResponse.json({ error: errorMessage(error) || 'อัปโหลดไม่สำเร็จ' }, { status: 500 });
  }
}
