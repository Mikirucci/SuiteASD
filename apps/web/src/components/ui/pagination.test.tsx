import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { Pagination } from "./pagination";

const base = { pageSize: 20, onPageChange: () => undefined };

describe("Pagination", () => {
  it("says which results are on screen and where the reader is", () => {
    render(<Pagination {...base} page={2} totalPages={3} total={45} />);
    const nav = screen.getByRole("navigation", { name: "Paginazione" });
    expect(nav).toHaveTextContent("21-40 di 45");
    expect(nav).toHaveTextContent("Pagina 2 di 3");
  });

  it("cuts the range at the last result of the last page", () => {
    render(<Pagination {...base} page={3} totalPages={3} total={45} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("41-45 di 45");
  });

  it("goes to the neighbouring pages and stops at both ends", async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination {...base} page={1} totalPages={3} total={45} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "Precedente" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Successiva" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    rerender(<Pagination {...base} page={3} totalPages={3} total={45} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "Successiva" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Precedente" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("is not there when everything fits on one page", () => {
    const { container } = render(<Pagination {...base} page={1} totalPages={1} total={12} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("still offers the way back when the page asked for is past the end", async () => {
    const onPageChange = vi.fn();
    render(<Pagination {...base} page={4} totalPages={3} total={45} onPageChange={onPageChange} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("45 in tutto");
    await userEvent.click(screen.getByRole("button", { name: "Precedente" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("has no accessibility violations and can be named", async () => {
    const { container } = render(<Pagination {...base} page={2} totalPages={3} total={45} label="Pagine delle persone" />);
    expect(screen.getByRole("navigation", { name: "Pagine delle persone" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
