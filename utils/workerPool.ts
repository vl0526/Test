import { t } from '../localization/vi';

// --- Worker Code Inlined ---
const mp3WorkerCode = `
self.onmessage = function(e) {
    var data = e.data;
    if (data.cmd === 'init') {
        if(typeof lamejs === 'undefined') {
             importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
        }
        self.postMessage({ cmd: 'ready' });
    } else if (data.cmd === 'encode') {
        try {
            var channels = data.channels || 1;
            var sampleRate = data.sampleRate || 44100;
            var kbps = data.kbps || 192;
            var mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
            var mp3Data = [];
            
            var left = data.pcmLeft;
            var right = data.pcmRight;
            var sampleBlockSize = 1152;
            var length = left.length;
            
            for (var i = 0; i < length; i += sampleBlockSize) {
                var l = left.subarray(i, i + sampleBlockSize);
                var r = right ? right.subarray(i, i + sampleBlockSize) : null;
                var mp3buf = mp3encoder.encodeBuffer(l, r);
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }
            
            var mp3bufFlush = mp3encoder.flush();
            if (mp3bufFlush.length > 0) {
                mp3Data.push(mp3bufFlush);
            }
            
            // Transfer buffers back isn't necessary for the blob, but we construct blob here
            // Note: worker cannot create File object, but can create Blob
            // However, sending typed array back to main thread is safer for browser compat
            
            self.postMessage({ cmd: 'done', id: data.id, buffer: mp3Data }); // mp3Data is array of Int8Array
        } catch (e) {
            self.postMessage({ cmd: 'error', id: data.id, msg: e.message });
        }
    }
};
`;

class WorkerPool {
    private pool: Worker[] = [];
    private queue: any[] = [];
    private activeWorkers = 0;
    private maxWorkers: number;
    private workerURL: string;

    constructor(size: number = 4) {
        this.maxWorkers = size;
        const blob = new Blob([mp3WorkerCode], { type: 'application/javascript' });
        this.workerURL = URL.createObjectURL(blob);
    }

    public init() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(this.workerURL);
            worker.onmessage = this.handleMessage.bind(this, worker);
            worker.postMessage({ cmd: 'init' });
            // Don't add to pool yet, wait for 'ready'
        }
    }

    private handleMessage(worker: Worker, e: MessageEvent) {
        const data = e.data;
        if (data.cmd === 'ready') {
            this.pool.push(worker);
            this.processQueue();
        } else if (data.cmd === 'done') {
            this.activeWorkers--;
            this.pool.push(worker); // Return worker to pool
            // Resolve the specific promise
            if (this.tasks[data.id]) {
                const blobParts = data.buffer.map((buf: any) => new Uint8Array(buf));
                const blob = new Blob(blobParts, { type: 'audio/mp3' });
                this.tasks[data.id].resolve(blob);
                delete this.tasks[data.id];
            }
            this.processQueue();
        } else if (data.cmd === 'error') {
            this.activeWorkers--;
            this.pool.push(worker);
             if (this.tasks[data.id]) {
                this.tasks[data.id].reject(new Error(data.msg));
                delete this.tasks[data.id];
            }
            this.processQueue();
        }
    }

    private tasks: Record<string, { resolve: Function, reject: Function, data: any }> = {};

    public encode(id: string, wavData: any): Promise<Blob> {
        return new Promise((resolve, reject) => {
            this.tasks[id] = { resolve, reject, data: { ...wavData, id, cmd: 'encode' } };
            this.queue.push(id);
            this.processQueue();
        });
    }

    private processQueue() {
        if (this.queue.length === 0 || this.pool.length === 0) return;

        const worker = this.pool.pop();
        if (!worker) return;

        const taskId = this.queue.shift();
        const task = this.tasks[taskId];
        
        if (task) {
            this.activeWorkers++;
            // Transferable objects for performance
            const transferList = [task.data.pcmLeft.buffer];
            if (task.data.pcmRight) transferList.push(task.data.pcmRight.buffer);
            
            worker.postMessage(task.data, transferList);
        } else {
            this.pool.push(worker); // Should not happen but safety
        }
    }

    public terminate() {
        this.pool.forEach(w => w.terminate());
        URL.revokeObjectURL(this.workerURL);
    }
}

export const mp3Pool = new WorkerPool(navigator.hardwareConcurrency || 4);