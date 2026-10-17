import { describe, expect, it } from "vitest";
import { ADMIN_ENTRIES, isNavGroup } from "@/features/shell/nav-items";
import { SERVICES, resolveOtherSections, resolveServices } from "./services";
import { ADMIN_PERMISSIONS } from "./test-fixtures";

const ALL_ITEM_IDS = ADMIN_ENTRIES.flatMap((entry) => (isNavGroup(entry) ? entry.items.map((item) => item.id) : []));

describe("resolveServices", () => {
  it("offers the four services to the administration, links in the order of the menu", () => {
    const services = resolveServices(ADMIN_PERMISSIONS);
    expect(services.map((service) => service.definition.id)).toEqual(["persone", "calendario", "quote", "documenti"]);
    expect(services[0]?.links.map((link) => link.href)).toEqual(["/tesserati", "/squadre", "/inviti"]);
  });

  it("drops the services and the links the permissions do not allow", () => {
    const services = resolveServices(["members:read", "events:read"]);
    expect(services.map((service) => service.definition.id)).toEqual(["persone", "calendario"]);
    expect(services[0]?.links.map((link) => link.label)).toEqual(["Tesserati"]);
    expect(services[1]?.links.map((link) => link.label)).toEqual(["Calendario"]);
  });

  it("returns nothing for somebody who can open none of them", () => {
    expect(resolveServices(["notifications:readOwn"])).toEqual([]);
  });

  it("only points at pages that exist in the menu", () => {
    const ids = SERVICES.flatMap((service) => [service.mainId, ...service.linkIds]);
    for (const id of ids) expect(ALL_ITEM_IDS).toContain(id);
  });
});

describe("resolveOtherSections", () => {
  it("keeps the menu items no block of the home links, in their groups", () => {
    const sections = resolveOtherSections(ADMIN_PERMISSIONS);
    const byGroup = Object.fromEntries(sections.map((section) => [section.id, section.items.map((item) => item.id)]));
    expect(byGroup.logistica).toEqual(["palestre", "trasferte", "divise"]);
    expect(byGroup.attivita).toEqual(["tornei", "pagelle", "arbitri", "statistiche"]);
    expect(byGroup.persone).toEqual(["staff"]);
    // Linked by a service or by the lower level of the home
    expect(Object.values(byGroup).flat()).not.toContain("tesserati");
    expect(Object.values(byGroup).flat()).not.toContain("bilancio");
    expect(Object.values(byGroup).flat()).not.toContain("notifiche");
  });

  it("leaves out the groups the user cannot open anything of", () => {
    expect(resolveOtherSections(["notifications:readOwn"]).map((section) => section.id)).toEqual([]);
  });
});
