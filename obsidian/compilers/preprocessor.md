---
id: preprocess
title: "Preprocessor"
section: Compilers
group: The build
source: src/topics/preprocess.ts
url: ?p=preprocess
---
# Preprocessor

## Intro
Before the compiler reads a line of C, the preprocessor rewrites the file as text. It pastes in every #include, replaces every macro with its definition, keeps or drops the code inside #if, and deletes the comments. The compiler only ever sees the result on the right. Turn the flags on and off, and click any line to see where it went.

## Text in, text out

The preprocessor knows nothing about C’s types or functions. #define LED_PIN 5 tells it to replace the word LED_PIN with the text 5 wherever it appears, and BIT(n) is the same with a parameter: BIT(LED_PIN) becomes (1u << (5)). That is why macros are written with so many brackets. Without them, #define BIT(n) 1u << n would turn BIT(2) + 1 into 1u << 2 + 1, which C reads as 1u << 3.

GPIOA_ODR expands to (*(volatile uint32_t *)0x48000014): a pointer to the output register at that address, dereferenced. Writing to it writes to the pins, as on the memory-mapped I/O page.

## Flags change the program

-DDEBUG on the compiler’s command line is the same as #define DEBUG at the top of the file. With it, LOG("led on") becomes a call to uart_puts; without it, the macro is empty and the line vanishes, so a release build carries no logging code at all. -DLED_PIN=9 defines LED_PIN before the file does, so the #ifndef skips the default. One source file can serve several boards this way.

## #include is a paste

#include <stdint.h> copies that header into the file, here 28 lines of typedefs that give uint32_t its meaning. A larger header can pull in thousands of lines, which is a large part of why C builds are slow. The result of all this, one .c file with its headers pasted in, is a translation unit: the compiler works on one at a time and knows nothing about the others until the linker joins them.

Run clang -E led.c or gcc -E led.c to see this output yourself. The lines starting with # in the real output are line markers, which tell the compiler which file and line each part came from so its error messages point at your source; they are hidden here and drawn as colors.
