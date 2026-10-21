"use client";

import { useApiQuery } from "@/lib/api";
import type { KitGroup } from "../types";

// The key starts with "kits": every write of the generic list refreshes the groups too.
export function useKitGroups() {
  return useApiQuery<{ data: KitGroup[] }>(["kits", "groups"], "/kits/groups");
}
