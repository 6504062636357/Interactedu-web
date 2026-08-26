// app/teacher/page.tsx
import { redirect } from "next/navigation";
export default function TeacherHomePage(): never {
  redirect("/dashboard/teacher");
}
