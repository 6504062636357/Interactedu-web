"use client";

import { useEffect } from "react";

export function useCourseLearningStart(courseId: string, lessonId: string, ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    // This runs only when the learning room mounts, never during Link prefetch
    // or while browsing the course overview. The RPC makes retries idempotent.
    void fetch("/api/student/course-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, lessonId }),
    }).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
    }).catch((error: unknown) => {
      console.warn("บันทึกการเริ่มเรียนไม่สำเร็จ", error);
    });
  }, [courseId, lessonId, ready]);
}
