import type { Operation } from '../contract/operation';
import { communityOperations } from './community';
import { eventsOperations } from './events';
import { identityOperations } from './identity';
import { livingOperations } from './living';
import { marketplaceOperations } from './marketplace';
import { safetyOperations } from './safety';
import { sourcesOperations } from './sources';
import { systemOperations } from './system';
import { workOperations } from './work';

/** Every contracted operation, in documentation order. */
export const allOperations: Operation[] = [
  ...systemOperations,
  ...identityOperations,
  ...sourcesOperations,
  ...livingOperations,
  ...communityOperations,
  ...workOperations,
  ...eventsOperations,
  ...marketplaceOperations,
  ...safetyOperations,
];
