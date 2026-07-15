// fix-prompt.js - Глобальный перехватчик для BeforeInstallPromptEvent
(function() {
    const originalPrompt = BeforeInstallPromptEvent.prototype.prompt;
    
    BeforeInstallPromptEvent.prototype.prompt = function() {
        console.warn('🔧 prompt() вызван, но мы его блокируем до клика');
        // Ничего не делаем - просто логируем
        return Promise.resolve({ outcome: 'dismissed' });
    };
    
    console.log('✅ Фикс prompt() установлен - он теперь ничего не делает');
})();