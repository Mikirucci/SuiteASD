import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { SocietyLogoPanel } from "./society-logo-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function png(size = 100, type = "image/png"): File {
  return new File([new Uint8Array(size)], "logo.png", { type });
}

describe("SocietyLogoPanel", () => {
  it("offers to load the logo when there is none, and sends the image as it is", async () => {
    const api = stubApi({ "PUT /promotions/society-logo": () => new Response(null, { status: 204 }) });
    const { container } = renderWithProviders(<SocietyLogoPanel logoUrl={null} />);
    expect(screen.getByText(/Senza un logo le card mostrano le iniziali/)).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.upload(screen.getByLabelText("File del logo"), png());

    expect(await screen.findByText("Logo salvato")).toBeInTheDocument();
    const call = api.calls.find((item) => item.method === "PUT");
    expect(call?.headers["Content-Type"]).toBe("image/png");
  });

  it("refuses a file that is not a PNG or a JPG, and one that is too heavy, without calling the server", async () => {
    const api = stubApi({});
    renderWithProviders(<SocietyLogoPanel logoUrl={null} />);

    await userEvent.upload(screen.getByLabelText("File del logo"), new File(["%PDF"], "logo.pdf", { type: "application/pdf" }), { applyAccept: false });
    expect(await screen.findByText("Il logo deve essere un'immagine PNG o JPG.")).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText("File del logo"), png(512 * 1024 + 1));
    expect(await screen.findByText("Il logo è troppo pesante: al massimo 512 KB.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("explains a refusal of the server", async () => {
    stubApi({ "PUT /promotions/society-logo": () => problem(422, "invalid_logo") });
    renderWithProviders(<SocietyLogoPanel logoUrl={null} />);

    await userEvent.upload(screen.getByLabelText("File del logo"), png());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows the logo, lets it be replaced and removes it", async () => {
    const api = stubApi({ "DELETE /promotions/society-logo": () => json(204) });
    renderWithProviders(<SocietyLogoPanel logoUrl="blob:logo" />);
    expect(screen.getByRole("img", { name: "Il logo della società" })).toHaveAttribute("src", "blob:logo");
    expect(screen.getByRole("button", { name: "Sostituisci il logo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Togli il logo" }));

    expect(await screen.findByText("Logo tolto")).toBeInTheDocument();
    expect(api.count("DELETE /promotions/society-logo")).toBe(1);
  });
});
