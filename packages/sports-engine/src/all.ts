// Import this once per process to register every sport engine.
// Phase 5: import './foosball';
import { registerEngine } from './index';
import { cricketEngine } from './cricket';

registerEngine(cricketEngine);
