import type { ReactElement } from "react";
import NotificationList from "@/components/notifications/NotificationList";

export default function NotificationsPage(): ReactElement {
  return (
    <main className="min-h-screen bg-[#F6F7FA] px-5 py-8 sm:px-7 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <NotificationList />
      </div>
    </main>
  );
}

