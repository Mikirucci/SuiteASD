import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { configFieldsOf, configFormSchema, summarizeConfig, toConfigBody, toFormValues } from "./config";
import { describeAutomationError, describeResult, describeSchedule, describeTrigger, formatDuration, isManualRun } from "./format";

describe("describeSchedule", () => {
  it("turns the cron expressions of the backend into plain Italian", () => {
    expect(describeSchedule("0 9 * * *")).toBe("Ogni giorno alle 09:00");
    expect(describeSchedule("30 14 * * *")).toBe("Ogni giorno alle 14:30");
    expect(describeSchedule("*/10 * * * *")).toBe("Ogni 10 minuti");
  });

  it("says nothing about expressions it does not know", () => {
    expect(describeSchedule("0 9 * * 1")).toBeNull();
    expect(describeSchedule(null)).toBeNull();
  });

  it("describes event-driven automations by their trigger", () => {
    expect(describeTrigger({ kind: "EVENT", schedule: null })).toBe("Scatta da sola a ogni evento");
    expect(describeTrigger({ kind: "SCHEDULED", schedule: null })).toBeNull();
  });
});

describe("run helpers", () => {
  it("measures how long a run took", () => {
    expect(formatDuration("2026-11-12T08:00:00.000Z", null)).toBeNull();
    expect(formatDuration("2026-11-12T08:00:00.000Z", "2026-11-12T08:00:00.200Z")).toBe("meno di un secondo");
    expect(formatDuration("2026-11-12T08:00:00.000Z", "2026-11-12T08:00:02.000Z")).toBe("2 s");
    expect(formatDuration("2026-11-12T08:00:00.000Z", "2026-11-12T08:01:05.000Z")).toBe("1 min 5 s");
  });

  it("labels the counters it knows and skips the others", () => {
    expect(describeResult({ feesChecked: 12, remindersSent: 0, mystery: 4, sent: "x" })).toEqual([
      "Quote controllate: 12",
      "Promemoria inviati: 0",
    ]);
    expect(describeResult(null)).toEqual([]);
  });

  it("recognises manual runs by their key", () => {
    expect(isManualRun({ runKey: "manual:2026-11-12T08:00:00.000Z" })).toBe(true);
    expect(isManualRun({ runKey: "2026-11-12" })).toBe(false);
  });
});

describe("describeAutomationError", () => {
  it("uses Italian wording for the codes of the automations API", () => {
    const refused = new ApiError(409, { type: "about:blank", title: "Conflict", status: 409, code: "automation_disabled" });
    expect(describeAutomationError(refused)).toBe("L'attività è disattivata: attivala prima di eseguirla.");
  });

  it("falls back to the shared wording", () => {
    const other = new ApiError(500, { type: "about:blank", title: "Error", status: 500, code: "internal" });
    expect(describeAutomationError(other)).toBe("Il servizio non è disponibile al momento. Riprova tra poco.");
  });
});

