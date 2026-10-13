"use client";

import { useState } from "react";
import { SectionHeading, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { CenterPanel } from "./center-panel";
import { PreferencesPanel } from "./preferences-panel";

type NotificheTab = "centro" | "preferenze";

/** Module 07: the notification center of the signed-in user and their channel preferences per notification type. */
export function NotifichePage() {
  const [tab, setTab] = useState<NotificheTab>("centro");

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        index={7}
        label="Notifiche"
        title="Avvisi a tutti, al momento giusto."
        highlight="al momento giusto."
        description="Convocazioni, quote, scadenze e comunicazioni arrivano da sole. Qui li rileggi e scegli come riceverli."
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value === "preferenze" ? "preferenze" : "centro")}>
        <TabsList aria-label="Sezioni delle notifiche">
          <TabsTrigger value="centro">Centro notifiche</TabsTrigger>
          <TabsTrigger value="preferenze">Preferenze</TabsTrigger>
        </TabsList>
        <TabsContent value="centro">
          <CenterPanel />
        </TabsContent>
        <TabsContent value="preferenze">
          <PreferencesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
