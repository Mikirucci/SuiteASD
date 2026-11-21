"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, SearchX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, ConfirmDialog, DataList, EmptyState, Input, LoadMore, Select, useToast } from "@/components/ui";
import { AttachmentsDialog, type AttachmentsTarget } from "@/features/attachments/attachments-dialog";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/cn";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, useApiMutation, type QueryParams } from "@/lib/api";
import type { AttachmentEntityType } from "@/features/attachments/api";
import { ResourceFormDialog, type ResourceDialogState } from "./resource-form-dialog";
import { ResourceRow } from "./resource-row";
import type { FormValues, ResourceConfig } from "./types";

const DEFAULT_PAGE_SIZE = 25;

export interface ResourceViewProps<T extends { id: string }> {
  config: ResourceConfig<T>;
  /** Fixed query parameters of the page (for example the year of the ledger). */
  extraQuery?: QueryParams;
  /** Filters of the page that live next to the search box. */
  toolbarExtra?: ReactNode;
  /** True when `toolbarExtra` narrows the list: the empty state then offers to clear the filters. */
  extraFiltersActive?: boolean;
  onResetExtraFilters?: () => void;
  /** `grid` lays the records out as cards side by side instead of a stack of rows. */
  layout?: "list" | "grid";
  /** Cards per row from the `xl` breakpoint up, for a grid whose cards carry long lines (emails). */
  columns?: 2 | 3;
  /** Fields of a new record filled in advance. */
  createPresets?: FormValues;
  /** Records per page; a grid reads better with a number that fills whole rows (12 for two or three columns). */
  pageSize?: number;
}

/**
 * List for any resource described by a ResourceConfig: one row with search, filter menu and the new-record button, then
 * the records, each with its actions behind a menu. Edit, delete and attachments are all reached from the record.
 */
export function ResourceView<T extends { id: string }>({
  config,
  extraQuery,
  toolbarExtra,
  extraFiltersActive = false,
  onResetExtraFilters,
  layout = "list",
  columns = 3,
  createPresets,
  pageSize = DEFAULT_PAGE_SIZE,
}: ResourceViewProps<T>) {
  const { copy, filter } = config;
  const canWrite = usePermission(config.writePermission);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [form, setForm] = useState<ResourceDialogState<T> | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [attachments, setAttachments] = useState<AttachmentsTarget | null>(null);
  const q = useDebouncedValue(search.trim());

  const query: QueryParams = { ...extraQuery, q: q || undefined, ...(filter && filterValue ? { [filter.param]: filterValue } : {}), limit: pageSize };
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
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create", presets: createPresets })}>
      {copy.newLabel}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="sr-only">{copy.plural}</h2>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
              className="sm:flex-1"
            />
          ) : (
            <div className="sm:flex-1" />
          )}
          {filter ? (
            <Select
              label={filter.label}
              hideLabel
              placeholder={filter.options.find((option) => option.value === "")?.label}
              options={filter.options.filter((option) => option.value !== "")}
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
              className="sm:w-52"
            />
          ) : null}
          {list.items && list.items.length > 0 ? <div className="shrink-0 [&>button]:w-full">{newButton}</div> : null}
        </div>
        {toolbarExtra}
      </div>

      <DataList
        label={copy.plural}
        className={layout === "grid" ? cn("grid auto-rows-fr gap-4 sm:grid-cols-2", columns === 3 && "xl:grid-cols-3") : undefined}
        items={list.items}
        getKey={(item) => item.id}
        renderItem={(item) => {
          const editable = canWrite && !config.isReadOnly?.(item);
          return (
            <ResourceRow
              content={config.row(item)}
              name={config.nameOf(item)}
              stacked={layout === "grid"}
              onEdit={editable ? () => setForm({ mode: "edit", item }) : undefined}
              onDelete={editable ? () => { remove.reset(); setDeleting(item); } : undefined}
              onAttachments={
                canWrite && config.attachmentType
                  ? () => setAttachments({ entityType: config.attachmentType as AttachmentEntityType, entityId: item.id, recordName: config.nameOf(item) })
                  : undefined
              }
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
      <AttachmentsDialog target={attachments} onClose={() => setAttachments(null)} />
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
