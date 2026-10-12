import type { AutomationDefinition } from '../registry.js';
import { housekeeping } from './housekeeping.js';

// One line per automation. Each automation lives in its own file in this folder.
export const builtInAutomations: readonly AutomationDefinition[] = [housekeeping];
