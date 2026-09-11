import path from "node:path";

import { createMemoryPackAdapter, createPackStore } from "../../js/pdf-library/pack-store.js";
import { readPackDirectory } from "./pack-directory.mjs";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node tools/pdf-library/inspect-pack.mjs PACK_DIRECTORY");
const store = createPackStore({ adapter: createMemoryPackAdapter() });
await store.install(await readPackDirectory(path.resolve(directory)));
const [record] = await store.list();
process.stdout.write(`${JSON.stringify({ valid: true, id: record.id, version: record.version, documents: record.documentCount, pages: record.pageCount })}\n`);
