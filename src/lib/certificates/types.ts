export interface CertificateRecord {
  id: string;
  certificate_no: string;
  user_id: string;
  course_id: string;
  enrollment_id: string;
  attempt_id: string | null;
  score_percentage: number;
  pass_percentage: number;
  pdf_path: string;
  status: "issued" | "revoked";
  issued_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CertificateEligibilityReason =
  | "issued"
  | "already_issued"
  | "disabled"
  | "course_incomplete"
  | "score_below_threshold";

export interface EnsureCertificateResult {
  passed: boolean;
  scorePercentage: number;
  passPercentage: number;
  certificateIssued: boolean;
  certificate: CertificateRecord | null;
  reason: CertificateEligibilityReason;
  message: string;
}

