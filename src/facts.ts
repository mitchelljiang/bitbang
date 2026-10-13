import type { FactKey } from './core/types';

/** Row labels for a protocol's spec sheet, in display order. Keys double as section ids on the guide page. */
export const FACTS: { key: FactKey; label: string }[] = [
  { key: 'clock', label: 'Clock' },
  { key: 'wires', label: 'Wires' },
  { key: 'drive', label: 'Drive' },
  { key: 'duplex', label: 'Duplex' },
  { key: 'topology', label: 'Topology' },
  { key: 'addressing', label: 'Addressing' },
  { key: 'flow', label: 'Flow control' },
  { key: 'errors', label: 'Error checking' },
  { key: 'speed', label: 'Speed' },
  { key: 'reach', label: 'Reach' },
];
