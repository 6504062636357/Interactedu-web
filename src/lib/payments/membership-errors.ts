type DatabaseError = { code?: string; message?: string } | null;

export function isMissingMembershipSchema(error: DatabaseError): boolean {
  return Boolean(error && ["PGRST205", "42P01", "42703", "PGRST204"].includes(error.code ?? "")
    && /membership_settings|student_membership_orders|membership_order_id|access_expires_at/.test(error.message ?? ""));
}
