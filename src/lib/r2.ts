//client สำหรับเชื่อม R2 (S3-compatible)
// import { S3Client } from '@aws-sdk/client-s3';

// export const r2Client = new S3Client({
//   region: 'auto',
//   endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
//   credentials: {
//     accessKeyId: process.env.R2_ACCESS_KEY_ID!,
//     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
//   },
// });

// export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
// export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;
import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

// Helper ฟังก์ชันเช็ค Env Var ให้ฟ้อง Error ทันทีถ้าลืมใส่
function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[R2 Config Error] Missing environment variable: ${key}`);
  }
  return value;
}

export const R2_BUCKET_NAME = requiredEnv("R2_BUCKET_NAME");
export const R2_PUBLIC_URL = requiredEnv("R2_PUBLIC_URL");

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  },
});