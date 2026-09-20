import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ certificateId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (actor?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { certificateId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateId)) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  const { data: certificate, error } = await supabase.from("certificates")
    .select("certificate_no, pdf_path").eq("id", certificateId).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load certificate" }, { status: 500 });
  if (!certificate?.pdf_path) return NextResponse.json({ error: "Certificate PDF not found" }, { status: 404 });

  // Admins can inspect the original stored PDF even after revocation.
  const { data: pdf, error: downloadError } = await supabase.storage.from("certificates").download(certificate.pdf_path);
  if (downloadError || !pdf) return NextResponse.json({ error: "Unable to load certificate PDF" }, { status: 502 });
  const filename = certificate.certificate_no.replace(/[^a-zA-Z0-9._-]/g, "-");
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(await pdf.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
