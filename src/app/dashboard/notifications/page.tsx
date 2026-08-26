import type { ReactElement } from "react";
import NotificationList from "@/components/notifications/NotificationList";
import AppBrand from "@/components/AppBrand";

export default function NotificationsPage(): ReactElement {
  return (
    <div className="app-canvas min-h-screen">
      <header className="app-topbar sticky top-0 z-40"><div className="mx-auto flex h-[74px] max-w-5xl items-center px-5 sm:px-7"><AppBrand compact /></div></header>
      <main className="px-5 py-7 sm:px-7 lg:py-10">
        <div className="app-surface mx-auto max-w-4xl p-5 sm:p-7 lg:p-9"><NotificationList /></div>
      </main>
    </div>
  );
}

