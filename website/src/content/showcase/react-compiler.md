---
title: "Where do you start with 3,669 files?"
description: "Use the map to find an entry point, then the walkthrough to connect it to the compiler pipeline."
run: react
date: 2026-11-13
seo:
  title: "Finding a way into React Compiler — Code Unpacked"
  description: "A real Code Unpacked run on our React Compiler fork: finding the entry point, following compiler stages, and making a huge import navigable."
  image: /og/react-compiler-v2.jpg
  imageAlt: "React Compiler: 3,669 source files, 1,900 commits. A Code Unpacked case study."
takeaway: "The useful first question isn't “which file changed?” It's “which path through these files explains the behavior?”"
examples:
  - id: react-map
    note: "Start in compileProgram. Search another file, inspect a symbol, or zoom out with Fit files. This is an eight-file excerpt from the real 3,669-file change; the complete run has the full retained source and inventory."
  - id: react-walkthrough
    note: "Now follow the reading order. The entry and gating chapter explains what gets compiled; later chapters connect the intermediate representation, reactive scopes, dependencies and emitted cache checks."
limitation: "This run explains a pinned compiler import. It does not establish application correctness or performance. Supporting files and source omissions remain identified in the full bundle; the website map deliberately limits retained source."
---

## The file list is a terrible introduction

The compiler import has 3,669 changed files. Fixtures, snapshots, developer tools, the playground and a work-in-progress Rust port all sit beside the TypeScript compiler. Opening the first changed file tells you very little about where the behavior begins.

The map gives that pile a shape. Search for **Program.ts** and the entry point becomes something you can inspect, rather than a filename you have to remember. Its source, symbols and recorded connections sit together. You can follow a supported connection and keep the code in view.

That helps with a specific reviewing problem: finding the next useful file without pretending every nearby file is a dependency.

## Separate the doorway from the machinery

The walkthrough starts with the Babel visitor and the function-selection boundary. That order matters. Before worrying about an optimization, you need to know whether the compiler will select the function at all.

From there, the explanation follows lowering, control flow and SSA, inference, reactive scopes, dependency handling and code generation. Each stage has source references. You can stop where your question is answered, or keep going when the next boundary needs a closer look.

It also separates the imported Rust work from the active TypeScript pipeline in this snapshot. A large import has several stories in it. A reading order makes it easier to follow the relevant one.

## A small semantic detail deserves its own format

Gating looks like a simple choice between a compiled and an original function. But replacing a named function declaration with a const initializer also changes the hoisting situation. The run's first comic turns that distinction into a scene: a flag chooses a door; it doesn't raise the floor.

That's a useful job for a comic. It gives you a memorable question to take back to the source: **what happens to a call before the declaration?** The transcript links the metaphor to the actual gating and hoisting evidence.

The design documents and quiz approach the same compiler from other angles. One lays out the boundaries; the other asks whether you can explain them yourself.

## Try a route, then check it

Use the map below to find an entry point. Then use the walkthrough to connect that point to the rest of the pipeline. The original PR comments and all five downloads are linked at the end.

The goal is a better place to start reading, and a better reason for each file you open.
