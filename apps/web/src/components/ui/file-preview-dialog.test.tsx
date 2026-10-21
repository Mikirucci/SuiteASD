import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type DownloadedFile } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { FilePreviewDialog } from "./file-preview-dialog";

const saveFile = vi.hoisted(() => vi.fn<(file: unknown, fallbackName: string) => void>());
vi.mock("@/lib/save-file", () => ({ saveFile }));

const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  saveFile.mockReset();
  URL.createObjectURL = () => {
    const url = `blob:preview-${created.length + 1}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fileOf(type: string, filename: string | null = null): DownloadedFile {
  return { blob: new Blob(["contenuto"], { type }), filename };
}

function renderPreview(props: Partial<ComponentProps<typeof FilePreviewDialog>> = {}) {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const load = vi.fn<() => Promise<DownloadedFile>>(async () => fileOf("application/pdf"));
  const view = render(
    <FilePreviewDialog
      open
      onOpenChange={onOpenChange}
      title="Certificato medico"
      fileName="certificato-conti.pdf"
      load={load}
      {...props}
    />,
  );
  return { ...view, onOpenChange, load };
}

describe("FilePreviewDialog", () => {
  it("shows a skeleton with a status while the file is downloading", async () => {
    let finish: (file: DownloadedFile) => void = () => undefined;
    renderPreview({ load: () => new Promise<DownloadedFile>((resolve) => (finish = resolve)) });
    const dialog = screen.getByRole("dialog", { name: "Certificato medico" });
    expect(within(dialog).getByRole("status", { name: "Caricamento dell'anteprima" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Scarica" })).not.toBeInTheDocument();
    finish(fileOf("application/pdf"));
    expect(await within(dialog).findByTitle("Anteprima di Certificato medico")).toBeInTheDocument();
  });

  it("shows an image with a descriptive alternative text", async () => {
    renderPreview({ load: async () => fileOf("image/png") });
    const image = await screen.findByRole("img", { name: "Anteprima di Certificato medico" });
    expect(image).toHaveAttribute("src", "blob:preview-1");
  });

  it("shows a PDF in a frame with an accessible title", async () => {
    renderPreview({ load: async () => fileOf("application/pdf") });
    const frame = await screen.findByTitle("Anteprima di Certificato medico");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "blob:preview-1");
  });

  it("falls back to the declared type when the download carries none", async () => {
    renderPreview({ load: async () => fileOf(""), mimeType: "image/jpeg" });
    expect(await screen.findByRole("img", { name: "Anteprima di Certificato medico" })).toBeInTheDocument();
  });

  it("says the preview is not available for other types and still offers the download", async () => {
    renderPreview({ load: async () => fileOf("application/msword"), fileName: "modulo.doc" });
    expect(await screen.findByText("Anteprima non disponibile per questo tipo di file")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Anteprima di Certificato medico")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Scarica" }));
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(saveFile.mock.calls[0]?.[1]).toBe("modulo.doc");
  });

  it("downloads the file that is already loaded, without asking the server again", async () => {
    const { load } = renderPreview();
    await screen.findByTitle("Anteprima di Certificato medico");
    await userEvent.click(screen.getByRole("button", { name: "Scarica" }));
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("explains the problem in Italian and retries", async () => {
    const load = vi
      .fn<() => Promise<DownloadedFile>>()
      .mockRejectedValueOnce(new ApiError(500, { type: "about:blank", title: "Internal", status: 500, code: "internal_error" }))
      .mockResolvedValue(fileOf("image/png"));
    renderPreview({ load });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Il servizio non è disponibile al momento");
    expect(within(alert).queryByText(/Internal/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scarica" })).not.toBeInTheDocument();

    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("img", { name: "Anteprima di Certificato medico" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("releases the temporary address when it closes", async () => {
    const { unmount } = renderPreview();
    await screen.findByTitle("Anteprima di Certificato medico");
    expect(revoked).toEqual([]);
    unmount();
    expect(revoked).toEqual(["blob:preview-1"]);
  });

  it("does not create an address for a download that finished after closing", async () => {
    let finish: (file: DownloadedFile) => void = () => undefined;
    const { unmount } = renderPreview({ load: () => new Promise<DownloadedFile>((resolve) => (finish = resolve)) });
    unmount();
    finish(fileOf("application/pdf"));
    await waitFor(() => expect(created).toEqual([]));
  });

  it("closes with Escape and with the close button, and renders nothing when closed", async () => {
    const { onOpenChange, rerender } = renderPreview();
    await screen.findByTitle("Anteprima di Certificato medico");
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);

    rerender(
      <FilePreviewDialog
        open={false}
        onOpenChange={onOpenChange}
        title="Certificato medico"
        fileName="certificato-conti.pdf"
        load={async () => fileOf("application/pdf")}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a named dialog without detectable accessibility violations", async () => {
    renderPreview({ load: async () => fileOf("image/png") });
    const dialog = screen.getByRole("dialog", { name: "Certificato medico" });
    expect(dialog).toHaveAccessibleDescription("certificato-conti.pdf");
    await screen.findByRole("img", { name: "Anteprima di Certificato medico" });
    await expectNoA11yViolations(dialog);
  });
});
