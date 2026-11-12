import { timing } from '../src/shared/board/engine';
// most board tests check a landing straight after the last hop; the suspense pause has its own test
timing.settle = 0;
