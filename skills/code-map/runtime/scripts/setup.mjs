#!/usr/bin/env node
import { ensureDependencies } from './dependencies.mjs';
ensureDependencies().then(() => console.log('Code Unpacked is ready.')).catch(error => { console.error(error.message); process.exitCode = 1; });
