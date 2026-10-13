import type { SeedContext, SeedStep } from './context.js';

// Secondary modules (SPEC "Tutto quello che serve, in un posto solo"): palestre, trasferte, divise, sponsor, bilancio,
// staff, bacheca, arbitri. Realistic data for a small volleyball club in Bologna.

const DAY_MS = 86_400_000;

function utc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

export const seedSecondary: SeedStep = async (context) => {
  await seedVenues(context);
  await seedStaff(context);
  await seedKits(context);
  const sponsors = await seedSponsors(context);
  await seedLedger(context, sponsors);
  await seedTrips(context);
  await seedAnnouncements(context);
  await seedReferees(context);
};

async function seedVenues({ prisma, societyId }: SeedContext): Promise<void> {
  await prisma.venue.createMany({
    data: [
      {
        societyId,
        name: 'Palazzetto dello Sport',
        address: 'Via Gino Cervi 10',
        city: 'Bologna',
        capacity: 400,
        availability: 'Sabato e domenica per le gare; martedi e giovedi 18:30-22:30',
        notes: 'Campo principale, spogliatoi con docce.',
      },
      {
        societyId,
        name: 'Palestra Scuola Carducci',
        address: 'Via Giosue Carducci 5',
        city: 'Bologna',
        capacity: 120,
        availability: 'Lunedi, mercoledi e venerdi 16:00-20:00',
        notes: 'Allenamenti del settore giovanile. Chiavi in segreteria.',
      },
      {
        societyId,
        name: 'Palestra Comunale di Casalecchio',
        address: 'Via dei Mille 22',
        city: 'Casalecchio di Reno',
        capacity: 200,
        availability: 'Giovedi 20:00-22:00',
        notes: 'Impianto in convenzione con il comune.',
      },
    ],
  });
}

async function seedStaff(context: SeedContext): Promise<void> {
  const { prisma, societyId } = context;
  const people = [
    {
      firstName: 'Marco',
      lastName: 'Villa',
      email: context.users.allenatore.email,
      userId: context.users.allenatore.id,
      role: 'COACH',
      qualifications: 'Allenatore 2 grado FIPAV',
      teams: [['Serie D', 'HEAD_COACH'], ['Prima Divisione', 'HEAD_COACH']],
    },
    {
      firstName: 'Silvia',
      lastName: 'Fabbri',
      email: 'silvia.fabbri@aquilevolley.it',
      role: 'COACH',
      qualifications: 'Allenatore 1 grado FIPAV',
      teams: [['U18', 'HEAD_COACH'], ['U16', 'HEAD_COACH']],
    },
    {
      firstName: 'Davide',
      lastName: 'Monti',
      email: 'davide.monti@aquilevolley.it',
      role: 'COACH',
      qualifications: 'Istruttore giovanile',
      teams: [['U14', 'HEAD_COACH'], ['U12', 'HEAD_COACH'], ['U16', 'ASSISTANT_COACH']],
    },
    {
      firstName: 'Franco',
      lastName: 'Galli',
      email: context.users.staff.email,
      userId: context.users.staff.id,
      role: 'MANAGER',
      qualifications: 'Dirigente accompagnatore',
      teams: [['Serie D', 'MANAGER']],
    },
  ] as const;

  for (const person of people) {
    const staffMember = await prisma.staffMember.create({
      data: {
        societyId,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        role: person.role,
        qualifications: person.qualifications,
        ...('userId' in person ? { userId: person.userId } : {}),
      },
    });
    for (const [teamName, role] of person.teams) {
      const teamId = context.teamIds[teamName];
      if (!teamId) throw new Error(`Team ${teamName} is missing`);
      await prisma.teamStaff.create({ data: { societyId, teamId, staffMemberId: staffMember.id, role } });
    }
  }
}

async function seedKits({ prisma, societyId, memberIds }: SeedContext): Promise<void> {
  // The match jerseys of the Serie D athletes are assigned; the rest is warehouse stock.
  const serieD = await prisma.member.findMany({
    where: { societyId, teamMemberships: { some: { team: { name: 'Serie D' } } } },
    include: { teamMemberships: { select: { jerseyNumber: true } } },
    orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
  });
  await prisma.kit.createMany({
    data: serieD.map((member) => ({
      societyId,
      item: 'Maglia gara Serie D',
      size: member.kitSize,
      number: member.teamMemberships[0]?.jerseyNumber ?? null,
      condition: 'Ottima',
      memberId: member.id,
      assignedAt: utc(2025, 9, 20),
    })),
  });
  const giulia = memberIds['Giulia Rossi'];
  if (!giulia) throw new Error('Demo member Giulia Rossi is missing');
  await prisma.kit.createMany({
    data: [
      { societyId, item: 'Tuta di rappresentanza', size: 'M', condition: 'Buona', memberId: giulia, assignedAt: utc(2025, 9, 20) },
      ...(['XS', 'S', 'M', 'L'] as const).map((size) => ({ societyId, item: 'Maglia gara Serie D', size, condition: 'Nuova' })),
      { societyId, item: 'Maglia allenamento', size: 'S', condition: 'Buona' },
      { societyId, item: 'Maglia allenamento', size: 'M', condition: 'Buona' },
      { societyId, item: 'Borsone societario', condition: 'Nuova' },
    ],
  });
}

