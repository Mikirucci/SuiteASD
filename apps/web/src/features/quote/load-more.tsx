import { Alert, Button } from "@/components/ui";
import { describeError } from "@/lib/api";
import type { CursorQueryResult } from "./use-cursor-query";

export interface LoadMoreProps {
  list: Pick<CursorQueryResult<unknown>, "items" | "hasNextPage" | "isFetchingNextPage" | "fetchNextPage" | "nextPageError">;
  /** Plural noun that starts the count line, e.g. "Quote". */
  noun: string;
  moreLabel: string;
}

/** Footer of a cursor-paginated list: how many rows are loaded and the button for the next page. */
export function LoadMore({ list, noun, moreLabel }: LoadMoreProps) {
  const count = list.items?.length ?? 0;
  if (count === 0) return null;
  return (
    <div className="flex flex-col items-center gap-3 pt-1">
      {list.nextPageError ? <Alert tone="danger">{describeError(list.nextPageError)}</Alert> : null}
      <p className="text-sm text-fg-muted">
        {list.hasNextPage ? `${noun} mostrate: ${count}, ce ne sono altre` : `${noun} in tutto: ${count}`}
      </p>
      {list.hasNextPage ? (
        <Button variant="secondary" loading={list.isFetchingNextPage} onClick={list.fetchNextPage}>
          {moreLabel}
        </Button>
      ) : null}
    </div>
  );
}
