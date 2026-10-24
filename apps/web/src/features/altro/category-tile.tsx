import { Building2, Bus, Receipt, Shirt, Whistle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { categoryBackground } from "./category-tone";

/** The categories the other sections book their costs under have the icon of that section. */
const USUAL_ICONS: Readonly<Record<string, LucideIcon>> = {
  palestre: Building2,
  divise: Shirt,
  trasferte: Bus,
  arbitri: Whistle,
};

/** The square at the start of an expense or of a group: the colour of its category, with the icon of its section if it has one. */
export function CategoryTile({ category, className }: { category: string; className?: string }) {
  const Icon = USUAL_ICONS[category.trim().toLocaleLowerCase("it-IT")] ?? Receipt;
  return (
    <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-md text-white", categoryBackground(category), className)}>
      <Icon className="size-5" />
    </span>
  );
}
