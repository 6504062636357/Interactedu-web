import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ certificateId: string }> }
) {
  const { certificateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  let query = supabase
    .from("certificates")
    .select("id, certificate_no, user_id, pdf_path, status")
    .eq("id", certificateId);
  if (profile?.role !== "admin") query = query.eq("user_id", user.id);

  const { data: certificate, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!certificate) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  if (certificate.status !== "issued") {
    return NextResponse.json({ error: "Certificate has been revoked" }, { status: 410 });
  }

  const { data: pdf, error: downloadError } = await supabase.storage
    .from("certificates")
    .download(certificate.pdf_path);
  if (downloadError) return NextResponse.json({ error: downloadError.message }, { status: 500 });

  return new NextResponse(await pdf.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFileName(certificate.certificate_no)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

