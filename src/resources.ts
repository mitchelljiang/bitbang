/**
 * Sources and further reading, by page id (the ?p= value): official specifications, datasheets, videos, articles
 * and books. Every page in a section shows a "Related resources" list at the bottom; a page with no entries yet shows
 * a short placeholder instead.
 *
 * To add one, put it under the page's id, for example:
 *
 *   uart: [
 *     { kind: 'Video', title: 'Ben Eater: How does a UART work?', url: 'https://www.youtube.com/watch?v=…' },
 *     { kind: 'Datasheet', title: 'TI: KeyStone UART user guide', url: 'https://…', note: 'Frame format and timing' },
 *   ],
 */
type ResourceKind = 'Specification' | 'Datasheet' | 'Application note' | 'Video' | 'Article' | 'Book' | 'Tool';

export interface Resource {
  kind: ResourceKind;
  title: string;
  url: string;
  /** Optional: what it covers, or which part is relevant. */
  note?: string;
}

const ARM = 'https://documentation-service.arm.com/static/';
const ST = 'https://www.st.com/resource/en/';
const RPI = 'https://datasheets.raspberrypi.com/';
const TI = 'https://www.ti.com/lit/';
const REF = 'https://en.cppreference.com/w/c/';

/** Every document cited on the site. Datasheets and reference manuals come first wherever a page has one. */
const S = {
  rm0090: { kind: 'Datasheet', title: 'STMicroelectronics RM0090: STM32F4 reference manual', url: ST + 'reference_manual/dm00031020.pdf' },
  ds8626: { kind: 'Datasheet', title: 'STMicroelectronics DS8626: STM32F405/407 datasheet', url: ST + 'datasheet/dm00037051.pdf' },
  es0182: { kind: 'Datasheet', title: 'STMicroelectronics ES0182: STM32F405/407 errata', url: ST + 'errata_sheet/es0182-stm32f405407xx-and-stm32f415417xx-device-errata-stmicroelectronics.pdf' },
  pm0223: { kind: 'Datasheet', title: 'STMicroelectronics PM0223: Cortex-M0+ programming manual', url: ST + 'programming_manual/pm0223-stm32-cortexm0-mcus-programming-manual-stmicroelectronics.pdf' },
  m4trm: { kind: 'Datasheet', title: 'Arm Cortex-M4 Technical Reference Manual', url: ARM + '5f19da2a20b7cf4bc524d99a' },
  m0guide: { kind: 'Datasheet', title: 'Arm Cortex-M0+ Devices Generic User Guide: instruction set summary', url: 'https://support.arm.com/documentation/dui0662/b/The-Cortex-M0--Instruction-Set/Instruction-set-summary' },
  m0trm: { kind: 'Datasheet', title: 'Arm Cortex-M0 Technical Reference Manual: instruction timing', url: 'https://support.arm.com/documentation/ddi0432/c/programmers-model/instruction-set-summary' },
  rp2040: { kind: 'Datasheet', title: 'Raspberry Pi RP2040 datasheet', url: RPI + 'rp2040/rp2040-datasheet.pdf' },
  rp2350: { kind: 'Datasheet', title: 'Raspberry Pi RP2350 datasheet', url: RPI + 'rp2350/rp2350-datasheet.pdf' },
  pico2: { kind: 'Datasheet', title: 'Raspberry Pi Pico 2 datasheet', url: RPI + 'pico/pico-2-datasheet.pdf' },
  esp32: { kind: 'Datasheet', title: 'Espressif ESP32 technical reference manual', url: 'https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf' },
  esp32c3: { kind: 'Datasheet', title: 'Espressif ESP32-C3 technical reference manual', url: 'https://www.espressif.com/sites/default/files/documentation/esp32-c3_technical_reference_manual_en.pdf' },
  ws2812: { kind: 'Datasheet', title: 'Worldsemi WS2812 datasheet', url: 'https://cdn-shop.adafruit.com/datasheets/WS2812.pdf' },
  ds18b20: { kind: 'Datasheet', title: 'Analog Devices DS18B20 1-Wire thermometer datasheet', url: 'https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf' },
  max232: { kind: 'Datasheet', title: 'Texas Instruments MAX232 datasheet', url: TI + 'ds/symlink/max232.pdf' },
  hvd72: { kind: 'Datasheet', title: 'Texas Instruments SN65HVD72 RS-485 transceiver datasheet', url: TI + 'ds/symlink/sn65hvd72.pdf' },
  dp83848: { kind: 'Datasheet', title: 'Texas Instruments DP83848C 10/100 Ethernet PHY datasheet', url: TI + 'ds/symlink/dp83848c.pdf' },
  dp83867: { kind: 'Datasheet', title: 'Texas Instruments DP83867IR gigabit Ethernet PHY datasheet', url: TI + 'ds/symlink/dp83867ir.pdf' },
  aic3204: { kind: 'Datasheet', title: 'Texas Instruments TLV320AIC3204 audio codec datasheet', url: TI + 'ds/symlink/tlv320aic3204.pdf' },
  tmp117: { kind: 'Datasheet', title: 'Texas Instruments TMP117 I²C temperature sensor datasheet', url: TI + 'ds/symlink/tmp117.pdf' },
  ads1115: { kind: 'Datasheet', title: 'Texas Instruments ADS1115 16-bit ADC datasheet', url: TI + 'ds/symlink/ads1115.pdf' },
  dac7311: { kind: 'Datasheet', title: 'Texas Instruments DAC7311 12-bit DAC datasheet', url: TI + 'ds/symlink/dac7311.pdf' },
  w25q: { kind: 'Datasheet', title: 'Winbond W25Q128JV serial flash datasheet', url: 'https://www.winbond.com/resource-files/w25q128jv%20revf%2003272018%20plus.pdf' },
  keystone: { kind: 'Datasheet', title: 'Texas Instruments SPRUGP1: KeyStone UART user guide', url: TI + 'ug/sprugp1/sprugp1.pdf' },
  rp2350hw: { kind: 'Application note', title: 'Raspberry Pi: Hardware design with RP2350', url: RPI + 'rp2350/hardware-design-with-rp2350.pdf' },
  hvd230: { kind: 'Datasheet', title: 'Texas Instruments SN65HVD230 CAN transceiver datasheet', url: TI + 'ds/symlink/sn65hvd230.pdf' },
  iso11898: { kind: 'Specification', title: 'ISO 11898-1:2015: CAN data link layer', url: 'https://www.iso.org/standard/63648.html' },
  can: { kind: 'Application note', title: 'Texas Instruments SLOA101: Introduction to the CAN protocol', url: TI + 'an/sloa101b/sloa101b.pdf' },
  rs485: { kind: 'Application note', title: 'Texas Instruments SLLA070: RS-422 and RS-485 overview', url: TI + 'an/slla070d/slla070d.pdf' },
  i2c: { kind: 'Specification', title: 'NXP UM10204: I²C-bus specification', url: 'https://www.nxp.com/docs/en/user-guide/UM10204.pdf' },
  i3c: { kind: 'Specification', title: 'MIPI I3C specification', url: 'https://www.mipi.org/specifications/i3c-sensor-specification' },
  usb2: { kind: 'Specification', title: 'USB-IF: USB 2.0 specification', url: 'https://www.usb.org/document-library/usb-20-specification' },
  usb3: { kind: 'Specification', title: 'USB-IF: USB 3.2 specification', url: 'https://www.usb.org/document-library/usb-32-revision-11-june-2022' },
  usb4: { kind: 'Specification', title: 'USB-IF: USB4 specification v2.0', url: 'https://www.usb.org/document-library/usb4r-specification-v20' },
  eth: { kind: 'Specification', title: 'IEEE 802.3-2022: Ethernet', url: 'https://standards.ieee.org/ieee/802.3/10422/' },
  jtag: { kind: 'Specification', title: 'IEEE 1149.1-2013: JTAG boundary scan', url: 'https://standards.ieee.org/ieee/1149.1/4484/' },
  adi: { kind: 'Specification', title: 'Arm Debug Interface architecture specification (ADIv5)', url: ARM + '5f900b1af86e16515cdc0642' },
  pcisig: { kind: 'Specification', title: 'PCI-SIG specifications', url: 'https://pcisig.com/specifications' },
  c23: { kind: 'Specification', title: 'ISO C working draft N3220', url: 'https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf' },
  ieee754: { kind: 'Specification', title: 'IEEE 754-2019: floating-point arithmetic', url: 'https://standards.ieee.org/ieee/754/6210/' },
  aapcs: { kind: 'Specification', title: 'Arm: Procedure Call Standard for the Arm Architecture', url: 'https://github.com/ARM-software/abi-aa/blob/main/aapcs32/aapcs32.rst' },
  aaelf: { kind: 'Specification', title: 'Arm: ELF for the Arm Architecture', url: 'https://github.com/ARM-software/abi-aa/blob/main/aaelf32/aaelf32.rst' },
  elf: { kind: 'Specification', title: 'Tool Interface Standard: ELF', url: 'https://refspecs.linuxfoundation.org/elf/elf.pdf' },
  riscv: { kind: 'Specification', title: 'RISC-V ratified specifications', url: 'https://riscv.org/specifications/ratified/' },
  cortexDocs: { kind: 'Article', title: 'Arm: Cortex-M resources (architecture manuals)', url: 'https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/cortex-m-resources' },
  ld: { kind: 'Tool', title: 'GNU ld: linker scripts', url: 'https://sourceware.org/binutils/docs/ld/Scripts.html' },
  lld: { kind: 'Tool', title: 'LLD: the LLVM linker', url: 'https://lld.llvm.org/' },
  clang: { kind: 'Tool', title: 'Clang compiler user’s manual', url: 'https://clang.llvm.org/docs/UsersManual.html' },
  gccOpt: { kind: 'Tool', title: 'GCC: options that control optimization', url: 'https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html' },
  gccVol: { kind: 'Tool', title: 'GCC: when is a volatile object accessed?', url: 'https://gcc.gnu.org/onlinedocs/gcc/Volatiles.html' },
  cpp: { kind: 'Tool', title: 'The C preprocessor (GCC)', url: 'https://gcc.gnu.org/onlinedocs/cpp/' },
  sigrok: { kind: 'Tool', title: 'sigrok protocol decoders', url: 'https://sigrok.org/wiki/Protocol_decoders' },
  picoSdk: { kind: 'Tool', title: 'Raspberry Pi Pico SDK', url: 'https://github.com/raspberrypi/pico-sdk' },
  freertos: { kind: 'Tool', title: 'FreeRTOS: semaphores and mutexes', url: 'https://www.freertos.org/Documentation/02-Kernel/04-API-references/10-Semaphore-and-Mutexes/00-Semaphores' },
  regehr: { kind: 'Article', title: 'John Regehr: A guide to undefined behavior in C and C++', url: 'https://blog.regehr.org/archives/213' },
  llvmRef: { kind: 'Article', title: 'LLVM language reference: poison and undefined values', url: 'https://llvm.org/docs/LangRef.html' },
  drepper: { kind: 'Article', title: 'Ulrich Drepper: What every programmer should know about memory', url: 'https://www.akkadia.org/drepper/cpumemory.pdf' },
  kbar: { kind: 'Article', title: 'Linux kernel: memory barriers', url: 'https://www.kernel.org/doc/Documentation/memory-barriers.txt' },
  kring: { kind: 'Article', title: 'Linux kernel: circular buffers', url: 'https://www.kernel.org/doc/html/latest/core-api/circular-buffers.html' },
  fpg: { kind: 'Article', title: 'The floating-point guide', url: 'https://floating-point-gui.de/' },
  bithacks: { kind: 'Article', title: 'Sean Anderson: Bit twiddling hacks', url: 'https://graphics.stanford.edu/~seander/bithacks.html' },
  reveng: { kind: 'Article', title: 'CRC RevEng: catalogue of parametrised CRC algorithms', url: 'https://reveng.sourceforge.io/crc-catalogue/all.htm' },
  koopman: { kind: 'Article', title: 'Philip Koopman: CRC polynomial zoo', url: 'https://users.ece.cmu.edu/~koopman/crc/' },
  refVolatile: { kind: 'Article', title: 'cppreference: volatile', url: REF + 'language/volatile' },
  refStorage: { kind: 'Article', title: 'cppreference: storage duration and linkage', url: REF + 'language/storage_duration' },
  refInt: { kind: 'Article', title: 'cppreference: fixed-width integer types', url: REF + 'types/integer' },
  refStruct: { kind: 'Article', title: 'cppreference: struct declaration', url: REF + 'language/struct' },
  refPtr: { kind: 'Article', title: 'cppreference: pointers', url: REF + 'language/pointer' },
  refFn: { kind: 'Article', title: 'cppreference: functions', url: REF + 'language/functions' },
  refPre: { kind: 'Article', title: 'cppreference: the preprocessor', url: REF + 'preprocessor' },
  refAtomic: { kind: 'Article', title: 'cppreference: atomic operations', url: REF + 'atomic' },
} satisfies Record<string, Resource>;
type Key = keyof typeof S;

