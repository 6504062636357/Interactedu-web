// components/FavoriteHeartButton.tsx
"use client";

import type { ReactElement } from "react";
import { Heart } from "lucide-react";
import { useFavoriteCourse } from "@/hooks/useFavoriteCourse";

export default function FavoriteHeartButton({ courseId }: { courseId: string }): ReactElement {
  const { isFavorite, isToggling, toggleFavorite } = useFavoriteCourse(courseId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleFavorite();
      }}
      disabled={isToggling}
      aria-label={isFavorite ? "ลบออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
      className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors disabled:opacity-50"
    >
      <Heart
        className={`w-[18px] h-[18px] transition-colors ${
          isFavorite ? "text-rose-500 fill-rose-500" : "text-slate-400"
        }`}
      />
    </button>
  );
}