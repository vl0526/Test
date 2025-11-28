const mp3WorkerCode = `
self.onmessage = function(e) {
    if (e.data.cmd === 'init') {
        if(typeof lamejs === 'undefined') importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
        self.postMessage({ cmd: 'ready' });
        return;
    }
    const { id, channels, sampleRate, pcmLeft, pcmRight } = e.data;
    try {
        const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 192); // 192kbps Standard
        const parts = [];
        const blockSize = 1152;
        
        for (let i = 0; i < pcmLeft.length; i += blockSize) {
            const l = pcmLeft.subarray(i, i + blockSize);
            const r = pcmRight ? pcmRight.subarray(i, i + blockSize) : undefined;
            const buf = encoder.encodeBuffer(l, r);
            if (buf.length > 0) parts.push(buf);
        }
        const end = encoder.flush();
        if (end.length > 0) parts.push(end);
        
        self.postMessage({ cmd: 'done', id, buffer: parts });
    } catch (err) {
        self.postMessage({ cmd: 'error', id, msg: err.message });
    }
};
`;

class WorkerPool {
    private workers: Worker[] = [];
    private queue: any[] = [];
    private tasks = new Map();
    private active = 0;
    
    // Default to hardwareConcurrency or 4, but capped to avoid crashing
    private maxWorkers = Math.min(navigator.hardwareConcurrency || 4, 16); 

    init() {
        if (this.workers.length > 0) return;
        const blob = new Blob([mp3WorkerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        
        for (let i = 0; i < this.maxWorkers; i++) {
            const w = new Worker(url);
            w.onmessage = (e) => this.handler(w, e);
            w.postMessage({ cmd: 'init' });
            // Look specific: we don't add to pool until 'ready'
        }
    }

    handler(w: Worker, e: MessageEvent) {
        const { cmd, id, buffer, msg } = e.data;
        if (cmd === 'ready' || cmd === 'done' || cmd === 'error') {
            if (cmd === 'done') {
                 // Reconstruct Blob
                 const blob = new Blob(buffer.map((b: any) => new Uint8Array(b)), { type: 'audio/mp3' });
                 this.tasks.get(id)?.resolve(blob);
            }
            if (cmd === 'error') this.tasks.get(id)?.reject(new Error(msg));
            
            if (cmd !== 'ready') {
                this.tasks.delete(id);
                this.active--;
            }
            
            this.workers.push(w);
            this.run();
        }
    }

    run() {
        if (this.queue.length === 0 || this.workers.length === 0) return;
        const task = this.queue.shift();
        const worker = this.workers.pop()!;
        this.active++;
        
        const transfer = [task.data.pcmLeft.buffer];
        if (task.data.pcmRight) transfer.push(task.data.pcmRight.buffer);
        worker.postMessage(task.data, transfer);
    }

    encode(id: string, data: any): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.tasks.set(id, { resolve, reject });
            this.queue.push({ data: { ...data, id } });
            this.run();
        });
    }
}

export const mp3Pool = new WorkerPool();
