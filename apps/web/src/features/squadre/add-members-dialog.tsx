"use client";

import { Search, SearchX } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  DataBoundary,
  Dialog,
  DialogClose,
  DialogContent,
  EmptyState,
  Input,
  LoadMore,
  useToast,
} from "@/components/ui";
import { fullNameOf, teamLabel } from "@/features/tesserati/document-format";
import type { MemberListItem, Team } from "@/features/tesserati/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { useAddTeamMembers, useMemberPicker } from "./api";

function PickerRow({
  member,
  team,
  checked,
  onToggle,
}: {
  member: MemberListItem;
  team: Team;
  checked: boolean;
  onToggle: (member: MemberListItem) => void;
}) {
  const inside = member.teams.some((ref) => ref.id === team.id);
  const others = member.teams.filter((ref) => ref.id !== team.id);
  return (
    <li className="rounded-md px-2 transition-colors hover:bg-ink-50">
      <Checkbox
        checked={checked || inside}
        disabled={inside}
        onChange={() => onToggle(member)}
        label={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Avatar name={fullNameOf(member)} size="sm" decorative />
            <span className="font-semibold">{fullNameOf(member)}</span>
            {inside ? <Badge variant="success">Già in squadra</Badge> : null}
            {!inside && others.length > 0 ? (
              <span className="text-xs text-fg-muted">{others.map((ref) => teamLabel(ref)).join(", ")}</span>
            ) : null}
          </span>
        }
      />
    </li>
  );
}

function AddMembersContent({ team, onClose }: { team: Team; onClose: () => void }) {
  const { toast } = useToast();
  const add = useAddTeamMembers(team.id);
  const [search, setSearch] = useState("");
  // The chosen people stay chosen while the search changes underneath them
  const [chosen, setChosen] = useState<ReadonlyMap<string, MemberListItem>>(new Map());
  const debounced = useDebouncedValue(search);
  const q = search === "" ? "" : debounced.trim();
  const picker = useMemberPicker(q, true);

  function toggle(member: MemberListItem) {
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(member.id)) next.delete(member.id);
      else next.set(member.id, member);
      return next;
    });
  }

  function confirm() {
    add.mutate([...chosen.keys()], {
      onSuccess: ({ added }) => {
        toast({ title: `${pluralize(added, "atleta aggiunto", "atleti aggiunti")}`, description: team.name, tone: "success" });
        onClose();
      },
    });
  }

  const count = chosen.size;
  return (
    <DialogContent
      className="max-w-xl"
      title={`Aggiungi atleti a ${team.name}`}
      description="Cerca per nome, spunta chi vuoi aggiungere e conferma: entrano tutti insieme."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Annulla</Button>
          </DialogClose>
          <Button disabled={count === 0} loading={add.isPending} onClick={confirm}>
            {count === 0 ? "Aggiungi alla squadra" : `Aggiungi ${pluralize(count, "atleta", "atleti")}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {add.isError ? <Alert tone="danger">{describeError(add.error)}</Alert> : null}
        <Input
          label="Cerca tesserato"
          hideLabel
          type="search"
          autoFocus
          placeholder="Cerca per nome o cognome"
          leadingIcon={<Search />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <DataBoundary
          isLoading={picker.isLoading}
          error={picker.error}
          onRetry={picker.refetch}
          isEmpty={(picker.items?.length ?? 0) === 0}
          loadingLabel="Caricamento dei tesserati"
          skeletonRows={5}
          empty={
            <EmptyState
              className="shadow-none"
              icon={SearchX}
              title="Nessun tesserato trovato"
              description={q ? "Prova con un altro nome." : "Non ci sono ancora tesserati: aggiungili dalla pagina Tesserati."}
            />
          }
        >
          <ul aria-label="Tesserati da aggiungere" className="flex flex-col">
            {picker.items?.map((member) => (
              <PickerRow key={member.id} member={member} team={team} checked={chosen.has(member.id)} onToggle={toggle} />
            ))}
          </ul>
        </DataBoundary>
        <LoadMore list={picker} noun="Tesserati" moreLabel="Mostra altri tesserati" />
      </div>
    </DialogContent>
  );
}

export interface AddMembersDialogProps {
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Fills a team quickly: search the society's members, tick the ones to add, confirm once. */
export function AddMembersDialog({ team, open, onOpenChange }: AddMembersDialogProps) {
  // Mounted only while open: nothing is asked of the API before, and every opening starts with no one chosen
  if (!open) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AddMembersContent team={team} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
