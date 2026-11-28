/* A pool of worker threads that runs independent simulation jobs on every core.
   Used by sweep.ts and by scripts/run-matrix.mjs (the baseline check).

   The worker script calls serveJobs(handler); the main thread calls runPool(jobs, workerUrl). */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export interface PoolOptions<J, R> {
  threads?: number;                       // default: one per core
  workerData?: unknown;                   // passed to every worker as workerData
  onResult?: (result: R, job: J, done: number, total: number) => void;
}

// Runs every job and resolves with the results in the jobs' order. Rejects on the first error.
export function runPool<J, R>(jobs: J[], workerUrl: URL, opts: PoolOptions<J, R> = {}): Promise<R[]> {
  const results: R[] = new Array(jobs.length);
  if (!jobs.length) return Promise.resolve(results);
  const threads = Math.max(1, Math.min(opts.threads ?? availableParallelism(), jobs.length));
  let next = 0, done = 0;
  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    const fail = (e: unknown) => { for (const w of workers) void w.terminate(); reject(e); };
    for (let t = 0; t < threads; t++) {
      const w = new Worker(workerUrl, { workerData: opts.workerData });
      workers.push(w);
      let current = -1;
      const feed = () => {
        if (next < jobs.length) { current = next++; w.postMessage(jobs[current]); }
        else void w.terminate();
      };
      w.on('message', (msg: { ok: true; result: R } | { ok: false; error: string }) => {
        if (!msg.ok) return fail(new Error(`job ${current} failed: ${msg.error}`));
        results[current] = msg.result;
        done++;
        opts.onResult?.(msg.result, jobs[current], done, jobs.length);
        feed();                            // next job, or shut this worker down if none are left
        if (done === jobs.length) resolve(results);
      });
      w.on('error', fail);
      feed();
    }
  });
}

// In a worker: answer each job with handler(job). Does nothing on the main thread.
export function serveJobs<J, R>(handler: (job: J, data: unknown) => R | Promise<R>) {
  if (isMainThread || !parentPort) return;
  const port = parentPort;
  port.on('message', async (job: J) => {
    try { port.postMessage({ ok: true, result: await handler(job, workerData) }); }
    catch (e) { port.postMessage({ ok: false, error: (e as Error)?.stack ?? String(e) }); }
  });
}