describe("automation settings", () => {
  it("summarizes the stored settings of each automation", () => {
    expect(summarizeConfig("fee-reminders", { beforeDueDays: [1, 7], afterDueDays: [3] })).toEqual([
      "Promemoria: 1 e 7 giorni prima della scadenza",
      "Solleciti: 3 giorni dopo la scadenza",
      "Avvisa: nell'app e per email",
    ]);
    expect(summarizeConfig("fee-reminders", { beforeDueDays: [1], afterDueDays: [], channels: ["EMAIL"] })).toEqual([
      "Promemoria: 1 giorno prima della scadenza",
      "Solleciti: nessuno",
      "Avvisa: per email",
    ]);
    expect(summarizeConfig("certificate-reminders", { thresholdsDays: [0, 7, 15, 30], channels: ["IN_APP"] })).toEqual([
      "Avvisi: alla scadenza, 7, 15 e 30 giorni prima",
      "Avvisa: nell'app",
    ]);
    expect(summarizeConfig("convocation-dispatch", { daysBefore: 3, remindNonRespondents: true, reminderDaysBefore: 1, channels: ["IN_APP"] })).toEqual([
      "Convocazioni: 3 giorni prima dell'evento",
      "Promemoria a chi non risponde: 1 giorno prima",
      "Avvisa: nell'app",
    ]);
    expect(summarizeConfig("convocation-dispatch", { daysBefore: 1, remindNonRespondents: false, reminderDaysBefore: 1, channels: ["IN_APP"] })).toEqual([
      "Convocazioni: 1 giorno prima dell'evento",
      "Promemoria a chi non risponde: disattivato",
      "Avvisa: nell'app",
    ]);
    expect(summarizeConfig("missing-documents", { graceDays: 3, everyDays: 7, channels: ["IN_APP", "EMAIL"] })).toEqual([
      "Primo sollecito: dopo 3 giorni dall'iscrizione",
      "Poi ogni 7 giorni",
      "Avvisa: nell'app e per email",
    ]);
    expect(summarizeConfig("admin-digest", { everyDays: 7, channels: ["IN_APP"] })).toEqual(["Ogni lunedì", "Avvisa: nell'app"]);
    expect(summarizeConfig("admin-digest", { everyDays: 1, channels: ["IN_APP"] })).toEqual(["Ogni 1 giorno", "Avvisa: nell'app"]);
    expect(summarizeConfig("sponsor-expiry", { thresholdsDays: [7, 30], channels: ["IN_APP"] })).toEqual([
      "Avvisi: 7 e 30 giorni prima della fine del contratto",
      "Avvisa: nell'app",
    ]);
    expect(summarizeConfig("notifications-dispatch", { maxAttempts: 3, batchSize: 100 })).toEqual([
      "Tentativi per email: 3",
      "Email per ciclo: fino a 100",
    ]);
    expect(summarizeConfig("standings", {})).toEqual([]);
  });

  it("has no form for automations without settings", () => {
    expect(configFieldsOf("standings")).toEqual([]);
    expect(configFieldsOf("receipts")).toEqual([]);
  });

  it("round-trips settings through the form values", () => {
    const fields = configFieldsOf("convocation-dispatch");
    const stored = { hour: 7, channels: ["EMAIL"], daysBefore: 3, remindNonRespondents: true, reminderDaysBefore: 0 };
    const values = toFormValues(fields, stored);
    expect(values).toEqual({
      hour: "7",
      channels_IN_APP: false,
      channels_EMAIL: true,
      daysBefore: "3",
      remindNonRespondents: true,
      reminderDaysBefore: "0",
    });
    expect(toConfigBody(fields, values)).toEqual(stored);
  });

  it("offers both channels when the society never saved the settings", () => {
    const values = toFormValues(configFieldsOf("admin-digest"), { everyDays: 7 });
    expect([values.channels_IN_APP, values.channels_EMAIL]).toEqual([true, true]);
  });

  it("validates day lists and numbers against the limits of the API", () => {
    const schema = configFormSchema(configFieldsOf("fee-reminders"));
    const issues = (before: string, after: string) => {
      const result = schema.safeParse({ hour: "9", channels_IN_APP: true, channels_EMAIL: false, beforeDueDays: before, afterDueDays: after });
      return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    };
    expect(issues("1, 7", "3 10")).toEqual([]);
    expect(issues("", "")).toEqual([]);
    expect(issues("0", "3")).toEqual(["beforeDueDays: Ogni valore va da 1 a 60"]);
    expect(issues("1,2,3,4,5,6", "3")).toEqual(["beforeDueDays: Al massimo 5 valori"]);
    expect(issues("1", "121")).toEqual(["afterDueDays: Ogni valore va da 1 a 120"]);
    expect(issues("uno", "3")).toEqual(["beforeDueDays: Ogni valore va da 1 a 60"]);

    // The hour is one of the 24 of the day and at least one channel must stay on
    const base = { beforeDueDays: "1", afterDueDays: "3", channels_IN_APP: true, channels_EMAIL: false };
    expect(schema.safeParse({ ...base, hour: "24" }).success).toBe(false);
    expect(schema.safeParse({ ...base, hour: "" }).success).toBe(false);
    expect(schema.safeParse({ ...base, hour: "0" }).success).toBe(true);
    expect(schema.safeParse({ ...base, hour: "9", channels_IN_APP: false }).success).toBe(false);

    const numbers = configFormSchema(configFieldsOf("notifications-dispatch"));
    expect(numbers.safeParse({ maxAttempts: "11", batchSize: "100" }).success).toBe(false);
    expect(numbers.safeParse({ maxAttempts: "3", batchSize: "" }).success).toBe(false);
    expect(numbers.safeParse({ maxAttempts: "3", batchSize: "500" }).success).toBe(true);
  });
});
