import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createQueryClient } from "./providers";

describe("the query client of the app", () => {
  it("reads the movements, the balance and the reports again after anything is saved: the sections feed them", async () => {
    const client = createQueryClient();
    for (const key of [["ledger", "summary"], ["ledger", "trend"], ["reports", "summary"], ["sponsors", "summary"]]) client.setQueryData(key, {});

    await new MutationObserver(client, { mutationFn: async () => "saved" }).mutate();

    expect(client.getQueryState(["ledger", "summary"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["ledger", "trend"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["reports", "summary"])?.isInvalidated).toBe(true);
    // what has nothing to do with the money is left alone
    expect(client.getQueryState(["sponsors", "summary"])?.isInvalidated).toBe(false);
  });

  it("does not touch them when a save fails", async () => {
    const client = createQueryClient();
    client.setQueryData(["ledger", "summary"], {});
    await new MutationObserver(client, {
      mutationFn: async () => {
        throw new Error("no");
      },
    })
      .mutate()
      .catch(() => undefined);
    expect(client.getQueryState(["ledger", "summary"])?.isInvalidated).toBe(false);
  });
});
