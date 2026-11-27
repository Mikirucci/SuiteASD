import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { DataExport } from "./data-export";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ me: { permissions: auth.permissions } }) }));

const saved = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("@/features/tesserati/api", () => ({ saveBlob: (_: Blob, name: string) => saved.names.push(name) }));

beforeEach(() => {
  auth.permissions = ["personalData:exportOwn"];
  saved.names = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataExport", () => {
  it("downloads the file with the name the server gives", async () => {
    const { count } = stubApi({
      "GET /me/data-export": () =>
        new Response('{"sections":[]}', {
          status: 200,
          headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="i-miei-dati-2026-11-27.json"' },
        }),
    });
    const { container } = renderWithProviders(<DataExport />);

    await userEvent.click(screen.getByRole("button", { name: "Scarica i miei dati" }));

    await waitFor(() => expect(saved.names).toEqual(["i-miei-dati-2026-11-27.json"]));
    expect(count("GET /me/data-export")).toBe(1);
    await expectNoA11yViolations(container);
  });

  it("says so when the download fails", async () => {
    stubApi({ "GET /me/data-export": () => problem(500, "internal_error") });
    renderWithProviders(<DataExport />);

    await userEvent.click(screen.getByRole("button", { name: "Scarica i miei dati" }));

    expect(await screen.findByText("Download non riuscito")).toBeInTheDocument();
    expect(saved.names).toEqual([]);
  });

  it("is not offered without the permission", () => {
    auth.permissions = [];
    renderWithProviders(<DataExport />);
    expect(screen.queryByRole("button", { name: "Scarica i miei dati" })).not.toBeInTheDocument();
  });
});
