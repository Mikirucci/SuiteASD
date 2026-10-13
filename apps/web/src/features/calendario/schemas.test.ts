import { describe, expect, it } from "vitest";
import {
  emptyEventValues,
  eventFormSchema,
  toCreateBody,
  toRescheduleBody,
  toUpdateBody,
  valuesOfEvent,
  type EventValues,
} from "./schemas";
import { MATCH_EVENT, TRAINING_EVENT, at } from "./test-fixtures";

function values(overrides: Partial<EventValues> = {}): EventValues {
  return { ...emptyEventValues("2026-11-12"), title: "Allenamento", startTime: "19:00", ...overrides };
}

function messagesOf(input: EventValues): string[] {
  const result = eventFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("event form validation", () => {
  it("accepts a minimal event", () => {
    expect(messagesOf(values())).toEqual([]);
  });

  it("asks for title, day and start time", () => {
    expect(messagesOf(values({ title: "  ", date: "", startTime: "" }))).toEqual([
      "Inserisci il titolo dell'evento",
      "Inserisci una data valida",
      "Inserisci l'ora di inizio",
    ]);
  });

  it("requires the end after the start", () => {
    expect(messagesOf(values({ endTime: "18:00" }))).toEqual(["La fine deve essere dopo l'inizio"]);
    expect(messagesOf(values({ endTime: "20:30" }))).toEqual([]);
  });

  it("limits the convocation slots to 1-40", () => {
    expect(messagesOf(values({ type: "MATCH", maxConvocations: "41" }))).toEqual(["Inserisci un numero da 1 a 40"]);
    expect(messagesOf(values({ type: "MATCH", maxConvocations: "12" }))).toEqual([]);
  });

  it("checks the end of a weekly series only when the training repeats", () => {
    expect(messagesOf(values({ repeatCount: "1" }))).toEqual([]);
    expect(messagesOf(values({ repeat: true, repeatCount: "1" }))).toEqual(["Inserisci un numero da 2 a 100"]);
    expect(messagesOf(values({ repeat: true, repeatEnd: "until", repeatUntil: "2026-11-12" }))).toEqual([
      "Scegli un giorno dopo il primo allenamento",
    ]);
    expect(messagesOf(values({ repeat: true, repeatEnd: "until", repeatUntil: "2026-12-17" }))).toEqual([]);
  });
});

describe("request bodies", () => {
  it("creates a one-off event leaving out the empty fields", () => {
    expect(toCreateBody(values({ type: "MEETING", title: "Riunione", startTime: "18:00" }))).toEqual({
      type: "MEETING",
      title: "Riunione",
      startsAt: at(11, 12, 18, 0),
    });
  });

  it("creates a weekly series of trainings", () => {
    const body = toCreateBody(
      values({ teamId: "t-sd", venueId: "v-palestra", endTime: "20:30", repeat: true, repeatInterval: "2", repeatCount: "10" }),
    );
    expect(body).toEqual({
      type: "TRAINING",
      title: "Allenamento",
      startsAt: at(11, 12, 19, 0),
      endsAt: at(11, 12, 20, 30),
      teamId: "t-sd",
      venueId: "v-palestra",
      recurrence: { frequency: "WEEKLY", interval: 2, count: 10 },
    });
    expect(toCreateBody(values({ repeat: true, repeatEnd: "until", repeatUntil: "2026-12-17" })).recurrence).toEqual({
      frequency: "WEEKLY",
      interval: 1,
      until: "2026-12-17",
    });
  });

  it("never sends a recurrence for events other than trainings", () => {
    expect(toCreateBody(values({ type: "MATCH", repeat: true, repeatCount: "5" })).recurrence).toBeUndefined();
  });

  it("clears the optional fields of an edited event with null", () => {
    const edited = valuesOfEvent(TRAINING_EVENT);
    expect(toUpdateBody({ ...edited, endTime: "", teamId: "", venueId: "", notes: "" })).toEqual({
      title: "Allenamento",
      startsAt: TRAINING_EVENT.startsAt,
      endsAt: null,
      teamId: null,
      venueId: null,
      notes: null,
    });
  });

  it("sends the convocation slots only for matches and tournaments", () => {
    expect(toUpdateBody({ ...valuesOfEvent(MATCH_EVENT), maxConvocations: "14" }).maxConvocations).toBe(14);
    expect(toUpdateBody({ ...valuesOfEvent(MATCH_EVENT), maxConvocations: "" }).maxConvocations).toBeNull();
    expect(toCreateBody(values({ maxConvocations: "14" })).maxConvocations).toBeUndefined();
    expect(toCreateBody(values({ type: "TOURNAMENT", maxConvocations: "14" })).maxConvocations).toBe(14);
  });

  it("starts the edit form from the event as it is", () => {
    expect(valuesOfEvent(MATCH_EVENT)).toMatchObject({
      type: "MATCH",
      date: "2026-11-14",
      startTime: "20:30",
      endTime: "22:30",
      teamId: "t-sd",
      venueId: "v-palazzetto",
      maxConvocations: "",
    });
  });

  it("moves the end together with the start when rescheduling", () => {
    expect(toRescheduleBody({ date: "2026-11-19", startTime: "19:30", venueId: "v-palazzetto" }, TRAINING_EVENT)).toEqual({
      startsAt: at(11, 19, 19, 30),
      endsAt: at(11, 19, 21, 0),
      venueId: "v-palazzetto",
    });
    expect(toRescheduleBody({ date: "2026-11-19", startTime: "19:30", venueId: "" }, { ...TRAINING_EVENT, endsAt: null })).toEqual({
      startsAt: at(11, 19, 19, 30),
      venueId: null,
    });
  });
});
