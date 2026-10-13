import type { Protocol } from '../core/types';
import { i2c } from './i2c';
import { spi } from './spi';
import { uart } from './uart';

/** To add a protocol, write an encoder and list it here. */
export const protocols: Protocol[] = [uart, spi, i2c];
