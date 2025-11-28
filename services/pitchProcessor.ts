
export const pitchProcessorCode = `
// High-quality Lanczos resampling kernel.
// 'a' is a parameter controlling the size of the kernel (number of lobes).
// a=3 is a common choice for good quality.
function lanczos(x, a) {
    if (x === 0) return 1.0;
    // The kernel is defined for x in (-a, a)
    if (Math.abs(x) >= a) return 0.0;
    
    const pi_x = Math.PI * x;
    const pi_x_a = pi_x / a;
    
    // sinc(x) * sinc(x/a)
    return (a * Math.sin(pi_x) * Math.sin(pi_x_a)) / (pi_x * pi_x);
}

// Lanczos interpolation function.
function lanczosInterpolate(buffer, index, a = 3) {
    const i = Math.floor(index);
    let sum = 0.0;
    
    // The window of samples to consider is from i - a + 1 to i + a.
    for (let j = i - a + 1; j <= i + a; j++) {
        // Simple boundary check: treat out-of-bounds samples as zero. This can
        // introduce minor artifacts at the very beginning of the audio but is
        // a simple and effective way to handle edges in block-based processing.
        const sample = buffer[j] || 0;
        sum += sample * lanczos(index - j, a);
    }
    
    return sum;
}


class PitchProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.resampleRatio = 1.0;
        // Buffer to store leftover samples from the previous processing block,
        // one for each channel. This is crucial for seamless interpolation across blocks.
        this.inputBuffers = []; 
        this.port.onmessage = (event) => {
            if (event.data.resampleRatio !== undefined) {
                this.resampleRatio = event.data.resampleRatio;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        // If there's no input or no resampling is needed, just pass the audio through.
        if (input.length === 0 || this.resampleRatio === 1.0) {
            for (let channel = 0; channel < input.length; channel++) {
                output[channel].set(input[channel]);
            }
            return true;
        }

        const numChannels = input.length;
        const lanczos_a = 3; // Kernel size parameter for Lanczos interpolation.

        for (let channel = 0; channel < numChannels; channel++) {
            const inputData = input[channel];
            const outputData = output[channel];
            
            if (!this.inputBuffers[channel]) {
                this.inputBuffers[channel] = new Float32Array(0);
            }

            // Prepend leftover samples from the previous block to the current input.
            const oldInputBuffer = this.inputBuffers[channel];
            const newInputBuffer = new Float32Array(oldInputBuffer.length + inputData.length);
            newInputBuffer.set(oldInputBuffer, 0);
            newInputBuffer.set(inputData, oldInputBuffer.length);

            let outputIndex = 0;
            // 'inputIndex' is a floating-point value tracking our position in the input buffer.
            let inputIndex = 0.0;
            
            // We can only process up to a point where the full kernel fits within the buffer.
            // The Lanczos kernel needs 'a' samples of look-ahead.
            const processableLength = newInputBuffer.length - lanczos_a;
            
            while (outputIndex < outputData.length && inputIndex < processableLength) {
                outputData[outputIndex] = lanczosInterpolate(newInputBuffer, inputIndex, lanczos_a);
                outputIndex++;
                inputIndex += this.resampleRatio;
            }

            // Zero out any remaining space in the output buffer.
            for (let i = outputIndex; i < outputData.length; i++) {
                outputData[i] = 0;
            }
            
            // Determine how much of the input buffer was consumed and store the rest.
            const consumedInput = Math.floor(inputIndex);
            this.inputBuffers[channel] = newInputBuffer.subarray(consumedInput);
        }
        
        return true;
    }
}

registerProcessor('pitch-processor', PitchProcessor);
`;
