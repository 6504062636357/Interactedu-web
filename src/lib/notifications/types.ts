export const NOTIFICATION_TYPES = [
  "system",
  "payment_approved",
  "payment_rejected",
  "course_access_granted",
  "lesson_completed",
  "exercise_passed",
  "exercise_failed",
  "certificate_issued",
  "payment_slip_pending",
  "course_review_pending",
  "certificate_generation_failed",
  "course_approved",
  "course_rejected",
  "student_completed_course",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_type: string | null;
  related_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

