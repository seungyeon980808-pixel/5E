const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../js/ai-json-schema-compact.js');
function expand(schema) {
  const visit = (value, stack = []) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => visit(v, stack));
    if (value.$ref) {
      assert.match(value.$ref, /^#\/\$defs\/[A-Za-z0-9]+$/);
      const name = value.$ref.slice(8);
      assert.ok(!stack.includes(name), 'references must not introduce cycles');
      assert.ok(schema.$defs[name], 'every reference resolves');
      return visit(schema.$defs[name], [...stack, name]);
    }
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$defs').map(([k,v]) => [k,visit(v, stack)]));
  };
  return visit(schema);
}
test('shared schemas preserve every field, alternative and validation constraint', async () => {
  const {compactJsonSchema} = await api;
  const contracts = await import('../js/ai-label-json-schema.js');
  for (const schema of [contracts.buildSourceObservationOutputSchema(), contracts.buildImageReviewOutputSchema(), contracts.buildJointLabelReviewOutputSchema()]) {
    const before = JSON.stringify(schema), compact = compactJsonSchema(schema);
    assert.deepEqual(expand(compact), expand(schema));
    assert.ok(JSON.stringify(compact).length <= before.length);
    assert.equal(JSON.stringify(schema), before, 'input must stay immutable');
  }
});
test('existing definition names and tiny schemas are retained', async () => {
  const {compactJsonSchema} = await api;
  const repeated={type:'string',minLength:1,maxLength:1000,description:'A repeated constraint with enough content to warrant sharing and ensure a realistic collision with existing definitions.'};
  const schema={type:'object',properties:{a:repeated,b:repeated},required:['a','b'],additionalProperties:false,$defs:{shared1:{type:'integer'}}};
  const compact=compactJsonSchema(schema);
  assert.deepEqual(compact.$defs.shared1,schema.$defs.shared1);
  assert.deepEqual(expand(compact),expand(schema));
  const tiny={type:'string'};
  assert.deepEqual(compactJsonSchema(tiny),tiny);
  assert.notEqual(compactJsonSchema(tiny),tiny);
});
