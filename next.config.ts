import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚡ บอก Turbopack ไม่ต้อง Bundle archiver ให้เรียกใช้จาก node_modules ตรงๆ ใน Node Runtime
  serverExternalPackages: ["archiver"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff",
    ],
  },
};

export default nextConfig;
