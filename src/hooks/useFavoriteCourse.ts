// hooks/useFavoriteCourse.ts
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export function useFavoriteCourse(courseId: string) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setIsLoading(false); return; }

      const { data } = await supabase
        .from("course_favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();

      if (active) {
        setIsFavorite(!!data);
        setIsLoading(false);
      }
    }
    void check();
    return () => { active = false; };
  }, [courseId]);

  const toggleFavorite = useCallback(async () => {
    setIsToggling(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsToggling(false); return; }

    if (isFavorite) {
      await supabase
        .from("course_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", courseId);
      setIsFavorite(false);
    } else {
      await supabase
        .from("course_favorites")
        .insert({ user_id: user.id, course_id: courseId });
      setIsFavorite(true);
    }
    setIsToggling(false);
  }, [courseId, isFavorite]);

  return { isFavorite, isLoading, isToggling, toggleFavorite };
}