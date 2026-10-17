import { mountBitwise } from './bitwise';
import { mountBinary, mountFixed, mountFloat, mountTwos } from './numbers';
import { mountCrc } from './crc';
import { mountFlags } from './flags';
import { mountEndian, mountMasks, mountRmw, mountShifts } from './ops';
import { mountCalls } from './calls';
import { mountTricks } from './tricks';

/** The interactive page for each Bits and bytes and Memory topic, by id. */
export const topics: Record<string, (root: HTMLElement) => void> = {
  binary: mountBinary,
  twos: mountTwos,
  fixed: mountFixed,
  float: mountFloat,
  bitwise: mountBitwise,
  shifts: mountShifts,
  masks: mountMasks,
  tricks: mountTricks,
  rmw: mountRmw,
  endianness: mountEndian,
  flags: mountFlags,
  crc: mountCrc,
  calls: mountCalls,
};
