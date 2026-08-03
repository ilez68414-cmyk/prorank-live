const CLOUDINARY_CONFIG = {
    cloudName: 'dbv7bfkgy',
    uploadPreset: 'voice_messages',
    folder: 'chat_voices',
    maxFileSize: 2 * 1024 * 1024
};

export async function uploadVoiceToCloudinary(audioBlob, onProgress = null) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', audioBlob);
        formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
        formData.append('folder', CLOUDINARY_CONFIG.folder);
        
        const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/video/upload`;
        
        console.log('📤 Загрузка на Cloudinary...');
        console.log('📤 Размер:', (audioBlob.size / 1024).toFixed(2), 'KB');
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        
        if (onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    onProgress(percent);
                }
            });
        }
        
        xhr.onload = () => {
            console.log('📤 Статус:', xhr.status);
            
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    console.log('📤 Успешно!', response.secure_url);
                    resolve({
                        url: response.secure_url,
                        duration: Math.round(response.duration || 0),
                        format: response.format || 'webm',
                        publicId: response.public_id,
                        bytes: response.bytes
                    });
                } catch (e) {
                    reject(new Error('Ошибка парсинга ответа: ' + e.message));
                }
            } else {
                let errorMsg = `Ошибка загрузки: ${xhr.status}`;
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    if (errorResponse.error && errorResponse.error.message) {
                        errorMsg += ' - ' + errorResponse.error.message;
                    }
                } catch (e) {}
                reject(new Error(errorMsg));
            }
        };
        
        xhr.onerror = () => {
            reject(new Error('Ошибка сети при загрузке на Cloudinary'));
        };
        
        xhr.send(formData);
    });
}

export async function optimizeAudio(audioBlob) {
    return new Promise((resolve) => {
        if (audioBlob.size < 500 * 1024) {
            resolve(audioBlob);
            return;
        }
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    const offlineContext = new OfflineAudioContext(
                        1,
                        audioBuffer.length,
                        16000
                    );
                    
                    const source = offlineContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(offlineContext.destination);
                    source.start(0);
                    
                    const renderedBuffer = await offlineContext.startRendering();
                    const wavBlob = bufferToWav(renderedBuffer);
                    resolve(wavBlob);
                } catch (err) {
                    console.warn('Ошибка оптимизации:', err);
                    resolve(audioBlob);
                }
            };
            reader.readAsArrayBuffer(audioBlob);
        } catch (err) {
            console.warn('Ошибка оптимизации:', err);
            resolve(audioBlob);
        }
    });
}

function bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    
    const samples = buffer.getChannelData(0);
    const dataLength = samples.length * (bitDepth / 8);
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    const offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset + i * 2, intSample, true);
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export function cacheVoiceMessage(url) {
    if ('caches' in window) {
        caches.open('voice-cache-v1').then((cache) => {
            fetch(url).then((response) => {
                if (response.ok) {
                    cache.put(url, response);
                }
            }).catch(() => {});
        });
    }
}

export async function getCachedVoice(url) {
    if ('caches' in window) {
        const cache = await caches.open('voice-cache-v1');
        const cached = await cache.match(url);
        if (cached) {
            return cached;
        }
    }
    return null;
}