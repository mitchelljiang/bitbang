import type { Protocol } from '../core/types';
import { ethernet } from './ethernet';
import { i2c } from './i2c';
import { i2s } from './i2s';
import { i3c } from './i3c';
import { jtag } from './jtag';
import { onewire } from './onewire';
import { qspi } from './qspi';
import { rs232 } from './rs232';
import { rs485 } from './rs485';
import { spi } from './spi';
import { swd } from './swd';
import { uart } from './uart';

/** To add a protocol, write an encoder and list it here. It shows up in the menu wherever src/catalog.ts puts it. */
export const protocols: Protocol[] = [uart, spi, i2c, i3c, qspi, onewire, i2s, rs232, rs485, ethernet, jtag, swd];
