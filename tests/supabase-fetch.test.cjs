const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadFetchUtility(fetchImplementation) {
  const output = ts.transpileModule(
    fs.readFileSync("src/utils/supabase/fetch-with-timeout.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    fetch: fetchImplementation,
    AbortController,
    Error,
    setTimeout,
    clearTimeout,
  });
  return exports;
}

function rejectWhenAborted(_input, init) {
  return new Promise((_resolve, reject) => {
    const rejectWithReason = () => reject(init.signal.reason);
    if (init.signal.aborted) rejectWithReason();
    else init.signal.addEventListener("abort", rejectWithReason, { once: true });
  });
}

test("Supabase deadlines reject as TimeoutError so safe reads remain retryable", async () => {
  const { createFetchWithTimeout } = loadFetchUtility(rejectWhenAborted);
  const timedFetch = createFetchWithTimeout(5);

  await assert.rejects(
    timedFetch("https://example.test"),
    (error) => error.name === "TimeoutError" && error.message.includes("5ms")
  );
});

test("a caller abort is preserved and is not converted into a timeout", async () => {
  const { createFetchWithTimeout } = loadFetchUtility(rejectWhenAborted);
  const timedFetch = createFetchWithTimeout(1000);
  const controller = new AbortController();
  const request = timedFetch("https://example.test", { signal: controller.signal });
  const callerError = new DOMException("navigation cancelled", "AbortError");

  controller.abort(callerError);

  await assert.rejects(request, (error) => error === callerError);
});

test("middleware can keep its hard deadline non-retryable", async () => {
  const { createFetchWithTimeout } = loadFetchUtility(rejectWhenAborted);
  const timedFetch = createFetchWithTimeout(5, { retryTimedOutReads: false });

  await assert.rejects(
    timedFetch("https://example.test"),
    (error) => error.name === "AbortError" && error.message.includes("timed out")
  );
});

test("server clients retain the default deadline and allow a scoped longer read deadline", async () => {
  const deadlines = [];
  const output = ts.transpileModule(fs.readFileSync('src/utils/supabase/server.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const modules = {
    '@supabase/ssr': { createServerClient: (_url, _key, options) => options },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {} }) },
    '@/utils/supabase/fetch-with-timeout': { createFetchWithTimeout: timeout => {
      deadlines.push(timeout);
      return rejectWhenAborted;
    } },
  };
  vm.runInNewContext(output, {
    exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-key' } },
    require: name => modules[name],
  });
  await exports.createClient();
  await exports.createClient({ timeoutMs: 30000 });
  assert.deepEqual(deadlines, [10000, 30000]);
});
