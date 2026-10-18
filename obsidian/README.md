# bitbang text

The text of every page, exported from the site for editing. The `source:` field in each note names the TypeScript it came from.

> **Workflow.** Edit the prose in these notes, then ask Claude to "pull text from obsidian" and it will apply your changes to the `source:` files. Re-running `npm run export-text` regenerates these notes from `src` and overwrites them, so pull your edits in first.

## Protocols
- [[uart|UART]] — Asynchronous serial
- [[rs-232|RS-232]] — Asynchronous serial
- [[rs-485|RS-485]] — Asynchronous serial
- [[1-wire|1-Wire]] — Asynchronous serial
- [[ws2812|WS2812]] — Asynchronous serial
- [[spi|SPI]] — Synchronous buses
- [[quad-spi|Quad SPI]] — Synchronous buses
- [[i2c|I²C]] — Synchronous buses
- [[i3c|I3C]] — Synchronous buses
- [[pci|PCI]] — Expansion buses
- [[pcie|PCIe]] — Expansion buses
- [[usb-2-0|USB 2.0]] — USB
- [[ethernet-frame|Ethernet frame]] — Ethernet
- [[10base-t|10BASE-T]] — Ethernet
- [[100base-tx|100BASE-TX]] — Ethernet
- [[1000base-t|1000BASE-T]] — Ethernet
- [[1000base-x|1000BASE-X]] — Ethernet
- [[mii-and-rmii|MII and RMII]] — Ethernet
- [[i2s|I²S]] — Audio
- [[jtag|JTAG]] — Debug & programming
- [[swd|SWD]] — Debug & programming

## Bits and bytes
- [[binary-and-hexadecimal|Binary and hexadecimal]] — Start here
- [[two-s-complement|Two’s complement]] — Start here
- [[fixed-point|Fixed point]] — Start here
- [[ieee-754-floating-point|IEEE 754 floating point]] — Start here
- [[and-or-xor-and-not|AND, OR, XOR and NOT]] — Bitwise operations
- [[shifts-and-rotates|Shifts and rotates]] — Bitwise operations
- [[masks|Masks]] — Bitwise operations
- [[bit-tricks|Bit tricks]] — Bitwise operations
- [[read-modify-write|Read-modify-write]] — Bitwise operations
- [[endianness|Endianness]] — Bitwise operations
- [[overflow-and-status-flags|Overflow and status flags]] — Arithmetic and error checking
- [[checksums-and-crc|Checksums and CRC]] — Arithmetic and error checking

## Memory
- [[memory-map|Memory map]] — The address space
- [[memory-mapped-i-o|Memory-mapped I/O]] — The address space
- [[buses-and-the-bus-matrix|Buses and the bus matrix]] — The address space
- [[alignment|Alignment]] — The address space
- [[the-stack|The stack]] — The call stack
- [[stack-frames|Stack frames]] — The call stack
- [[function-calls|Function calls]] — The call stack
- [[buffer-overflow|Buffer overflow]] — The call stack
- [[stack-overflow|Stack overflow]] — The call stack
- [[the-heap|The heap]] — Where data lives
- [[sections-and-startup|Sections and startup]] — Where data lives
- [[sram-dram-and-flash|SRAM, DRAM and Flash]] — Memory hardware
- [[caches|Caches]] — Memory hardware
- [[virtual-and-physical-addresses|Virtual and physical addresses]] — Virtual memory
- [[page-tables-and-the-tlb|Page tables and the TLB]] — Virtual memory
- [[mpu-and-mmu|MPU and MMU]] — Virtual memory

## Concurrency
- [[interrupts|Interrupts]] — Interrupting the program

## Other pages
- [[how-protocols-work|How protocols work]]
- [[about-me|About me]]
- [[embedded-systems-one-bit-at-a-time|Embedded systems, one bit at a time.]]
