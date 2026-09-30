"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

type StudyTimeOptions = {
  courseId: string;
  lessonId: string;
  scormSource: "generated" | "imported" | null;
  currentPath: string | null;
  apiReady: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
};

const HEARTBEAT_MS = 15_000;

export function useStudentStudyTime({ courseId, lessonId, scormSource, currentPath, apiReady, iframeRef }: StudyTimeOptions): () => Promise<void> {
  const stopRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (!apiReady || !currentPath || !scormSource) return;

    let lastSentActive = false;
    let lastHeartbeatAt = 0;
    let warned = false;
    let requestQueue: Promise<void> = Promise.resolve();
    const payload = (active: boolean) => JSON.stringify({ courseId, lessonId, active });

    function send(active: boolean): Promise<void> {
      lastSentActive = active;
      lastHeartbeatAt = Date.now();
      requestQueue = requestQueue.then(async () => {
        const response = await fetch("/api/student/study-time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload(active),
          keepalive: true,
        });
        if (!response.ok) throw new Error(String(response.status));
      }).catch((error: unknown) => {
        if (!warned) {
          warned = true;
          console.warn("บันทึกเวลาเรียนไม่สำเร็จ", error);
        }
      });
      return requestQueue;
    }

    stopRef.current = () => lastSentActive ? send(false) : requestQueue;

    function isActive(): boolean {
      // The browser can report that the parent document has lost focus while
      // the learner is using the video controls inside the iframe.
      if (document.visibilityState !== "visible") return false;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return false;

      // Count video playback when a package exposes a video. Pauses do not count.
      try {
        const video = iframe.contentDocument?.querySelector("video");
        if (video) return !video.paused && !video.ended && video.readyState >= 2;
      } catch {
        // Third-party packages may not expose their document to the player.
      }

      // Other imported SCORM content is counted while its player is in the foreground.
      return scormSource === "imported";
    }

    function tick(): void {
      const active = isActive();
      if (active !== lastSentActive || (active && Date.now() - lastHeartbeatAt >= HEARTBEAT_MS)) {
        send(active);
      }
    }

    tick();
    const interval = window.setInterval(tick, 2_000);
    document.addEventListener("visibilitychange", tick);

    return () => {
      stopRef.current = async () => undefined;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      if (lastSentActive) {
        navigator.sendBeacon?.(
          "/api/student/study-time",
          new Blob([payload(false)], { type: "application/json" }),
        );
      }
    };
  }, [courseId, lessonId, scormSource, currentPath, apiReady, iframeRef]);

  return useCallback(() => stopRef.current(), []);
}
