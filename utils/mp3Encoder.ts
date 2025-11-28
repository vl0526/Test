// The entire worker script as a string to be loaded into a blob.
// This avoids cross-origin issues when the app is hosted in a sandboxed environment.
const mp3EncoderWorkerCode = `
// This worker handles MP3 encoding off the main thread to prevent UI blocking.
// It relies on lamejs, which must be loaded via importScripts.

self.onmessage = (event) => {
    try {
        const { audioBufferData } = event.data;
        
        // Load lamejs if it's not already available in the worker's scope.
        if (typeof lamejs === 'undefined') {
            importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
        }

        if (typeof lamejs === 'undefined') {
            throw new Error("lamejs could not be loaded in the worker.");
        }

        const { numChannels, sampleRate, pcmLeft, pcmRight } = audioBufferData;
        const kbps = 192; // MP3 bitrate

        const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
        const mp3Data = [];

        const sampleBlockSize = 1152; // MPEG-1, Layer III sample frame size

        for (let i = 0; i < pcmLeft.length; i += sampleBlockSize) {
            const leftChunk = pcmLeft.subarray(i, i + sampleBlockSize);
            const rightChunk = pcmRight ? pcmRight.subarray(i, i + sampleBlockSize) : undefined;
            
            const mp3buf = mp3Encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) {
                mp3Data.push(new Int8Array(mp3buf));
            }
        }

        const mp3buf = mp3Encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(new Int8Array(mp3buf));
        }

        const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
        
        // Send the resulting Blob back to the main thread.
        self.postMessage({ type: 'success', blob: mp3Blob });

    } catch (error) {
        // Report any errors back to the main thread.
        self.postMessage({ type: 'error', message: error.message });
    }
};

// Add a basic error handler for the worker itself.
self.onerror = (e) => {
    console.error("Error in mp3Encoder.worker:", e);
};
`;

/**
 * Encodes an AudioBuffer into an MP3 Blob using a Web Worker and lamejs.
 * @param audioBuffer The audio buffer to encode.
 * @returns A Promise that resolves with a Blob containing the MP3 data.
 */
export function bufferToMp3(audioBuffer: AudioBuffer): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const blob = new Blob([mp3EncoderWorkerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        const terminateAndRevoke = () => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };

        worker.onmessage = (event) => {
            if (event.data.type === 'success') {
                resolve(event.data.blob);
            } else {
                reject(new Error(event.data.message || 'MP3 encoding failed in worker.'));
            }
            terminateAndRevoke();
        };

        worker.onerror = (error) => {
            reject(error);
            terminateAndRevoke();
        };

        // Convert Float32Array channel data to Int16Array for lamejs
        const convertBuffer = (float32Array: Float32Array): Int16Array => {
            const int16Array = new Int16Array(float32Array.length);
            for (let i = 0; i < float32Array.length; i++) {
                const sample = Math.max(-1, Math.min(1, float32Array[i]));
                int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }
            return int16Array;
        };

        const numChannels = audioBuffer.numberOfChannels;
        const pcmLeft = convertBuffer(audioBuffer.getChannelData(0));
        const pcmRight = numChannels > 1 ? convertBuffer(audioBuffer.getChannelData(1)) : undefined;

        const audioBufferData = {
            numChannels: numChannels,
            sampleRate: audioBuffer.sampleRate,
            pcmLeft: pcmLeft,
            pcmRight: pcmRight,
        };

        // We can't transfer ArrayBuffers that are part of a larger buffer (like from getChannelData).
        // So we just post a copy. The worker will receive this data.
        worker.postMessage({ audioBufferData });
    });
}