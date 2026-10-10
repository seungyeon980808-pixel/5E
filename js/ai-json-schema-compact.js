// Share repeated schema definitions without changing required fields or constraints.
// Native structured output already supports local $defs/$ref in our contracts.
export function compactJsonSchema(schema) {
  const counts = new Map();
  const key = value => JSON.stringify(value);
  const eligible = value => value && typeof value === 'object' && !Array.isArray(value)
    && (typeof value.type === 'string' || Array.isArray(value.anyOf)) && key(value).length >= 120;
  const count = value => {
    if (!value || typeof value !== 'object') return;
    if (eligible(value)) { const k = key(value); counts.set(k, (counts.get(k) || 0) + 1); }
    Object.values(value).forEach(count);
  };
  count(schema);
  const definitions = {}, names = new Map();
  let serial = 0;
  const visit = (value, root = false) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => visit(item));
    const originalKey = key(value);
    const repeated = !root && eligible(value) && counts.get(originalKey) > 1;
    if (repeated && names.has(originalKey)) return { $ref: '#/$defs/' + names.get(originalKey) };
    const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    if (!repeated) return result;
    let name;
    do { name = 'shared' + (++serial); } while (Object.hasOwn(schema.$defs || {}, name));
    names.set(originalKey, name); definitions[name] = result;
    return { $ref: '#/$defs/' + name };
  };
  const result = visit(schema, true);
  if (Object.keys(definitions).length) result.$defs = { ...(result.$defs || {}), ...definitions };
  // Small schemas can grow from references. Keep their original representation.
  return key(result).length < key(schema).length ? result : structuredClone(schema);
}