const PAGES: Record<string, Key[]> = {
  'protocols-start': ['sigrok'], basics: ['keystone', 'sigrok'],
  uart: ['keystone', 'rp2040', 'rm0090'], rs232: ['max232', 'keystone'], rs485: ['hvd72', 'rs485'], onewire: ['ds18b20'], ws2812: ['ws2812'],
  spi: ['w25q', 'rm0090'], qspi: ['w25q', 'rp2040'], i2c: ['tmp117', 'i2c'], i3c: ['i3c', 'i2c'],
  pci: ['pcisig'], pcie: ['pcisig'], usb: ['rp2040', 'usb2'], usb3: ['usb3'], usb4: ['usb4'], 
  ethframe: ['dp83848', 'eth'], ethernet: ['dp83848', 'eth'], '100base': ['dp83848', 'eth'], '1000baset': ['dp83867', 'eth'], '1000basex': ['dp83867', 'eth'], rmii: ['dp83848', 'rm0090'],
  i2s: ['aic3204', 'rm0090'], 
  can: ['hvd230', 'iso11898', 'can'],
  jtag: ['jtag', 'adi'], swd: ['rp2040', 'adi'], 
  'bits-start': ['c23'], binary: ['c23'], twos: ['c23'], fixed: ['m4trm', 'c23'], float: ['ieee754', 'fpg'], bitwise: ['c23', 'bithacks'], shifts: ['c23', 'bithacks'], masks: ['rm0090', 'bithacks'], tricks: ['bithacks'],
  rmw: ['rm0090', 'rp2040'], endianness: ['m4trm', 'aapcs'], flags: ['pm0223', 'm4trm'], crc: ['reveng', 'koopman'],
  'memory-start': ['rm0090', 'rp2040'], memmap: ['rm0090', 'rp2040'], mmio: ['rm0090', 'rp2040'], interconnect: ['rm0090', 'rp2040'], alignment: ['pm0223', 'm4trm', 'aapcs'], stack: ['pm0223', 'aapcs'], frames: ['aapcs'], calls: ['aapcs', 'pm0223'],
  bufover: ['c23'], overflow: ['pm0223', 'aapcs'], heap: ['c23'], sections: ['ld', 'elf'], cells: ['w25q', 'ds8626'], caches: ['rm0090', 'drepper'], vaddr: ['esp32', 'drepper'], paging: ['drepper'], mpu: ['pm0223', 'm4trm'],
  'concurrency-start': ['pm0223', 'rm0090'], mcu: ['rm0090', 'pm0223'], interrupts: ['pm0223', 'm4trm'], priorities: ['pm0223', 'm4trm'], context: ['m4trm', 'freertos'], scheduling: ['freertos'],
  races: ['c23', 'kbar'], atomics: ['m4trm', 'refAtomic'], barriers: ['pm0223', 'kbar'], locks: ['rp2040', 'freertos'],
  'peripherals-start': ['rm0090', 'ds8626'], gpio: ['rm0090', 'ds8626'], debounce: ['ds8626'], timers: ['rm0090', 'es0182'], pwm: ['rm0090'], watchdog: ['rm0090'], adc: ['rm0090', 'ads1115'], dac: ['rm0090', 'dac7311'], dma: ['rm0090', 'es0182'],
  'architecture-start': ['cortexDocs', 'riscv'], instructions: ['pm0223', 'esp32c3', 'esp32', 'riscv', 'rp2350'], registers: ['pm0223', 'm0guide', 'aapcs'], addressing: ['m0guide', 'm4trm'], pipeline: ['m4trm', 'm0trm', 'm0guide'], branches: ['m4trm', 'm0trm'],
  'compilers-start': ['clang', 'lld'], preprocess: ['cpp', 'refPre'], compile: ['clang'], objects: ['elf', 'aaelf'], linking: ['aaelf', 'lld'], 'linker-script': ['rm0090', 'ld'], mapfile: ['lld', 'ld'], optimize: ['gccOpt', 'clang'], volatile: ['gccVol', 'refVolatile'], ub: ['c23', 'regehr', 'llvmRef'],
  'c-start': ['c23'], keywords: ['c23', 'refStorage'], integers: ['c23', 'aapcs', 'refInt'], structs: ['aapcs', 'c23', 'refStruct'], pointers: ['c23', 'refPtr'], functions: ['aapcs', 'refFn'],
  'power-start': ['rp2350', 'rp2350hw'], 'clock-tree': ['rp2350', 'rp2350hw'], 'sleep-modes': ['rp2350', 'pico2'], 'battery-life': ['rp2350', 'pico2'], brownout: ['rp2350', 'rp2350hw'],
  'drivers-start': ['rm0090', 'rp2040'], 'register-layer': ['rm0090', 'rp2040', 'gccVol'], hal: ['rp2040', 'picoSdk'], 'ring-buffer': ['rp2040', 'kring'], 'uart-driver': ['rp2040', 'keystone', 'rm0090'], 'dma-driver': ['rm0090', 'rp2040'],
};

export const RESOURCES: Record<string, Resource[]> = Object.fromEntries(Object.entries(PAGES).map(([id, keys]) => [id, keys.map((k) => S[k])]));
