import type { SeedContext, SeedStep } from './context.js';

// 118 tesserati (SPEC section 6): the six named athletes of the demo plus generated ones, spread over the teams.

const FIRST_NAMES = [
  'Alice', 'Beatrice', 'Camilla', 'Daria', 'Elisa', 'Federica', 'Greta', 'Irene', 'Laura', 'Martina',
  'Noemi', 'Ottavia', 'Paola', 'Rebecca', 'Silvia', 'Teresa', 'Valentina', 'Viola', 'Arianna', 'Benedetta',
  'Caterina', 'Debora', 'Eleonora', 'Francesca', 'Ilaria', 'Jessica', 'Lucia', 'Matilde', 'Nicole', 'Sofia',
];
const LAST_NAMES = [
  'Moretti', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Costa', 'Fontana', 'Conte',
  'Esposito', 'Mancini', 'Lombardi', 'Barbieri', 'Rinaldi', 'Caruso', 'Ferrara', 'Santoro', 'Giordano', 'Leone',
  'Vitale', 'Serra', 'Villa', 'Testa', 'Pellegrini', 'Palumbo', 'Bianco', 'Martini', 'Parisi', 'Orlando',
];
const POSITIONS = ['Palleggiatrice', 'Schiacciatrice', 'Centrale', 'Opposto', 'Libero'];
const KIT_SIZES = ['XS', 'S', 'M', 'L'];

interface Roster {
  team: string;
  size: number;
  birthYears: readonly [number, number];
  named: readonly { firstName: string; lastName: string; position: string }[];
}

const ROSTERS: readonly Roster[] = [
  { team: 'U12', size: 14, birthYears: [2014, 2015], named: [] },
  { team: 'U14', size: 18, birthYears: [2012, 2013], named: [] },
  {
    team: 'U16',
    size: 22,
    birthYears: [2010, 2011],
    named: [
      { firstName: 'Chiara', lastName: 'Neri', position: 'Schiacciatrice' },
      { firstName: 'Sara', lastName: 'Conti', position: 'Libero' },
    ],
  },
  {
    team: 'U18',
    size: 24,
    birthYears: [2008, 2009],
    named: [
      { firstName: 'Anna', lastName: 'Ferri', position: 'Centrale' },
      { firstName: 'Marta', lastName: 'Bianchi', position: 'Palleggiatrice' },
    ],
  },
  {
    team: 'Serie D',
    size: 18,
    birthYears: [1996, 2006],
    named: [
      { firstName: 'Elena', lastName: 'Russo', position: 'Opposto' },
      { firstName: 'Giulia', lastName: 'Rossi', position: 'Schiacciatrice' },
    ],
  },
  { team: 'Prima Divisione', size: 22, birthYears: [1990, 2004], named: [] },
];

export const seedMembers: SeedStep = async (context) => {
  const used = new Set(ROSTERS.flatMap((roster) => roster.named.map((n) => `${n.firstName} ${n.lastName}`)));
  let counter = 0;

  for (const roster of ROSTERS) {
    const teamId = context.teamIds[roster.team];
    if (!teamId) throw new Error(`Team ${roster.team} must be seeded before members`);

    const people = [...roster.named];
    while (people.length < roster.size) {
      const firstName = FIRST_NAMES[counter % FIRST_NAMES.length] ?? 'Anna';
      const lastName = LAST_NAMES[(counter * 7 + Math.floor(counter / FIRST_NAMES.length)) % LAST_NAMES.length] ?? 'Rossi';
      counter += 1;
      const fullName = `${firstName} ${lastName}`;
      if (used.has(fullName)) continue;
      used.add(fullName);
      people.push({ firstName, lastName, position: POSITIONS[counter % POSITIONS.length] ?? 'Centrale' });
    }

    for (const [index, person] of people.entries()) {
      const [fromYear, toYear] = roster.birthYears;
      const year = fromYear + (index % (toYear - fromYear + 1));
      const member = await context.prisma.member.create({
        data: {
          societyId: context.societyId,
          firstName: person.firstName,
          lastName: person.lastName,
          birthDate: new Date(Date.UTC(year, index % 12, 1 + (index % 27))),
          gender: 'FEMALE',
          fieldRole: person.position,
          kitSize: KIT_SIZES[index % KIT_SIZES.length],
          status: 'ACTIVE',
          joinedAt: new Date(Date.UTC(2025, 8, 1)),
          teamMemberships: {
            create: { societyId: context.societyId, teamId, position: person.position, jerseyNumber: index + 1 },
          },
        },
      });
      context.memberIds[`${person.firstName} ${person.lastName}`] = member.id;
    }
  }

  await linkDemoAccounts(context);
};

// The demo athlete account is Giulia Rossi; the demo guardian is Sara Conti's mother.
async function linkDemoAccounts(context: SeedContext): Promise<void> {
  const giulia = context.memberIds['Giulia Rossi'];
  const sara = context.memberIds['Sara Conti'];
  if (!giulia || !sara) throw new Error('Named demo members are missing');
  await context.prisma.member.update({ where: { id: giulia }, data: { userId: context.users.atleta.id } });
  await context.prisma.guardianLink.create({
    data: { societyId: context.societyId, guardianUserId: context.users.genitore.id, memberId: sara, relation: 'MADRE' },
  });
}
