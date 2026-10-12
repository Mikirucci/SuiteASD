import type { SeedStep } from './context.js';

// SPEC section 6: U14, U16, U18, Serie D (+2).
export const DEMO_TEAMS = [
  { name: 'U12', category: 'U12' },
  { name: 'U14', category: 'U14' },
  { name: 'U16', category: 'U16' },
  { name: 'U18', category: 'U18' },
  { name: 'Serie D', category: 'Serie D' },
  { name: 'Prima Divisione', category: 'Prima Divisione' },
] as const;

export const seedTeams: SeedStep = async (context) => {
  for (const team of DEMO_TEAMS) {
    const created = await context.prisma.team.create({
      data: { societyId: context.societyId, name: team.name, category: team.category, sport: 'VOLLEY', gender: 'FEMALE' },
    });
    context.teamIds[team.name] = created.id;
  }
};
