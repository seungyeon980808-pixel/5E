import { BlurReveal } from './blur-reveal.js';
import { LibraryLoading } from './library-loading.js';
import { trackLoadingMotion } from './activity-visibility.js';

export function createLibraryLoading({ header, grid }) {
  const indicator = LibraryLoading.attach({ header, grid });
  const releaseMotion = trackLoadingMotion(grid);
  const entries = new Map();
  let generation = 0;
  const disposeEntries = () => {
    for (const entry of entries.values()) { entry.release?.(); entry.reveal?.destroy(); }
    entries.clear();
  };
  const sync = () => {
    const values = [...entries.values()];
    indicator.setTotal(values.length).progress(values.filter(e => e.state === 'ready').length, values.filter(e => e.state === 'failed').length);
  };
  const request = media => {
    if (entries.has(media)) return;
    entries.set(media, { state: 'pending', started: performance.now(), generation }); sync();
  };
  const ready = async (media, image) => {
    request(media);
    const entry = entries.get(media);
    if (entry.state !== 'pending') return;
    entry.state = 'ready'; sync();
    // The real source is available now. Never invent a blurred placeholder.
    // The card is usable immediately while its final visual crossfade settles.
    if (performance.now() - entry.started < 150 || !media.isConnected) return;
    entry.reveal = BlurReveal.attach(media, { variant: 'fade', fit: 'contain' });
    entry.release = trackLoadingMotion(media);
    try {
      await entry.reveal.start(image);
      if (entry.generation !== generation) return;
      entry.reveal.t0 = entry.started;
      await entry.reveal.complete(image);
    } catch { /* The decoded original underneath is already usable. */ }
    finally {
      entry.release?.(); entry.release = null; entry.reveal?.destroy(); entry.reveal = null;
    }
  };
  return {
    begin() { generation++; disposeEntries(); indicator.begin(); },
    reset() { generation++; disposeEntries(); indicator.reset(); },
    request, ready,
    failed(media) { request(media); const entry = entries.get(media); entry.state = 'failed'; sync(); },
    empty() { if (!entries.size) indicator.setTotal(0).progress(0); },
    fail() { indicator.fail(); },
    destroy() { generation++; disposeEntries(); releaseMotion(); indicator.destroy(); },
  };
}
