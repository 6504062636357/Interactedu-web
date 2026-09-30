"use client";

import { useEffect, type RefObject } from "react";

type VideoSeekGuardOptions = {
  courseId: string;
  lessonId: string;
  currentPath: string | null;
  apiReady: boolean;
  scormSource: "generated" | "imported" | null;
  completed: boolean;
  chapterStartSeconds: number;
  chapterEndSeconds?: number;
  resumeSeconds: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
};

export function useVideoSeekGuard({ courseId, lessonId, currentPath, apiReady, scormSource, completed, chapterStartSeconds, chapterEndSeconds, resumeSeconds, iframeRef }: VideoSeekGuardOptions): void {
  useEffect(() => {
    if (!apiReady || !currentPath || scormSource !== "generated" || completed) return;

    const iframeElement = iframeRef.current;
    if (!iframeElement) return;

    let video: HTMLVideoElement | null = null;
    let detachVideo: (() => void) | undefined;
    let cancelled = false;
    let loaded = false;
    let preview = false;
    let unlocked = false;
    const savedResume = Number.isFinite(resumeSeconds) && resumeSeconds >= chapterStartSeconds
      && (chapterEndSeconds === undefined || resumeSeconds < chapterEndSeconds)
      ? resumeSeconds : chapterStartSeconds;
    let maxWatched = Math.max(0, chapterStartSeconds, savedResume);
    let lastNaturalTime = maxWatched;
    let lastNaturalAt = performance.now();
    let warned = false;
    let requestQueue: Promise<void> = Promise.resolve();

    const payload = (active: boolean) => JSON.stringify({ courseId, lessonId, positionSeconds: Math.max(0, maxWatched), active });

    function send(active: boolean): void {
      if (!loaded || preview || unlocked) return;
      const body = payload(active);
      requestQueue = requestQueue.catch(() => undefined).then(async () => {
        const response = await fetch("/api/student/video-watch-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
        if (!response.ok) throw new Error(String(response.status));
        const result = await response.json() as { maxWatchedSeconds?: number };
        if (!cancelled && Number.isFinite(result.maxWatchedSeconds)) {
          maxWatched = Math.max(maxWatched, Number(result.maxWatchedSeconds));
        }
      }).catch((error: unknown) => {
        if (!warned) {
          warned = true;
          console.warn("บันทึกตำแหน่งที่ดูวิดีโอไม่สำเร็จ", error);
        }
      });
    }

    function clampSeek(): void {
      if (!video || preview || unlocked) return;
      const allowed = Math.max(chapterStartSeconds, maxWatched) + 0.75;
      if (video.currentTime > allowed) video.currentTime = allowed;
    }

    function attachVideo(): void {
      detachVideo?.();
      try {
        video = iframeElement!.contentDocument?.querySelector("video") ?? null;
      } catch {
        video = null;
      }
      if (!video) return;

      const currentVideo = video;
      lastNaturalTime = currentVideo.currentTime;
      lastNaturalAt = performance.now();

      function onSeeking(): void {
        clampSeek();
      }

      function onSeeked(): void {
        lastNaturalTime = currentVideo.currentTime;
        lastNaturalAt = performance.now();
      }

      function onTimeUpdate(): void {
        if (preview || unlocked || currentVideo.paused || currentVideo.seeking) return;
        const now = performance.now();
        const delta = currentVideo.currentTime - lastNaturalTime;
        const elapsed = Math.max(0, (now - lastNaturalAt) / 1000);
        if (delta > elapsed * 2.25 + 0.75) {
          clampSeek();
        } else if (delta >= 0) {
          maxWatched = Math.max(maxWatched, currentVideo.currentTime);
        }
        lastNaturalTime = currentVideo.currentTime;
        lastNaturalAt = now;
      }

      function onPlay(): void {
        lastNaturalTime = currentVideo.currentTime;
        lastNaturalAt = performance.now();
        send(true);
      }

      function onPause(): void {
        send(false);
      }

      function onEnded(): void {
        send(false);
        unlocked = true;
      }

      currentVideo.addEventListener("seeking", onSeeking);
      currentVideo.addEventListener("seeked", onSeeked);
      currentVideo.addEventListener("timeupdate", onTimeUpdate);
      currentVideo.addEventListener("play", onPlay);
      currentVideo.addEventListener("pause", onPause);
      currentVideo.addEventListener("ended", onEnded);
      clampSeek();

      detachVideo = () => {
        currentVideo.removeEventListener("seeking", onSeeking);
        currentVideo.removeEventListener("seeked", onSeeked);
        currentVideo.removeEventListener("timeupdate", onTimeUpdate);
        currentVideo.removeEventListener("play", onPlay);
        currentVideo.removeEventListener("pause", onPause);
        currentVideo.removeEventListener("ended", onEnded);
      };
    }

    attachVideo();
    iframeElement.addEventListener("load", attachVideo);

    void fetch(`/api/student/video-watch-progress?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ maxWatchedSeconds?: number; preview?: boolean }>;
      })
      .then((result) => {
        if (cancelled) return;
        preview = result.preview === true;
        maxWatched = Math.max(maxWatched, Number(result.maxWatchedSeconds) || 0);
        loaded = true;
        clampSeek();
        if (video && !video.paused && !preview) send(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) console.warn("โหลดตำแหน่งที่ดูวิดีโอไม่สำเร็จ", error);
      });

    const heartbeat = window.setInterval(() => {
      if (video && !video.paused && !video.ended) send(true);
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      iframeElement.removeEventListener("load", attachVideo);
      if (video && !video.paused && loaded && !preview && !unlocked) {
        navigator.sendBeacon?.("/api/student/video-watch-progress", new Blob([payload(false)], { type: "application/json" }));
      }
      detachVideo?.();
    };
  }, [courseId, lessonId, currentPath, apiReady, scormSource, completed, chapterStartSeconds, chapterEndSeconds, resumeSeconds, iframeRef]);
}
