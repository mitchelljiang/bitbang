import { catalog, protocolStart, type Category } from './catalog';
import { bitTopics } from './bits';
import { memoryTopics } from './memory';
import { concurrencyTopics } from './concurrency';
import { peripheralTopics } from './peripherals';
import { architectureTopics } from './architecture';
import { compilerTopics } from './compilers';
import { cTopics } from './clang';
import { powerTopics } from './power';
import { driverTopics } from './drivers';

/** Every sidebar category on the site, section by section. A new section's file goes here and in scripts/sections.mjs. */
export const allCategories: Category[] = [protocolStart, ...catalog, ...bitTopics, ...memoryTopics, ...concurrencyTopics, ...peripheralTopics, ...architectureTopics, ...compilerTopics, ...cTopics, ...powerTopics, ...driverTopics];
