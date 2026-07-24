// app/api/materials/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/utils/supabase/server";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { materialId } = await req.json();

  const { data: material } = await supabase
    .from("course_materials")
    .select("id, course_id, file_key")
    .eq("id", materialId)
    .single();

  if (!material) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: course } = await supabase
    .from("courses")
    .select("id, created_by")
    .eq("id", material.course_id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const isOwnerTeacher = profile?.role === "teacher" && course?.created_by === user.id;

  if (!isAdmin && !isOwnerTeacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await r2.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: material.file_key,
    })
  );

  await supabase.from("course_materials").delete().eq("id", materialId);

  return NextResponse.json({ success: true });
}