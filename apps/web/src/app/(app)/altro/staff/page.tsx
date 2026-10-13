import type { Metadata } from "next";
import { StaffPage } from "@/features/altro/resource-pages";

export const metadata: Metadata = { title: "Staff" };

export default function StaffRoute() {
  return <StaffPage />;
}
