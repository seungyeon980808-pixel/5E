let loaderSequence = 0;

function isModuleFetchFailure(error) {
  return error?.name === "TypeError" && /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/iu.test(error.message || "");
}

export function createPdfRuntimeLoader({
  moduleUrl = new URL("./pdf-runtime.js?v=1.6.3-pdf-runtime-retry", import.meta.url).href,
  importModule = url => import(url),
} = {}) {
  const retryId = `${Date.now()}-${++loaderSequence}`;
  let attempts = 0;
  let loading = null;

  async function loadModule() {
    // Browsers may remember a failed import even after our promise is cleared.
    // Each retry must use a new URL; successful loads retain the normal cache.
    for (let retry = 0; retry < 2; retry += 1) {
      const url = new URL(moduleUrl);
      if (attempts > 0) url.searchParams.set("pdfModuleRetry", `${retryId}-${attempts}`);
      attempts += 1;
      try { return await importModule(url.href); }
      catch (error) {
        if (retry === 1 || !isModuleFetchFailure(error)) throw error;
      }
    }
  }

  return () => {
    if (!loading) {
      loading = loadModule().then(module => module.createPdfRuntime()).catch(error => {
        loading = null;
        throw error;
      });
    }
    return loading;
  };
}
