import { randomUUID } from "node:crypto";
import { API_ORIGIN } from "./api-origin";

/** Password of every account created by the helpers of this folder. */
export const DEMO_PASSWORD = "Demo1234!";

export type DemoRole = "admin" | "segreteria" | "allenatore" | "staff" | "atleta" | "genitore";

export interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

/** Everything the specs assert on: names and numbers are decided here, in one place. */
export interface DemoSociety {
  name: string;
  people: Record<DemoRole, Person>;
  /** Teams by name, with their ids */
  teams: { serieD: string; u16: string; u12: string };
  teamNames: { serieD: string; u16: string; u12: string };
  /** The 'Sara Conti' of the story: U16, certificate expiring in `certificateDays` days, followed by the guardian account */
  sara: { fullName: string; certificateDays: number };
  /** The athlete behind the `atleta` account: in the Serie D squad */
  athleteMember: string;
  /** Alice is in the Serie D squad with a pending fee of the plan below: the writing specs pay it */
  alice: { fullName: string };
  match: { title: string; opponent: string; daysAhead: number; time: string; round: number; confirmed: number; slots: number };
  standings: { competition: string; group: string; order: { name: string; points: number }[] };
  feePlan: { name: string; amountEuro: number; paid: number; overdue: number; overdueEuro: number };
  automations: { total: number; toggled: { key: string; name: string } };
  venue: string;
  enrolmentCode: string;
}

const NAMES = {
  serieD: "Serie D",
  u16: "U16",
  u12: "U12",
};

const ATHLETES_SERIE_D = [
  ["Alice", "Moretti"],
  ["Beatrice", "Galli"],
  ["Chiara", "Fontana"],
  ["Diletta", "Marini"],
  ["Elisa", "Greco"],
  ["Federica", "Bruno"],
  ["Giada", "Colombo"],
  ["Irene", "Ricci"],
  ["Laura", "Costa"],
  ["Martina", "Gentile"],
  ["Noemi", "Villa"],
  ["Giulia", "Ferri"],
] as const;

interface Created {
  id: string;
}

interface Session {
  accessToken: string;
  user: { id: string };
}

interface ProblemBody {
  detail?: string;
  title?: string;
}

/** One call to the Java API; a failure carries the answer of the server, so a broken seed explains itself. */
async function call<T>(method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const problem = JSON.parse(text) as ProblemBody;
      detail = problem.detail ?? problem.title ?? text;
    } catch {
      // Not JSON: the raw text is the best explanation
    }
    throw new Error(`${method} ${path} -> ${response.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A calendar day, `days` ahead of today in the society's time zone, as the date input wants it (YYYY-MM-DD). */
export function dayAhead(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(date);
}

/** How the week strip names a day, `days` ahead of today: "30 novembre". */
export function dayLabel(days: number): string {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" }).format(new Date(`${dayAhead(days)}T12:00:00Z`));
}

/** The instant of a Rome wall-clock time, with its offset (the offset changes with daylight saving). */
function romeInstant(day: string, time: string): string {
  const probe = new Date(`${day}T${time}:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part ?? "");
  const offset = match ? `${match[1]}${(match[2] ?? "0").padStart(2, "0")}:${match[3] ?? "00"}` : "+00:00";
  return `${day}T${time}:00${offset}`;
}

/** Runs `read` until it returns something: the read side of the backend can trail a write by a moment. */
async function waitFor<T>(read: () => Promise<T | undefined>, failure: string): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(failure);
}

function person(role: string, firstName: string, lastName: string, stamp: number): Person {
  return { firstName, lastName, email: `${role}.${stamp}@aquilevolley.it` };
}

/**
 * Builds a whole society through the public API: the staff accounts of every role, three teams with their squads,
 * a league with a table, a match with answers, a fee plan with payments, and the secondary sections. Emails are unique
 * per call, so every spec file can have its own society on the shared database.
 */
