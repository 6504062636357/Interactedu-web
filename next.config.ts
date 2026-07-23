import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ⚡ บอก Turbopack ไม่ต้อง Bundle archiver ให้เรียกใช้จาก node_modules ตรงๆ ใน Node Runtime
  serverExternalPackages: ["archiver"],
};

export default nextConfig;