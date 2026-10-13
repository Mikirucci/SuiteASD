"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, SearchX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, ConfirmDialog, DataList, EmptyState, Input, PillFilter, useToast } from "@/components/ui";
import { usePermission } from "@/features/tesserati/use-permission";
import { LoadMore } from "@/features/quote/load-more";
import { useCursorQuery } from "@/features/quote/use-cursor-query";
import { useDebouncedValue } from "@/features/quote/use-debounced-value";
import { describeError, useApiMutation, type QueryParams } from "@/lib/api";
import { ResourceFormDialog, type ResourceDialogState } from "./resource-form-dialog";
import { ResourceRow } from "./resource-row";
import type { ResourceConfig } from "./types";

const PAGE_SIZE = 25;

export interface ResourceViewProps<T extends { id: string }> {
  config: ResourceConfig<T>;
  /** Fixed query parameters of the page (for example the year of the ledger). */
  extraQuery?: QueryParams;
  /** Filters of the page that live next to the search box. */
  toolbarExtra?: ReactNode;
  /** True when `toolbarExtra` narrows the list: the empty state then offers to clear the filters. */
  extraFiltersActive?: boolean;
  onResetExtraFilters?: () => void;
}

/** List with search, filter, create, edit and delete for any resource described by a ResourceConfig. */
export function ResourceView<T extends { id: string }>({
  config,
  extraQuery,
  toolbarExtra,
  extraFiltersActive = false,
  onResetExtraFilters,
}: ResourceViewProps<T>) {
  const { copy, filter } = config;
  const canWrite = usePermission(config.writePermission);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [form, setForm] = useState<ResourceDialogState<T> | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const q = useDebouncedValue(search.trim());

  const query: QueryParams = { ...extraQuery, q: q || undefined, ...(filter && filterValue ? { [filter.param]: filterValue } : {}), limit: PAGE_SIZE };
  const list = useCursorQuery<T>([config.key, query], config.path, query);

  const remove = useApiMutation((item: T, client) => client.delete<void>(`${config.path}/${item.id}`), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [config.key] }),
  });

  const hasFilters = q !== "" || filterValue !== "" || extraFiltersActive;
  const resetFilters = () => {
    setSearch("");
    setFilterValue("");
    onResetExtraFilters?.();
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting, {
      onSuccess: () => {
        toast({ title: copy.deletedToast, description: config.nameOf(deleting), tone: "success" });
        setDeleting(null);
      },
    });
  };

  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create" })}>
      {copy.newLabel}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-title text-fg">{copy.plural}</h2>
        {list.items && list.items.length > 0 ? newButton : null}
      </div>

      {config.searchLabel || filter || toolbarExtra ? (
        <div className="flex flex-col gap-3">
          {config.searchLabel ? (
            <Input
              label={config.searchLabel}
              hideLabel
              type="search"
              placeholder={config.searchLabel}
              leadingIcon={<Search />}
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}
          {filter ? <PillFilter label={filter.label} options={filter.options} value={filterValue} onChange={setFilterValue} /> : null}
          {toolbarExtra}
        </div>
      ) : null}

      <DataList
        label={copy.plural}
        items={list.items}
        getKey={(item) => item.id}
        renderItem={(item) => {
          const editable = canWrite && !config.isReadOnly?.(item);
          return (
            <ResourceRow
              content={config.row(item)}
              name={config.nameOf(item)}
              onEdit={editable ? () => setForm({ mode: "edit", item }) : undefined}
              onDelete={editable ? () => { remove.reset(); setDeleting(item); } : undefined}
            />
          );
        }}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        loadingLabel={copy.loadingLabel}
        empty={
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="Nessun risultato"
              description="Nessun elemento corrisponde ai filtri scelti."
              action={
                <Button variant="secondary" onClick={resetFilters}>
                  Azzera i filtri
                </Button>
              }
            />
          ) : (
            <EmptyState icon={config.icon} title={copy.emptyTitle} description={copy.emptyDescription} action={newButton} />
          )
        }
      />
      <LoadMore list={list} noun={copy.countNoun} moreLabel={copy.moreLabel} />

      <ResourceFormDialog config={config} state={form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Eliminare ${config.nameOf(deleting)}?` : ""}
        description={copy.deleteDescription}
        confirmLabel="Elimina"
        onConfirm={confirmDelete}
        loading={remove.isPending}
        error={remove.error ? describeError(remove.error) : null}
      />
    </div>
  );
}
