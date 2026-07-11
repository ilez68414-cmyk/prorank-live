// ============================================================
// ОБРАБОТЧИК ОШИБОК
// ============================================================

// ===== ПОКАЗАТЬ ОШИБКУ ПОЛЬЗОВАТЕЛЮ =====
export function showError(message, type = 'error') {
    let container = document.getElementById('errorContainer');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'errorContainer';
        container.style.cssText = `
            position: fixed;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            max-width: 90%;
            width: 480px;
            padding: 14px 20px;
            border-radius: 16px;
            font-weight: 600;
            font-size: 0.9rem;
            animation: slideDown 0.3s ease;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            backdrop-filter: blur(8px);
            display: none;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        document.body.appendChild(container);
    }
    
    const colors = {
        error: { bg: 'rgba(220,38,38,0.9)', color: '#fff' },
        success: { bg: 'rgba(22,163,74,0.9)', color: '#fff' },
        warning: { bg: 'rgba(251,191,36,0.9)', color: '#000' },
        info: { bg: 'rgba(59,130,246,0.9)', color: '#fff' }
    };
    
    const style = colors[type] || colors.error;
    container.style.background = style.bg;
    container.style.color = style.color;
    
    const icons = {
        error: '❌',
        success: '✅',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    container.innerHTML = `${icons[type] || '⚠️'} ${message}`;
    container.style.display = 'block';
    
    clearTimeout(container._hideTimeout);
    container._hideTimeout = setTimeout(() => {
        container.style.display = 'none';
    }, 5000);
}

// ===== СКРЫТЬ ОШИБКУ =====
export function hideError() {
    const container = document.getElementById('errorContainer');
    if (container) container.style.display = 'none';
}

// ===== ОБРАБОТКА FIREBASE ОШИБОК =====
export function handleFirebaseError(err) {
    const errorMessages = {
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/email-already-in-use': 'Этот email уже зарегистрирован',
        'auth/weak-password': 'Пароль должен быть минимум 6 символов',
        'auth/invalid-email': 'Неверный email',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
        'auth/network-request-failed': 'Проблема с интернет-соединением',
        'auth/user-disabled': 'Аккаунт заблокирован',
        'auth/invalid-credential': 'Неверный email или пароль',
        'permission-denied': 'Нет доступа к этому действию',
        'unavailable': 'Сервер временно недоступен. Попробуйте позже',
        'not-found': 'Данные не найдены',
        'already-exists': 'Такая запись уже существует'
    };
    
    const message = errorMessages[err.code] || err.message || 'Неизвестная ошибка';
    console.error(`❌ ${err.code}:`, err);
    return message;
}

// ===== ОБЁРТКА ДЛЯ АСИНХРОННЫХ ФУНКЦИЙ =====
export function withErrorHandling(fn, errorMessage = 'Ошибка выполнения') {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (err) {
            const userMessage = handleFirebaseError(err);
            showError(userMessage);
            throw err;
        }
    };
}

// ===== ГЛОБАЛЬНАЯ ОБРАБОТКА =====
export function initErrorHandler() {
    window.addEventListener('error', function(event) {
        console.error('❌ Глобальная ошибка:', event.message);
        showError('Произошла непредвиденная ошибка. Мы уже работаем над исправлением.');
        return true;
    });

    window.addEventListener('unhandledrejection', function(event) {
        console.error('❌ Необработанный Promise:', event.reason);
        const message = handleFirebaseError(event.reason);
        showError(message);
    });
}

// ===== ДОБАВЛЯЕМ СТИЛИ =====
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
`;
document.head.appendChild(style);

// ===== АВТО-ИНИЦИАЛИЗАЦИЯ =====
initErrorHandler();

console.log('✅ Обработчик ошибок инициализирован');