async function seedSponsors({ prisma, societyId }: SeedContext) {
  const rows = [
    {
      name: 'Autofficina Bianchi',
      contactName: 'Giorgio Bianchi',
      email: 'info@autofficinabianchi.example',
      phone: '051 555 0101',
      amountCents: 250_000,
      contractStart: utc(2026, 7, 1),
      contractEnd: utc(2027, 6, 30),
      status: 'ACTIVE',
      notes: 'Logo sulle maglie gara e sul sito.',
    },
    {
      name: 'Pasticceria Dolce Rete',
      contactName: 'Chiara Villani',
      email: 'ordini@dolcerete.example',
      amountCents: 80_000,
      contractStart: utc(2026, 9, 1),
      contractEnd: utc(2027, 5, 31),
      status: 'ACTIVE',
      notes: 'Rinfresco dopo le gare in casa.',
    },
    {
      name: 'Ferramenta Rossetti',
      contactName: 'Luca Rossetti',
      phone: '051 555 0188',
      amountCents: 120_000,
      contractStart: utc(2024, 7, 1),
      contractEnd: utc(2026, 6, 30),
      status: 'EXPIRED',
      notes: 'Contratto scaduto: proporre il rinnovo.',
    },
    {
      name: 'Studio Dentistico Sorrisi',
      contactName: 'Anna Marchesi',
      email: 'segreteria@sorrisi.example',
      amountCents: 150_000,
      status: 'PROSPECT',
      notes: 'Primo incontro fissato a novembre.',
    },
  ];
  const created = [];
  for (const row of rows) created.push(await prisma.sponsor.create({ data: { societyId, ...row } }));
  return created;
}

async function seedLedger({ prisma, societyId, users }: SeedContext, sponsors: { id: string; name: string }[]): Promise<void> {
  const sponsorId = (name: string) => sponsors.find((sponsor) => sponsor.name === name)?.id ?? null;
  const entry = (kind: 'INCOME' | 'EXPENSE', category: string, description: string, euros: number, occurredOn: Date, linkedSponsor?: string) => ({
    societyId,
    kind,
    category,
    description,
    amountCents: euros * 100,
    occurredOn,
    createdById: users.admin.id,
    sponsorId: linkedSponsor ? sponsorId(linkedSponsor) : null,
  });
  await prisma.ledgerEntry.createMany({
    data: [
      entry('INCOME', 'Sponsor', 'Acconto sponsorizzazione 2026/27', 1250, utc(2026, 7, 10), 'Autofficina Bianchi'),
      entry('INCOME', 'Sponsor', 'Sponsorizzazione rinfreschi', 800, utc(2026, 9, 15), 'Pasticceria Dolce Rete'),
      entry('INCOME', 'Quote iscrizione', 'Iscrizioni settore giovanile', 4200, utc(2026, 9, 25)),
      entry('INCOME', 'Quote mensili', 'Quote di ottobre incassate in segreteria', 5400, utc(2026, 10, 12)),
      entry('INCOME', 'Contributi', 'Contributo comunale per lo sport', 1500, utc(2026, 10, 2)),
      entry('EXPENSE', 'Affitto palestre', 'Palazzetto, ottobre', 1100, utc(2026, 10, 5)),
      entry('EXPENSE', 'Affitto palestre', 'Palestra Carducci, ottobre', 450, utc(2026, 10, 5)),
      entry('EXPENSE', 'Materiale sportivo', 'Palloni da gara e carrello', 640, utc(2026, 9, 18)),
      entry('EXPENSE', 'Affiliazioni e tesseramenti', 'Affiliazione FIPAV 2026/27', 900, utc(2026, 8, 28)),
      entry('EXPENSE', 'Assicurazioni', 'Polizza infortuni tesserati', 780, utc(2026, 9, 1)),
      entry('EXPENSE', 'Arbitri', 'Rimborsi arbitri, prime gare in casa', 280, utc(2026, 10, 20)),
    ],
  });
}

