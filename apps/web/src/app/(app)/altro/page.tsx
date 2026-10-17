import { redirect } from "next/navigation";

/** The "Altro" hub is gone: its sections live in the menu groups. The pages below /altro keep their URLs. */
export default function AltroRoute() {
  redirect("/");
}
