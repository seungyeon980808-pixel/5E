import assert from 'node:assert/strict';
import { graphPointNumber } from '../js/graph/number-fields.js';

const measured = [0, .11, .19, .31, .40, .000001, -0.125];
for (const value of measured) assert.equal(Number(graphPointNumber(value, true)), value);
assert.equal(graphPointNumber(.11, true), '0.11');
assert.equal(graphPointNumber(.19, true), '0.19');
assert.equal(graphPointNumber(.11), '0.1');
assert.equal(graphPointNumber(.19), '0.2');
assert.equal(graphPointNumber(-0, true), '0');
assert.equal(graphPointNumber('', true), '');
console.log('Exact experiment coordinates retain input precision; observed tracing keeps rounded controls PASS');
