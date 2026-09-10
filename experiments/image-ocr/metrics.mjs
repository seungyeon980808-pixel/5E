export function normalizeOcrText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[\t\f\v \u00a0]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function editMatrix(expected, actual) {
  const rows = Array.from({ length: expected.length + 1 }, () => new Uint32Array(actual.length + 1));
  for (let i = 0; i <= expected.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= actual.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= actual.length; j += 1) {
      const substitution = rows[i - 1][j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1);
      rows[i][j] = Math.min(substitution, rows[i - 1][j] + 1, rows[i][j - 1] + 1);
    }
  }
  return rows;
}

function misreads(expected, actual, matrix) {
  const differences = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === actual[j - 1] && matrix[i][j] === matrix[i - 1][j - 1]) {
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && j > 0 && matrix[i][j] === matrix[i - 1][j - 1] + 1) {
      differences.push({ operation: "substitute", expected: expected[i - 1], actual: actual[j - 1], expectedIndex: i - 1 });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && matrix[i][j] === matrix[i - 1][j] + 1) {
      differences.push({ operation: "delete", expected: expected[i - 1], actual: null, expectedIndex: i - 1 });
      i -= 1;
      continue;
    }
    differences.push({ operation: "insert", expected: null, actual: actual[j - 1], expectedIndex: i });
    j -= 1;
  }
  return differences.reverse();
}

export function scoreOcrText(expectedValue, actualValue) {
  const expectedText = normalizeOcrText(expectedValue);
  const actualText = normalizeOcrText(actualValue);
  const expected = Array.from(expectedText);
  const actual = Array.from(actualText);
  const matrix = editMatrix(expected, actual);
  const editDistance = matrix[expected.length][actual.length];
  const denominator = expected.length || 1;
  return {
    expectedText,
    actualText,
    exact: expectedText === actualText,
    expectedCharacters: expected.length,
    actualCharacters: actual.length,
    editDistance,
    characterErrorRate: Number((editDistance / denominator).toFixed(6)),
    characterAccuracy: Number(Math.max(0, 1 - editDistance / denominator).toFixed(6)),
    misreads: misreads(expected, actual, matrix),
  };
}
