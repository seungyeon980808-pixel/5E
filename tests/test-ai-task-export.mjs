import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseTaskExportDestination,
  nextAvailableBrowserName,
  sanitizeTaskExportName,
  taskExportSelection,
  writeTaskExports,
} from '../js/ai-task-export.js';

const png = value => `data:image/png;base64,${Buffer.from(value).toString('base64')}`;

test('selected export keeps one chosen result per task while all mode keeps every version and its task settings', () => {
  const tabs = [
    {
      id: 'task-1', title: '작업 1', attachments: [{name:'원본:A.png'}], selectedCandidateId: 'a',
      outputOptions: {backgroundPolicy:'connected',examPalette:true,lineThickness:2},
      generated: [{id:'a',data:png('a')},{id:'b',data:png('b')}],
    },
    {
      id: 'task-2', title: '작업 2', attachments: [{name:'원본 B.png'}], selectedCandidateId: 'missing',
      outputOptions: {backgroundPolicy:'preserve',examPalette:false,lineThickness:0},
      generated: [{id:'c',data:png('c')}],
    },
  ];

  const selected = taskExportSelection(tabs, 'selected');
  assert.deepEqual(selected.map(record => record.candidateId), ['a', 'c']);
  assert.deepEqual(selected[0].outputOptions, tabs[0].outputOptions);
  assert.equal(selected[0].sourceName, '작업 1 - 원본-A');

  const all = taskExportSelection(tabs, 'all');
  assert.deepEqual(all.map(record => record.candidateId), ['a', 'b', 'c']);
  assert.deepEqual(all.map(record => record.sourceName), [
    '작업 1 - 원본-A - 버전 1',
    '작업 1 - 원본-A - 버전 2',
    '작업 2 - 원본 B - 버전 1',
  ]);
  assert.equal(sanitizeTaskExportName('CON.png'), '_CON.png');
});

test('browser directory writes use a numeric suffix and never overwrite an existing task result', async () => {
  const stored = new Map([['작업 1 - 원본.png', Uint8Array.of(9)]]);
  const directory = {
    async getFileHandle(name, options = {}) {
      if (!stored.has(name) && !options.create) throw new DOMException('missing', 'NotFoundError');
      if (!stored.has(name)) stored.set(name, null);
      return {
        async createWritable() {
          return {
            async write(blob) { stored.set(name, new Uint8Array(await blob.arrayBuffer())); },
            async close() {},
          };
        },
      };
    },
  };

  assert.equal(await nextAvailableBrowserName(directory, '작업 1 - 원본', '.png'), '작업 1 - 원본 (2).png');
  const result = await writeTaskExports({kind:'browser-directory',directory}, [{sourceName:'작업 1 - 원본',dataUrl:png('new')}]);
  assert.equal(result.status, 'stored');
  assert.deepEqual([...stored.get('작업 1 - 원본.png')], [9]);
  assert.equal(Buffer.from(stored.get('작업 1 - 원본 (2).png')).toString(), 'new');
});

test('unsupported folder API requires confirmation and reports a ZIP download request rather than stored files', async () => {
  let prompt = '';
  const destination = await chooseTaskExportDestination({
    directorySupported: false,
    confirmDownloads(message) { prompt = message; return true; },
  });
  assert.equal(destination.kind, 'browser-zip');
  assert.match(prompt, /ZIP 다운로드를 요청/);
  assert.match(prompt, /다운로드 완료 여부는 브라우저에서 확인/);

  const clicked = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { assert.equal(blob.type, 'application/zip'); return 'blob:zip'; };
  URL.revokeObjectURL = () => {};
  try {
    const result = await writeTaskExports(destination, [
      {sourceName:'같은 이름',dataUrl:png('one')},
      {sourceName:'같은 이름',dataUrl:png('two')},
    ], {documentApi:{createElement:()=>({click(){clicked.push([this.download,this.href]);}})}});
    assert.equal(result.status, 'download-requested');
    assert.deepEqual(result.files, ['같은 이름.png', '같은 이름 (2).png']);
    assert.deepEqual(clicked, [['5E-AI-결과.zip', 'blob:zip']]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
