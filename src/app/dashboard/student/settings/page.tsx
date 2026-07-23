import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";
import SettingsClient from "@/components/SettingsClient";

interface Profile {
  full_name: string | null;
  marketing_consent: boolean | null;
  analytics_consent: boolean | null;
  contact_consent: boolean | null;
}

export default async function SettingsPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, marketing_consent, analytics_consent, contact_consent")
    .eq("id", user!.id)
    .maybeSingle();

  const typedProfile = profile as Profile | null;

  const fullName =
    typedProfile?.full_name ?? (user!.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <SettingsClient
      fullName={fullName}
      email={user!.email ?? ""}
      marketingConsent={typedProfile?.marketing_consent ?? null}
      analyticsConsent={typedProfile?.analytics_consent ?? null}
      contactConsent={typedProfile?.contact_consent ?? null}
    />
  );
}