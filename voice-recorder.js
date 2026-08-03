export class VoiceRecorder {
    constructor(options = {}) {
        this.maxDuration = options.maxDuration || 60;
        this.minDuration = options.minDuration || 1;
        this.onRecordingStart = options.onRecordingStart || null;
        this.onRecordingStop = options.onRecordingStop || null;
        this.onRecordingCancel = options.onRecordingCancel || null;
        this.onRecordingProgress = options.onRecordingProgress || null;
        this.onUploadProgress = options.onUploadProgress || null;
        
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.duration = 0;
        this.timerInterval = null;
        this.stream = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;
        
        // UI элементы - null (не используются)
        this.container = null;
        this.timerDisplay = null;
        this.waveCanvas = null;
        this.visualizerCtx = null;
        this.progressBar = null;
        
        this.initUI();
    }
    
    // ===== ПУСТАЯ ФУНКЦИЯ (UI НЕ СОЗДАЕТСЯ) =====
    initUI() {
        // UI не создается - используем кнопки в строке ввода
        return;
    }
    
    async startRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 128;
            source.connect(this.analyser);
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 32000
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.cleanup();
                if (this.onRecordingStop) {
                    this.onRecordingStop(this.audioChunks);
                }
            };
            
            this.mediaRecorder.start(100);
            this.isRecording = true;
            this.duration = 0;
            
            this.timerInterval = setInterval(() => {
                this.duration++;
                if (this.onRecordingProgress) {
                    this.onRecordingProgress(this.duration);
                }
                if (this.duration >= this.maxDuration) {
                    this.stopRecording();
                }
            }, 1000);
            
            // Визуализация отключена
            // this.startVisualization();
            
            if (this.onRecordingStart) {
                this.onRecordingStart();
            }
            
        } catch (err) {
            console.error('Ошибка записи:', err);
            throw new Error('Нет доступа к микрофону');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            clearInterval(this.timerInterval);
            
            if (this.duration < this.minDuration) {
                this.cancelRecording();
                throw new Error('Слишком короткая запись');
            }
        }
    }
    
    cancelRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.onstop = () => {
                this.cleanup();
                if (this.onRecordingCancel) {
                    this.onRecordingCancel();
                }
            };
            this.mediaRecorder.stop();
        } else {
            this.cleanup();
            if (this.onRecordingCancel) {
                this.onRecordingCancel();
            }
        }
    }
    
    async sendRecording() {
        if (this.audioChunks.length === 0) {
            throw new Error('Нет аудио для отправки');
        }
        
        if (this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            clearInterval(this.timerInterval);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const audioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder ? this.mediaRecorder.mimeType : 'audio/webm'
        });
        
        audioBlob.duration = this.duration;
        
        // Импортируем функцию загрузки
        const { uploadVoiceToCloudinary, optimizeAudio } = await import('./voice-uploader.js');
        
        let optimizedBlob = audioBlob;
        try {
            optimizedBlob = await optimizeAudio(audioBlob);
            optimizedBlob.duration = this.duration;
        } catch (err) {
            console.warn('Не удалось оптимизировать, используем оригинал');
        }
        
        if (this.onUploadProgress) {
            this.onUploadProgress(0);
        }
        
        const result = await uploadVoiceToCloudinary(optimizedBlob, (progress) => {
            if (this.onUploadProgress) {
                this.onUploadProgress(progress);
            }
        });
        
        this.cleanup();
        
        return result;
    }
    
    startVisualization() {
        // Визуализация отключена - UI не используется
        return;
    }
    
    stopVisualization() {
        // Визуализация отключена - UI не используется
        return;
    }
    
    cleanup() {
        clearInterval(this.timerInterval);
        this.stopVisualization();
        
        // Убираем все ссылки на UI
        this.container = null;
        this.timerDisplay = null;
        this.waveCanvas = null;
        this.visualizerCtx = null;
        this.progressBar = null;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }
        
        this.analyser = null;
        this.dataArray = null;
        this.mediaRecorder = null;
        this.isRecording = false;
        this.isPaused = false;
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    destroy() {
        this.cleanup();
    }
}