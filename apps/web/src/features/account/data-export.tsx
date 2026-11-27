"use client";

import { Download } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { saveBlob } from "@/features/tesserati/api";
import { usePermission } from "@/hooks/use-permission";
import { describeError, useApiMutation } from "@/lib/api";

const FALLBACK_NAME = "i-miei-dati.json";

/** Downloads everything the society keeps about the person (and their children) as one JSON file: GDPR art. 15 and 20. */
function useDataExport() {
  return useApiMutation(async (_: void, client) => {
    const file = await client.download("/me/data-export");
    saveBlob(file.blob, file.filename ?? FALLBACK_NAME);
  });
}

/** "Scarica i miei dati": a copy of the person's data, readable by them and by any other program. */
export function DataExport() {
  const allowed = usePermission("personalData:exportOwn");
  const exportData = useDataExport();
  const { toast } = useToast();
  if (!allowed) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-base font-bold text-fg">I tuoi dati</h3>
      <p className="text-sm text-fg-muted">
        Scarica una copia di tutto quello che la società conserva su di te e sui figli collegati: anagrafica, documenti,
        quote, convocazioni, presenze, pagelle pubblicate e notifiche. I file dei documenti non sono inclusi.
      </p>
      <div>
        <Button
          variant="secondary"
          leftIcon={<Download />}
          loading={exportData.isPending}
          onClick={() =>
            exportData.mutate(undefined, {
              onError: (error) => toast({ title: "Download non riuscito", description: describeError(error), tone: "danger" }),
            })
          }
        >
          Scarica i miei dati
        </Button>
      </div>
    </div>
  );
}
