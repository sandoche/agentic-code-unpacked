#!/usr/bin/env node
// Generated from packages/core/src/scripts/setup.mts. Edit that source, then run pnpm skills:build.
import { message } from './values.mjs';
import { ensureDependencies } from './dependencies.mjs';
ensureDependencies().then(() => console.log('Code Unpacked is ready.')).catch((error) => { console.error(message(error)); process.exitCode = 1; });