export async function createDemoSociety(): Promise<DemoSociety> {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const people: Record<DemoRole, Person> = {
    admin: person("admin", "Rita", "Bianchi", stamp),
    segreteria: person("segreteria", "Paola", "Neri", stamp),
    allenatore: person("allenatore", "Davide", "Rossi", stamp),
    staff: person("staff", "Luca", "Serra", stamp),
    atleta: person("atleta", "Giulia", "Ferri", stamp),
    genitore: person("genitore", "Elena", "Conti", stamp),
  };
  const society = "Aquile Volley";

  const registered = await call<Session>("POST", "/auth/register", null, {
    societyName: society,
    admin: { ...people.admin, password: DEMO_PASSWORD },
  });
  const token = registered.accessToken;

  // Teams and squads
  const team = async (name: string, category: string): Promise<string> =>
    (await call<Created>("POST", "/teams", token, { name, category, sport: "VOLLEY", gender: "FEMALE" })).id;
  const teams = { serieD: await team(NAMES.serieD, "Serie D"), u16: await team(NAMES.u16, "U16"), u12: await team(NAMES.u12, "U12") };

  const member = async (firstName: string, lastName: string, birthDate: string, teamIds: string[]): Promise<string> =>
    (await call<Created>("POST", "/members", token, { firstName, lastName, birthDate, gender: "FEMALE", status: "ACTIVE", teamIds })).id;
  const memberIds: Record<string, string> = {};
  for (const [first, last] of ATHLETES_SERIE_D) memberIds[`${first} ${last}`] = await member(first, last, "2003-04-12", [teams.serieD]);
  const saraId = await member("Sara", "Conti", "2010-02-01", [teams.u16]);
  await member("Marta", "Leone", "2010-06-18", [teams.u16]);
  await member("Ilaria", "Pace", "2013-09-09", [teams.u12]);

  // Sara's medical certificate runs out in 15 days
  const documentTypes = await call<{ data: { id: string; key: string }[] }>("GET", "/document-types", token);
  const certificate = documentTypes.data.find((type) => type.key === "MEDICAL_CERTIFICATE");
  if (!certificate) throw new Error("The new society has no medical certificate document type");
  const certificateDays = 15;
  const upload = new URLSearchParams({ documentTypeId: certificate.id, issuedAt: dayAhead(-300), expiresAt: dayAhead(certificateDays) });
  const uploaded = await fetch(`${API_ORIGIN}/api/v1/members/${saraId}/documents/upload?${upload.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", Authorization: `Bearer ${token}` },
    body: "%PDF-1.4 certificato di prova",
  });
  if (!uploaded.ok) throw new Error(`Upload of the certificate -> ${uploaded.status}: ${await uploaded.text()}`);

  // Accounts, by invitation (the real way in): every role but the administrator
  const invite = async (role: string, who: Person, memberId?: string): Promise<Session> => {
    const invitation = await call<{ token: string }>("POST", "/invitations", token, { role, email: who.email, memberId });
    return call<Session>("POST", "/invitations/accept", null, {
      token: invitation.token,
      firstName: who.firstName,
      lastName: who.lastName,
      password: DEMO_PASSWORD,
    });
  };
  await invite("SEGRETERIA", people.segreteria);
  await invite("ALLENATORE", people.allenatore);
  await invite("STAFF", people.staff);
  await invite("ATLETA", people.atleta, memberIds["Giulia Ferri"]);
  await invite("GENITORE", people.genitore, saraId);

  // The league and its table: Aquile Volley first
  const season = await call<Created>("POST", "/seasons", token, {
    name: "Stagione 2026/27",
    startsOn: "2026-09-01T00:00:00Z",
    endsOn: "2027-06-30T00:00:00Z",
    isCurrent: true,
  });
  const competition = await call<Created>("POST", "/competitions", token, {
    seasonId: season.id,
    name: "Serie D",
    kind: "LEAGUE",
    sport: "VOLLEY",
    pointsRules: { "3-0": [3, 0], "3-1": [3, 0], "3-2": [2, 1] },
  });
  const group = await call<Created>("POST", `/competitions/${competition.id}/groups`, token, { name: "Girone B" });
  const slot = async (name: string, ours?: string): Promise<string> =>
    (await call<Created>("POST", `/competitions/${competition.id}/groups/${group.id}/teams`, token, ours ? { teamId: ours } : { name })).id;
  const aquile = await slot("Aquile Volley", teams.serieD);
  const falchi = await slot("Falchi Volley");
  const delfini = await slot("Delfini Volley");
  const leoni = await slot("Leoni Volley");
  const tigri = await slot("Tigri Volley");
  const played: [string, string, number, number][] = [
    [aquile, falchi, 3, 0],
    [aquile, delfini, 3, 1],
    [aquile, leoni, 3, 0],
    [aquile, tigri, 3, 0],
    [falchi, delfini, 3, 0],
    [falchi, leoni, 3, 1],
    [falchi, tigri, 3, 0],
    [delfini, leoni, 3, 0],
    [delfini, tigri, 3, 2],
    [leoni, tigri, 3, 0],
  ];
  for (const [round, [home, away, homeSets, awaySets]] of played.entries()) {
    const created = await call<Created>("POST", `/competitions/${competition.id}/groups/${group.id}/matches`, token, {
      round: Math.floor(round / 2) + 1,
      homeTeamId: home,
      awayTeamId: away,
    });
    await call("PUT", `/matches/${created.id}/result`, token, { homeSets, awaySets, playedAt: `${dayAhead(-20)}T19:00:00+01:00` });
  }

  // The next match, on the calendar and in the league (the return leg against Delfini, round 6)
  const matchDays = 10;
  const match = { title: "Aquile Volley vs Delfini Volley", opponent: "Delfini Volley", daysAhead: matchDays, time: "20:30", round: 6, confirmed: 5, slots: 12 };
  const venue = await call<Created>("POST", "/venues", token, {
    name: "Palazzetto dello Sport",
    address: "Via dello Sport 1",
    city: "Verona",
    capacity: 300,
  });
  const event = await call<Created>("POST", "/events", token, {
    type: "MATCH",
    title: match.title,
    startsAt: romeInstant(dayAhead(matchDays), match.time),
    teamId: teams.serieD,
    venueId: venue.id,
    maxConvocations: match.slots,
  });
  await call("POST", `/competitions/${competition.id}/groups/${group.id}/matches`, token, {
    round: match.round,
    homeTeamId: aquile,
    awayTeamId: delfini,
    eventId: event.id,
    playedAt: romeInstant(dayAhead(matchDays), match.time),
  });
  // Trainings of the squad: the athlete finds them waiting for an answer
  for (const days of [2, 4, 6]) {
    await call("POST", "/events", token, {
      type: "TRAINING",
      title: "Allenamento Serie D",
      startsAt: romeInstant(dayAhead(days), "19:00"),
      teamId: teams.serieD,
    });
  }
  // Sent, so that the athletes see them (a convocation not sent yet is invisible to its owner)
  await call("POST", `/events/${event.id}/convocations/send`, token, undefined, { "Idempotency-Key": randomUUID() });
  // Five of the twelve athletes have an account and have already said yes to the match: only they can answer
  for (const [first, last] of ATHLETES_SERIE_D.slice(0, match.confirmed)) {
    const who = person(`atleta.${first.toLowerCase()}`, first, last, stamp);
    const session = await invite("ATLETA", who, memberIds[`${first} ${last}`]);
    const convocation = await waitFor(async () => {
      const mine = await call<{ data: { id: string; event: { id: string } }[] }>("GET", "/convocations", session.accessToken);
      return mine.data.find((c) => c.event.id === event.id);
    }, `${first} ${last} has no convocation for the match`);
    await call("PUT", `/convocations/${convocation.id}/response`, session.accessToken, { status: "CONFIRMED" });
  }

  // The fee plan: twelve fees, four paid; a second plan, long overdue, for the youngest team
  const feePlan = { name: "Quota novembre", amountEuro: 60, paid: 4, overdue: 1, overdueEuro: 60 };
  await call("POST", "/fee-plans", token, {
    name: feePlan.name,
    kind: "MONTHLY",
    amountCents: feePlan.amountEuro * 100,
    teamIds: [teams.serieD],
    dueDates: [dayAhead(20)],
  });
  await call("POST", "/fee-plans", token, {
    name: "Quota ottobre",
    kind: "MONTHLY",
    amountCents: feePlan.overdueEuro * 100,
    teamIds: [teams.u12],
    dueDates: [dayAhead(-30)],
  });
  const fees = await call<{ data: { id: string; memberName: string; description: string }[] }>("GET", "/fees?limit=100", token);
  const toPay = fees.data.filter((fee) => fee.description.includes(feePlan.name) && !fee.memberName.startsWith("Alice")).slice(0, feePlan.paid);
  for (const fee of toPay) {
    await call("POST", `/fees/${fee.id}/pay`, token, { method: "CASH" }, { "Idempotency-Key": randomUUID() });
  }

  // Secondary sections
  await call("POST", "/sponsors", token, { name: "Pasticceria Rossi", amountCents: 150000, status: "ACTIVE" });
  await call("POST", "/ledger/entries", token, {
    kind: "EXPENSE",
    category: "Materiale",
    description: "Palloni da gara",
    amountCents: 18000,
    occurredOn: dayAhead(-5),
  });
  await call("POST", "/announcements", token, { title: "Cena sociale", body: "Sabato sera, tutti invitati.", isPinned: false });
  await call("POST", "/referees", token, { firstName: "Mario", lastName: "Fabbri" });
  await call("POST", "/trips", token, { destination: "Bologna", departAt: romeInstant(dayAhead(9), "14:00"), transport: "MINIBUS", status: "PLANNED" });
  await call("POST", "/kits", token, { item: "Maglia gara" });

  // The enrolment link of the U16 squad, used by the registration spec
  const link = await call<{ code: string }>("POST", "/join-links", token, { teamId: teams.u16, label: "Iscrizioni U16" });

  const automations = await call<{ data: { key: string; name: string }[] }>("GET", "/automations", token);
  const toggled = automations.data.find((item) => item.key === "fee-reminders");
  if (!toggled) throw new Error("The automation fee-reminders is not offered by the backend");

  return {
    name: society,
    people,
    teams,
    teamNames: NAMES,
    sara: { fullName: "Sara Conti", certificateDays },
    athleteMember: "Giulia Ferri",
    alice: { fullName: "Alice Moretti" },
    match,
    standings: {
      competition: "Serie D",
      group: "Girone B",
      order: [
        { name: NAMES.serieD, points: 12 },
        { name: "Falchi Volley", points: 9 },
        { name: "Delfini Volley", points: 5 },
        { name: "Leoni Volley", points: 3 },
        { name: "Tigri Volley", points: 1 },
      ],
    },
    feePlan,
    automations: { total: automations.data.length, toggled: { key: toggled.key, name: toggled.name } },
    venue: "Palazzetto dello Sport",
    enrolmentCode: link.code,
  };
}
