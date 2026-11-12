#!/usr/bin/env node
import { message } from './values.mjs';
import { ensureDependencies } from './dependencies.mjs';
ensureDependencies().then(() => console.log('Code Unpacked is ready.')).catch((error: unknown) => { console.error(message(error)); process.exitCode = 1; });
