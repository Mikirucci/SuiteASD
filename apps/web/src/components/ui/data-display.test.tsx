import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { expectNoA11yViolations } from "@/test/a11y";
import { Alert } from "./alert";
import { Card, CardHeader } from "./card";
import { DataList, DataListRow } from "./data-list";
import { DataTable, type DataTableColumn } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { AppIcon, Logo } from "./logo";
import { SectionHeading } from "./section-heading";
import { Skeleton, SkeletonRows } from "./skeleton";

interface Row {
  id: string;
  name: string;
  team: string;
}

const ROWS: Row[] = [
  { id: "1", name: "Anna Ferri", team: "U18" },
  { id: "2", name: "Chiara Neri", team: "U16" },
];

const EMPTY = <EmptyState icon={Inbox} title="Nessun tesserato" description="Aggiungi la prima atleta." />;

describe("DataList", () => {
  function renderList(props: Partial<React.ComponentProps<typeof DataList<Row>>> = {}) {
    return render(
      <DataList<Row>
        items={ROWS}
        label="Tesserate"
        getKey={(row) => row.id}
        renderItem={(row) => <DataListRow title={row.name} subtitle={row.team} />}
        empty={EMPTY}
        {...props}
      />,
    );
  }

  it("renders one list item per row", () => {
    renderList();
    const list = screen.getByRole("list", { name: "Tesserate" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Anna Ferri")).toBeInTheDocument();
  });

  it("shows a busy skeleton while loading and hides the data", () => {
    renderList({ items: undefined, isLoading: true });
    expect(screen.getByRole("status", { name: "Caricamento in corso" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the empty state, with a way forward, when there is no data", () => {
    renderList({ items: [] });
    expect(screen.getByRole("heading", { name: "Nessun tesserato" })).toBeInTheDocument();
    expect(screen.getByText("Aggiungi la prima atleta.")).toBeInTheDocument();
  });

  it("shows a readable error and retries on request", async () => {
    const onRetry = vi.fn();
    renderList({ items: undefined, error: new ApiError(503, null), onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("Il servizio non è disponibile al momento");
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("explains network failures in plain Italian", () => {
    renderList({ items: undefined, error: new NetworkError() });
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile contattare il server");
  });

  it("prefers the error over stale data", () => {
    renderList({ error: new ApiError(500, null) });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations in every state", async () => {
    const { container } = render(
      <div>
        <DataList<Row> items={ROWS} label="Tesserate" getKey={(row) => row.id} renderItem={(row) => <DataListRow title={row.name} />} empty={EMPTY} />
        <DataList<Row> items={[]} label="Vuoto" getKey={(row) => row.id} renderItem={() => null} empty={EMPTY} />
        <DataList<Row> items={undefined} isLoading label="Caricamento" getKey={(row) => row.id} renderItem={() => null} empty={EMPTY} />
        <DataList<Row> items={undefined} error={new ApiError(500, null)} label="Errore" getKey={(row) => row.id} renderItem={() => null} empty={EMPTY} />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("DataTable", () => {
  const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "Tesserata", cell: (row) => row.name },
    { key: "team", header: "Squadra", cell: (row) => row.team, align: "right" },
  ];

  it("renders a table with headers and rows", () => {
    render(<DataTable rows={ROWS} columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />);
    const table = screen.getByRole("table", { name: "Tesserate" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Tesserata", "Squadra"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByRole("cell")[0]).toHaveTextContent("Anna Ferri")
  });

  it("keeps the chosen columns on one line and scrolls sideways instead of clipping, only when asked", () => {
    const nowrapColumns: DataTableColumn<Row>[] = [
      { key: "name", header: "Tesserata", cell: (row) => row.name, nowrap: true },
      { key: "team", header: "Squadra", cell: (row) => row.team },
    ];
    const { container, rerender } = render(
      <DataTable rows={ROWS} columns={nowrapColumns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />,
    );
    const [nameCell, teamCell] = within(screen.getAllByRole("row")[1] as HTMLElement).getAllByRole("cell");
    expect(nameCell).toHaveClass("md:whitespace-nowrap");
    expect(teamCell).not.toHaveClass("md:whitespace-nowrap");
    expect(screen.getAllByRole("columnheader")[0]).toHaveClass("md:whitespace-nowrap");
    expect(container.firstElementChild).toHaveClass("md:overflow-hidden");

    rerender(<DataTable rows={ROWS} columns={nowrapColumns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} scrollX />);
    expect(container.firstElementChild).toHaveClass("md:overflow-x-auto");
    expect(container.firstElementChild).not.toHaveClass("md:overflow-hidden");
  });

  it("repeats the column header inside each cell for the stacked mobile layout", () => {
    render(<DataTable rows={ROWS} columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />);
    const firstRow = within(screen.getAllByRole("row")[1] as HTMLElement);
    expect(firstRow.getAllByText("Squadra", { selector: "span[aria-hidden='true']" })).toHaveLength(1);
  });

  it("shows loading, empty and error states", () => {
    const { rerender } = render(
      <DataTable rows={undefined} isLoading columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />,
    );
    expect(screen.getByRole("status", { name: "Caricamento in corso" })).toBeInTheDocument();
    rerender(<DataTable rows={[]} columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />);
    expect(screen.getByText("Nessun tesserato")).toBeInTheDocument();
    rerender(<DataTable rows={undefined} error={new ApiError(403, null)} columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non hai i permessi");
  });

  it("opens a row on click when onRowClick is given, from any cell and from the button inside it with the keyboard", async () => {
    const onRowClick = vi.fn();
    const withButton: DataTableColumn<Row>[] = [
      { key: "name", header: "Tesserata", cell: (row) => <button type="button">{row.name}</button> },
      { key: "team", header: "Squadra", cell: (row) => row.team },
    ];
    render(<DataTable rows={ROWS} columns={withButton} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} onRowClick={onRowClick} />);

    await userEvent.click(screen.getByText("U16"));
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);
    screen.getByRole("button", { name: "Anna Ferri" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[0]);
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("does not make the rows clickable without onRowClick", () => {
    render(<DataTable rows={ROWS} columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />);
    expect(screen.getAllByRole("row")[1]).not.toHaveClass("cursor-pointer");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<DataTable rows={ROWS} columns={columns} getKey={(row) => row.id} label="Tesserate" empty={EMPTY} />);
    await expectNoA11yViolations(container);
  });
});

describe("EmptyState and ErrorState", () => {
  it("EmptyState can be the page heading", () => {
    render(<EmptyState as="h1" icon={Inbox} title="Nessuna notifica" />);
    expect(screen.getByRole("heading", { level: 1, name: "Nessuna notifica" })).toBeInTheDocument();
  });

  it("ErrorState hides the retry button when there is nothing to retry", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech, rows announce loading once", () => {
    const { container } = render(
      <div>
        <Skeleton className="h-4" />
        <SkeletonRows rows={3} label="Caricamento tesserati" />
      </div>,
    );
    expect(container.querySelector("div[aria-hidden='true']")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("SectionHeading", () => {
  it("renders the numbered badge, the label and underlines the keyword", () => {
    render(<SectionHeading index={1} label="Tesserati" title="Tutti i tesserati, in ordine." highlight="in ordine." />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Tesserati")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Tutti i tesserati, in ordine.");
    expect(within(heading).getByText("in ordine.")).toBeInTheDocument();
  });

  it("falls back to the plain title when the keyword is not in it", () => {
    render(<SectionHeading label="Quote" title="Quote incassate" highlight="assente" as="h1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Quote incassate" })).toBeInTheDocument();
  });
});

describe("Card, Alert and Logo", () => {
  it("Card header renders title, description and action", () => {
    render(
      <Card>
        <CardHeader title="Quote di novembre" description="4 promemoria inviati" action={<button type="button">Esporta</button>} />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Quote di novembre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esporta" })).toBeInTheDocument();
  });

  it("Alert uses role=alert for errors and role=status otherwise", () => {
    render(
      <div>
        <Alert tone="danger">Errore</Alert>
        <Alert tone="success">Fatto</Alert>
      </div>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Errore");
    expect(screen.getByRole("status")).toHaveTextContent("Fatto");
  });

  it("Logo exposes the product name once", () => {
    render(
      <div>
        <Logo />
        <AppIcon />
      </div>,
    );
    expect(screen.getByText("ASD")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "SuiteASD" })).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <div>
        <Alert tone="danger" title="Errore">
          Email non valida
        </Alert>
        <Card>
          <CardHeader title="Titolo" />
        </Card>
        <Logo />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
