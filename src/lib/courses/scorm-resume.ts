interface ResumeManifestItem {
  identifier?: string;
  href?: string | null;
  type?: "lesson" | "quiz";
  kind?: "lesson" | "quiz";
  startSeconds?: number;
  endSeconds?: number;
  children?: ResumeManifestItem[];
}

interface ResumeSelectionInput {
  entryPoint: string | null;
  manifest: { items?: ResumeManifestItem[] } | null;
  scormSource: "generated" | "imported";
  completedScos: string[];
  resumeSeconds: number;
  videoCompleted: boolean;
}

function flattenPlayableItems(items: ResumeManifestItem[]): ResumeManifestItem[] {
  const result: ResumeManifestItem[] = [];
  for (const item of items) {
    if (item.href) result.push(item);
    if (item.children?.length) result.push(...flattenPlayableItems(item.children));
  }
  return result;
}

/** Selects the SCO that should open when a learner returns to a lesson. */
export function selectResumeScoPath(input: ResumeSelectionInput): string | null {
  const allItems = flattenPlayableItems(input.manifest?.items ?? []);
  const playableItems = input.scormSource === "imported"
    ? allItems
    : allItems.filter((item) =>
        item.type !== "quiz" && item.kind !== "quiz" && item.identifier?.includes("QUIZ") !== true
      );

  if (playableItems.length === 0 || input.videoCompleted) {
    return input.entryPoint ?? playableItems[0]?.href ?? null;
  }

  const completed = new Set(input.completedScos);
  const incompleteItems = playableItems.filter((item) => item.href && !completed.has(item.href));

  // Generated chapters share one video timeline. Prefer the unfinished chapter
  // containing the saved CMI location so a learner who skipped around returns
  // to the exact chapter they last watched.
  if (input.scormSource === "generated" && input.resumeSeconds > 0) {
    const itemAtSavedTime = incompleteItems.find((item) =>
      typeof item.startSeconds === "number" &&
      typeof item.endSeconds === "number" &&
      input.resumeSeconds >= item.startSeconds &&
      input.resumeSeconds < item.endSeconds
    );
    if (itemAtSavedTime?.href) return itemAtSavedTime.href;
  }

  return incompleteItems[0]?.href ?? input.entryPoint ?? playableItems[0]?.href ?? null;
}