async function seedTrips({ prisma, societyId }: SeedContext): Promise<void> {
  await prisma.trip.createMany({
    data: [
      {
        societyId,
        destination: 'Palazzetto dello Sport, Reggio Emilia',
        departAt: utc(2026, 11, 21, 15, 30),
        returnAt: utc(2026, 11, 21, 22, 30),
        transport: 'MINIBUS',
        seats: 9,
        costCents: 14_000,
        status: 'CONFIRMED',
        notes: 'Ritrovo al Palazzetto alle 16:30. Pulmino del comune.',
      },
      {
        societyId,
        destination: 'Palestra Comunale, Ferrara',
        departAt: utc(2026, 12, 5, 16, 0),
        returnAt: utc(2026, 12, 5, 22, 0),
        transport: 'CAR',
        seats: 8,
        costCents: 6500,
        status: 'PLANNED',
        notes: 'Da organizzare con le auto dei genitori.',
      },
      {
        societyId,
        destination: 'PalaCattani, Faenza',
        departAt: utc(2026, 10, 24, 14, 0),
        returnAt: utc(2026, 10, 24, 21, 0),
        transport: 'MINIBUS',
        seats: 9,
        costCents: 12_000,
        status: 'CANCELLED',
        notes: 'Gara rinviata dalla societa avversaria.',
      },
    ],
  });
}

async function seedAnnouncements({ prisma, societyId, users, teamIds }: SeedContext): Promise<void> {
  const serieD = teamIds['Serie D'];
  if (!serieD) throw new Error('Team Serie D is missing');
  const published = (daysAgo: number) => new Date(Date.UTC(2026, 9, 13, 9, 0) - daysAgo * DAY_MS);
  await prisma.announcement.createMany({
    data: [
      {
        societyId,
        authorId: users.admin.id,
        title: 'Open day di sabato 24 ottobre',
        body: 'Sabato 24 ottobre dalle 15:00 il Palazzetto apre le porte a chi vuole provare la pallavolo. Portate un amico: prima prova gratuita per tutte le squadre giovanili.',
        isPinned: true,
        publishedAt: published(6),
      },
      {
        societyId,
        authorId: users.segreteria.id,
        title: 'Quota di novembre',
        body: 'La quota di novembre (60 euro) scade il 10 novembre. Potete pagare in segreteria o con bonifico: la ricevuta arriva in automatico per email.',
        publishedAt: published(2),
      },
      {
        societyId,
        authorId: users.allenatore.id,
        teamId: serieD,
        title: 'Serie D: allenamento spostato a giovedi',
        body: 'Questa settimana l allenamento della Serie D si fa giovedi alle 19:00 al Palazzetto, perche martedi la palestra e occupata.',
        publishedAt: published(1),
      },
      {
        societyId,
        authorId: users.admin.id,
        title: 'Cena sociale di dicembre',
        body: 'Stiamo scegliendo la data della cena sociale. Bozza in attesa di conferma del locale.',
        publishedAt: null,
      },
    ],
  });
}

async function seedReferees({ prisma, societyId }: SeedContext): Promise<void> {
  const referees = [];
  for (const row of [
    { firstName: 'Roberto', lastName: 'Cattaneo', email: 'r.cattaneo@arbitri.example', phone: '333 555 0142', qualification: 'Arbitro regionale' },
    { firstName: 'Elisa', lastName: 'Ferrari', email: 'e.ferrari@arbitri.example', qualification: 'Arbitro territoriale' },
    { firstName: 'Matteo', lastName: 'Longhi', phone: '347 555 0177', qualification: 'Segnapunti' },
  ]) {
    referees.push(await prisma.referee.create({ data: { societyId, ...row } }));
  }

  // Designations for the home matches of the demo group: the last one is the featured match against Delfini.
  const [cattaneo, ferrari, longhi] = referees;
  const matches = await prisma.match.findMany({
    where: { societyId, round: { in: [17, 18, 20] }, homeTeam: { teamId: { not: null } } },
    orderBy: { round: 'asc' },
  });
  const assignments = [
    { referee: cattaneo, round: 17, feeCents: 4500, reimbursedAt: utc(2026, 10, 20) },
    { referee: ferrari, round: 18, feeCents: 4000, reimbursedAt: utc(2026, 10, 20) },
    { referee: cattaneo, round: 20, feeCents: 4500, reimbursedAt: null },
    { referee: longhi, round: 20, feeCents: 1500, reimbursedAt: null },
  ];
  for (const assignment of assignments) {
    const match = matches.find((candidate) => candidate.round === assignment.round);
    if (!assignment.referee || !match) continue;
    await prisma.refereeAssignment.create({
      data: {
        societyId,
        refereeId: assignment.referee.id,
        matchId: match.id,
        feeCents: assignment.feeCents,
        reimbursedAt: assignment.reimbursedAt,
      },
    });
  }
}
