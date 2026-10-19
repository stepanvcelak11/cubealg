// Klient pro hledání ve Web Workeru. Každé hledání má vlastní worker,
// zrušení ho prostě ukončí.

export class SearchClient {
  constructor() {
    this.worker = null;
  }

  get running() {
    return this.worker !== null;
  }

  /**
   * @param {object} job viz src/search/worker.js
   * @param {{onProgress?:Function, onSolutions?:Function, onDone?:Function, onError?:Function}} handlers
   */
  start(job, { onProgress, onSolutions, onDone, onError } = {}) {
    this.cancel();
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      if (data.type === 'progress') onProgress?.(data);
      else if (data.type === 'solutions') onSolutions?.(data.items);
      else if (data.type === 'done') { this.cancel(); onDone?.(data); }
      else if (data.type === 'error') { this.cancel(); onError?.(new Error(data.message)); }
    };
    worker.onerror = (e) => {
      if (worker !== this.worker) return;
      this.cancel();
      onError?.(new Error(e.message || 'Chyba ve workeru'));
    };
    worker.postMessage({
      type: 'search',
      ...job,
      start: Array.from(job.start),
      target: Array.from(job.target),
    });
  }

  cancel() {
    this.worker?.terminate();
    this.worker = null;
  }
}
