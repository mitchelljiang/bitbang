---
id: objects
title: "Object files"
section: Compilers
group: The build
source: src/topics/objects.ts
url: ?p=objects
---
# Object files

## Intro
Compiling one .c file gives one .o file: machine code that is not yet a program. It sorts everything into sections, names what it defines and what it needs in a symbol table, and leaves blanks wherever an address is not known yet, each with a note, a relocation, saying what belongs there. This is sensor.o as objdump reads it. Click any part.

## Sections

The compiler sorts by what the linker and the startup code must do with each thing. Code goes in .text, and const data in .rodata; both stay in Flash. A variable with a starting value goes in .data: it lives in SRAM, but its starting value must be kept in Flash and copied at reset. A variable that starts at zero goes in .bss, which costs no Flash at all, only a size. The startup page runs that copy and clear.

scale is missing. It is static, so no other file can change it, and nothing in this one does, so the compiler used the value 3 directly: movs r1, #3. Neither the variable nor its symbol survives.

## Symbols

The symbol table lists every name the file defines, with its section, offset and size, and every name it uses but does not define, marked undefined (*UND*). Global symbols can be seen by other files; static ones are local and cannot clash with a name elsewhere. When the linker finds two global definitions of the same name, or none, that is the familiar “multiple definition” or “undefined reference” error.

## Relocations

The call to read_adc is encoded as f7ff fffe: a bl with a placeholder offset, since read_adc could be anywhere. The addresses of count and last, stored after the code for ldr to load, are zero for now. Each blank has a relocation naming the symbol and how to fill it in. Every address in the file also starts at 0: the linker decides where each section goes, then works through the relocations.

To look inside an object yourself: arm-none-eabi-objdump -h -t -r -d sensor.o, or nm sensor.o for just the symbols.
