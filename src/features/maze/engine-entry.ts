/**
 * Maze web client entry. Boot order is exactly the order of the legacy single-file script (maze-game/maze.js):
 * services are constructed when ./engine/services loads, then the former top-level statements run in the same sequence.
 */
import './engine/services';
import { initLegacyUrlCleanup } from './engine/online';
import { initKeyboard } from './input/keyboard';
import { initToolbar } from './input/toolbar';
import { initPointer } from './input/pointer';
import { initJoystick } from './input/joystick';
import { initMiniMap } from './input/minimap';
import { initButtons, initWindowEvents, initOnload } from './engine/boot';

initLegacyUrlCleanup();
initKeyboard();
initToolbar();
initPointer();
initJoystick();
initMiniMap();
initButtons();
initWindowEvents();
initOnload();
