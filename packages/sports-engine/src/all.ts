// Import this once per process to register every sport engine.

import { registerEngine } from './index';
import { cricketEngine } from './cricket';
import { foosballEngine } from './foosball';

registerEngine(cricketEngine);
registerEngine(foosballEngine);
