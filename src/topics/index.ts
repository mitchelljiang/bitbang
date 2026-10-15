import { mountBitwise } from './bitwise';
import { mountBinary, mountFixed, mountFloat, mountTwos } from './numbers';

/** Bit manipulation topics that have an interactive page, by id. The rest show an under-construction page. */
export const topics: Record<string, (root: HTMLElement) => void> = {
  binary: mountBinary,
  twos: mountTwos,
  fixed: mountFixed,
  float: mountFloat,
  bitwise: mountBitwise,
};
