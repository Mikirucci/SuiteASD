import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Opens the "⋯" menu of a record and chooses one of its items, the way a person does. */
export async function pickFromMenu(trigger: string | RegExp, item: string | RegExp): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: trigger }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}
