import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app",
    messagingSenderId: "716836144015",
    appId: "1:716836144015:web:f1575147750608d0f881fa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let challengesIndicator = null;
let fighterMoneyIndicator = null;
let partnerWalletIndicator = null;
let deferredPrompt = null;

// ===== ГЛОБАЛЬНЫЕ СТИЛИ ДЛЯ МОДАЛКИ ДЕЙСТВИЙ =====
function injectQuickActionsStyles() {
    // Проверяем, есть ли уже стили
    if (document.getElementById('quickActionsStyles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'quickActionsStyles';
    styles.textContent = `
        /* ===== МОДАЛКА БЫСТРЫХ ДЕЙСТВИЙ ===== */
        .quick-actions-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            z-index: 9999 !important;
            background: rgba(0,0,0,0.75) !important;
            backdrop-filter: blur(6px) !important;
            animation: quickFadeIn 0.25s ease !important;
        }
        
        .quick-actions-panel {
            background: radial-gradient(ellipse at 30% 40%, rgba(251,191,36,0.08) 0%, transparent 60%),
                        linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%) !important;
            border-radius: 24px !important;
            padding: 24px !important;
            width: 90% !important;
            max-width: 380px !important;
            border: 1px solid rgba(251,191,36,0.12) !important;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important;
            animation: quickSlideUp 0.3s ease !important;
            max-height: 85vh !important;
            overflow-y: auto !important;
        }
        
        .quick-actions-header {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            font-size: 1rem !important;
            font-weight: 700 !important;
            color: #fbbf24 !important;
            padding-bottom: 16px !important;
            border-bottom: 1px solid rgba(251,191,36,0.08) !important;
            margin-bottom: 12px !important;
        }
        
        .quick-action-item {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 12px 16px !important;
            border-radius: 12px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            color: #ddd !important;
            font-size: 0.85rem !important;
            border-bottom: 1px solid rgba(255,255,255,0.03) !important;
        }
        
        .quick-action-item:hover {
            background: rgba(251,191,36,0.08) !important;
            transform: translateX(4px) !important;
        }
        
        .quick-action-item i {
            color: #fbbf24 !important;
            width: 20px !important;
            text-align: center !important;
        }
        
        .quick-actions-close {
            text-align: center !important;
            padding: 12px 0 4px !important;
            color: #555 !important;
            font-size: 0.7rem !important;
            cursor: pointer !important;
            border-top: 1px solid rgba(255,255,255,0.03) !important;
            margin-top: 8px !important;
            transition: all 0.2s ease !important;
        }
        
        .quick-actions-close:hover {
            color: #fbbf24 !important;
        }
        
        @keyframes quickFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes quickSlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        /* ===== АДАПТИВ ДЛЯ МОДАЛКИ ===== */
        @media (max-width: 480px) {
            .quick-actions-panel {
                padding: 18px !important;
                width: 95% !important;
                border-radius: 20px !important;
            }
            
            .quick-actions-header {
                font-size: 0.85rem !important;
                padding-bottom: 12px !important;
            }
            
            .quick-action-item {
                padding: 10px 12px !important;
                font-size: 0.75rem !important;
            }
            
            .quick-action-item i {
                font-size: 0.85rem !important;
            }
        }
    `;
    
    document.head.appendChild(styles);
}

// Вызываем инъекцию сразу
injectQuickActionsStyles();

function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop();
    return page || 'index.html';
}

function setActiveLink(links, currentPage) {
    const currentPath = currentPage.split('?')[0];
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        const hrefPath = href.split('?')[0];
        if (hrefPath === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function initBurger() {
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    
    if (menuToggle && navLinks) {
        const newToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newToggle, menuToggle);
        
        newToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            navLinks.classList.toggle('show');
        });
    }
}

function initMobileSubmenus() {
    document.querySelectorAll('.mobile-submenu-trigger').forEach(trigger => {
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        newTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            const parent = newTrigger.closest('.mobile-submenu');
            if (parent) parent.classList.toggle('open');
        });
    });
}

function removeOldIndicators() {
    const oldIndicator = document.getElementById('balanceIndicator');
    if (oldIndicator) oldIndicator.remove();
    const oldWalletIndicator = document.querySelector('.wallet-indicator');
    if (oldWalletIndicator) oldWalletIndicator.remove();
}

function createIndicators() {
    removeOldIndicators();
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    let indicatorsContainer = document.querySelector('.header-indicators');
    if (indicatorsContainer) {
        challengesIndicator = document.getElementById('challengesIndicator');
        fighterMoneyIndicator = document.getElementById('fighterMoneyIndicator');
        partnerWalletIndicator = document.getElementById('partnerWalletIndicator');
        return;
    }
    
    indicatorsContainer = document.createElement('div');
    indicatorsContainer.className = 'header-indicators';
    indicatorsContainer.innerHTML = `
        <div class="challenges-indicator" id="challengesIndicator" style="display: none;">
            <i class="fas fa-crosshairs"></i>
            <span class="challenges-count" id="headerChallengesCount">0</span>
            <button class="challenges-plus" id="balancePlusBtn">+</button>
        </div>
        <div class="fighter-money-indicator" id="fighterMoneyIndicator" style="display: none;" onclick="window.location.href='buyer-wallet.html'">
            <i class="fas fa-ruble-sign"></i>
            <span class="fighter-money-amount" id="fighterMoneyAmount">0</span>
            <i class="fas fa-chevron-right" style="font-size: 0.7rem;"></i>
        </div>
        <div class="partner-wallet-indicator" id="partnerWalletIndicator" style="display: none;" onclick="window.location.href='wallet.html'">
            <i class="fas fa-wallet"></i>
            <span class="partner-wallet-amount" id="partnerWalletAmount">0 ₽</span>
            <i class="fas fa-chevron-right" style="font-size: 0.7rem;"></i>
        </div>
    `;
    
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        navbar.insertBefore(indicatorsContainer, menuToggle);
    } else {
        navbar.appendChild(indicatorsContainer);
    }
    
    challengesIndicator = document.getElementById('challengesIndicator');
    fighterMoneyIndicator = document.getElementById('fighterMoneyIndicator');
    partnerWalletIndicator = document.getElementById('partnerWalletIndicator');
    
    const plusBtn = document.getElementById('balancePlusBtn');
    if (plusBtn) plusBtn.onclick = () => {
        navigateWithAnimation('shop.html');
    };
}

// ============================================================
// ФУНКЦИИ УВЕДОМЛЕНИЙ (ДЛЯ ИСПОЛЬЗОВАНИЯ В PROFILE.HTML)
// ============================================================

export async function getNotificationStatus() {
    try {
        const { isPushSupported, getPushStatus } = await import('./push-notifications.js');
        if (!isPushSupported()) {
            return { supported: false, subscribed: false, permission: 'unsupported' };
        }
        const status = await getPushStatus();
        return {
            supported: true,
            subscribed: status.subscribed && status.permission === 'granted',
            permission: status.permission
        };
    } catch (err) {
        console.error('Ошибка получения статуса уведомлений:', err);
        return { supported: false, subscribed: false, permission: 'error' };
    }
}

export async function toggleNotifications() {
    try {
        const { isPushSupported, subscribeToPush, unsubscribeFromPush, getPushStatus } = await import('./push-notifications.js');
        
        if (!isPushSupported()) {
            throw new Error('Push-уведомления не поддерживаются в этом браузере');
        }
        
        const status = await getPushStatus();
        
        if (status.permission === 'denied') {
            throw new Error('Уведомления заблокированы в браузере. Разрешите их в настройках браузера.');
        }
        
        const currentlySubscribed = status.subscribed && status.permission === 'granted';
        
        if (currentlySubscribed) {
            const result = await unsubscribeFromPush();
            if (result) {
                return { success: true, action: 'unsubscribed', message: 'Уведомления отключены' };
            } else {
                throw new Error('Не удалось отключить уведомления');
            }
        } else {
            const result = await subscribeToPush();
            if (result) {
                return { success: true, action: 'subscribed', message: 'Уведомления включены' };
            } else {
                throw new Error('Не удалось включить уведомления');
            }
        }
    } catch (err) {
        console.error('Ошибка переключения уведомлений:', err);
        return { success: false, error: err.message };
    }
}

// Делаем функции доступными глобально для использования в profile.html
window.getNotificationStatus = getNotificationStatus;
window.toggleNotifications = toggleNotifications;

window.updateHeaderBalance = async function() {
    const user = auth.currentUser;
    const balanceCount = document.getElementById('headerChallengesCount');
    if (!user || !balanceCount) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        const data = userDoc.data();
        if (data?.isPartner === true) {
            if (challengesIndicator) challengesIndicator.style.display = 'none';
            return;
        }
        const total = (data.freeChallenges || 0) + (data.purchasedChallenges || 0);
        balanceCount.innerText = total;
        if (challengesIndicator) challengesIndicator.style.display = 'flex';
    } catch (err) { console.error(err); }
};

async function updateFighterMoneyBalance() {
    const user = auth.currentUser;
    if (!user || !fighterMoneyIndicator) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (userDoc.data()?.isPartner === true) {
            fighterMoneyIndicator.style.display = 'none';
            return;
        }
        const balanceDoc = await getDoc(doc(db, "wallet_balances", user.uid));
        let available = balanceDoc.exists() ? (balanceDoc.data().available || 0) : 0;
        const moneyAmount = document.getElementById('fighterMoneyAmount');
        if (moneyAmount) moneyAmount.innerText = available.toLocaleString();
        fighterMoneyIndicator.style.display = 'flex';
    } catch (err) { console.error(err); }
}

async function updatePartnerWalletBalance() {
    const user = auth.currentUser;
    if (!user || !partnerWalletIndicator) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        const isPartner = userDoc.data()?.isPartner === true;
        if (!isPartner) {
            partnerWalletIndicator.style.display = 'none';
            return;
        }
        const partnersQuery = query(collection(db, "partners"), where("email", "==", user.email));
        const partnersSnap = await getDocs(partnersQuery);
        if (partnersSnap.empty) {
            partnerWalletIndicator.style.display = 'none';
            return;
        }
        const partnerId = partnersSnap.docs[0].id;
        const balanceDoc = await getDoc(doc(db, "wallet_balances", partnerId));
        let available = balanceDoc.exists() ? (balanceDoc.data().available || 0) : 0;
        const walletAmount = document.getElementById('partnerWalletAmount');
        if (walletAmount) walletAmount.innerText = available.toLocaleString() + ' ₽';
        partnerWalletIndicator.style.display = 'flex';
    } catch (err) { console.error(err); }
}

function ensureMobileNavContainer() {
    let container = document.getElementById('mobileBottomNavContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mobileBottomNavContainer';
        document.body.appendChild(container);
    }
    return container;
}

async function renderMobileBottomNav() {
    const container = ensureMobileNavContainer();
    if (!container) return;
    
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const user = auth.currentUser;
    let isPartner = false;
    let userId = null;
    
    if (user) {
        userId = user.uid;
        try {
            const userDoc = await getDoc(doc(db, "fighters", userId));
            isPartner = userDoc.data()?.isPartner === true;
        } catch (err) {
            console.error('Ошибка загрузки данных пользователя:', err);
        }
    }
    
    const profileLink = isPartner ? 'partner-dashboard.html' : `profile.html?id=${userId || ''}`;
    const profileIcon = isPartner ? 'fa-chart-line' : 'fa-user';
    const profileText = isPartner ? 'Кабинет' : 'Профиль';
    
    // ===== ПРОВЕРКА: мы на своей странице профиля? =====
    let isMyProfile = false;
    
    if (currentPage === 'profile.html') {
        const urlParams = new URLSearchParams(window.location.search);
        const profileId = urlParams.get('id');
        if (!profileId || (userId && profileId === userId)) {
            isMyProfile = true;
        }
    }
    
    if (currentPage === 'partner-dashboard.html' && isPartner) {
        isMyProfile = true;
    }
    
    container.innerHTML = `
        <nav class="mobile-bottom-nav">
            <a href="index.html" class="mobile-nav-item ${currentPage === 'index.html' ? 'active' : ''}">
                <i class="fas fa-home"></i>
                <span>Главная</span>
            </a>
            <a href="catalog.html" class="mobile-nav-item ${currentPage === 'catalog.html' ? 'active' : ''}">
                <i class="fas fa-store"></i>
                <span>Каталог</span>
            </a>
            <div class="mobile-nav-center" id="centerActionBtn">
                <div class="center-button">
                    <i class="fas fa-bolt"></i>
                </div>
            </div>
            <a href="chats.html" class="mobile-nav-item ${currentPage === 'chats.html' ? 'active' : ''}">
                <i class="fas fa-comments"></i>
                <span>Чаты</span>
            </a>
            <a href="${profileLink}" class="mobile-nav-item ${isMyProfile ? 'active' : ''}" id="mobileProfileBtn">
                <i class="fas ${profileIcon}"></i>
                <span>${profileText}</span>
            </a>
        </nav>
    `;
    
    const mobileProfileBtn = document.getElementById('mobileProfileBtn');
    if (mobileProfileBtn) {
        mobileProfileBtn.onclick = (e) => {
            e.preventDefault();
            navigateWithAnimation(profileLink);
        };
    }
    
    // ===== КНОПКА "ДЕЙСТВИЯ" (МОЛНИЯ) =====
    const centerBtn = document.getElementById('centerActionBtn');
    if (centerBtn) {
        centerBtn.onclick = () => {
            let actions = [];
            
            if (isPartner) {
                // 🔥 МЕНЮ ДЛЯ ПАРТНЁРА (без "Магазин" — он уже в навигации)
                actions = [
                    { text: 'Аналитика', icon: 'fa-chart-line', url: 'partner-analytics.html' },
                    { text: 'Товары', icon: 'fa-box', url: 'partner-products.html' },
                    { text: 'Заказы', icon: 'fa-shopping-cart', url: 'partner-orders.html' },
                    { text: 'Отзывы', icon: 'fa-star', url: 'partner-reviews.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'wallet.html' }
                ];
            } else {
                // 🔥 МЕНЮ ДЛЯ ОБЫЧНОГО БОЙЦА
                actions = [
                    { text: 'Премиум и вызовы', icon: 'fa-gem', url: 'shop.html' },
                    { text: 'Кинуть вызов', icon: 'fa-fist-raised', url: 'challenges.html' },
                    { text: 'Мой рейтинг', icon: 'fa-chart-line', url: 'rating.html' },
                    { text: 'Лиги', icon: 'fa-trophy', url: 'leagues.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'buyer-wallet.html' },
                    { text: 'Залы', icon: 'fa-building', url: 'halls.html' },
                    { text: 'О проекте', icon: 'fa-info-circle', url: 'about.html' }
                ];
            }
            
            actions.push({ text: 'Выйти', icon: 'fa-sign-out-alt', isLogout: true });
            
            let menu = document.getElementById('quickActionsMenu');
            if (menu) menu.remove();
            
            menu = document.createElement('div');
            menu.id = 'quickActionsMenu';
            menu.innerHTML = `
                <div class="quick-actions-overlay">
                    <div class="quick-actions-panel">
                        <div class="quick-actions-header">
                            <i class="fas fa-bolt"></i> ${isPartner ? 'Управление магазином' : 'Быстрые действия'}
                        </div>
                        ${actions.map(a => `
                            <div class="quick-action-item" data-url="${a.url || ''}" data-logout="${a.isLogout || false}">
                                <i class="fas ${a.icon}"></i>
                                <span>${a.text}</span>
                            </div>
                        `).join('')}
                        <div class="quick-actions-close">Закрыть</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(menu);
            
            menu.querySelectorAll('.quick-action-item').forEach(item => {
                const url = item.dataset.url;
                const isLogout = item.dataset.logout === 'true';
                
                if (isLogout) {
                    item.onclick = async () => {
                        await signOut(auth);
                        window.location.href = 'index.html';
                    };
                } else if (url) {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        menu.remove();
                        navigateWithAnimation(url);
                    };
                }
            });
            
            menu.querySelector('.quick-actions-close').onclick = () => menu.remove();
            menu.onclick = (e) => { if (e.target === menu) menu.remove(); };
        };
    }
}

function initPWABanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (!banner) return;
    
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        banner.style.display = 'none';
        return;
    }
    
    banner.style.display = 'flex';
    
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) {
        installBtn.onclick = async () => {
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            
            if (isIOS) {
                alert('Нажмите "Поделиться" → "На экран Домой"');
            } else if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    banner.style.display = 'none';
                }
                deferredPrompt = null;
            } else {
                alert('Нажмите меню (три точки) → "Установить приложение"');
            }
        };
    }
    
    const closeBtn = document.getElementById('closePwaBanner');
    if (closeBtn) {
        closeBtn.onclick = () => {
            banner.style.display = 'none';
        };
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('PWA установка доступна');
    e.preventDefault();
    deferredPrompt = e;
    deferredPrompt.prompt();
    
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('Пользователь установил PWA');
            const banner = document.getElementById('pwaInstallBanner');
            if (banner) banner.style.display = 'none';
        } else {
            console.log('Пользователь отклонил установку');
        }
        deferredPrompt = null;
    });
});

document.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (link && link.href && link.href.startsWith(window.location.origin)) {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            e.preventDefault();
            window.location.href = link.href;
        }
    }
});

window.addEventListener('appinstalled', () => {
    console.log('PWA установлено');
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/prorank-live/sw-v2.js').catch(err => console.error('SW error:', err));
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str;
}

// ============================================================
// 🔥 АНИМАЦИЯ ПЕРЕХОДОВ - СВЕТОВАЯ ДОРОЖКА
// ============================================================

function createTransitionElement() {
    if (document.querySelector('.page-transition')) {
        return document.querySelector('.page-transition');
    }
    
    const transition = document.createElement('div');
    transition.className = 'page-transition';
    transition.innerHTML = '<div class="light"></div>';
    document.body.appendChild(transition);
    return transition;
}

function navigateWithAnimation(url) {
    const transition = createTransitionElement();
    
    transition.style.opacity = '1';
    transition.style.pointerEvents = 'auto';
    
    setTimeout(() => {
        transition.classList.add('active');
    }, 50);
    
    setTimeout(() => {
        window.location.href = url;
    }, 700);
}

function animatePageIn() {
    const body = document.body;
    body.classList.add('page-fade-in');
    
    setTimeout(() => {
        body.classList.remove('page-fade-in');
    }, 400);
    
    const transition = document.querySelector('.page-transition');
    if (transition) {
        setTimeout(() => {
            transition.classList.remove('active');
            transition.style.opacity = '0';
            transition.style.pointerEvents = 'none';
        }, 350);
    }
}

function setupGlobalNavigation() {
    function handleLinkClick(e) {
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        if (!href) return;
        
        if (link.target === '_blank' || 
            href.startsWith('#') || 
            link.hasAttribute('data-no-animation') ||
            href === '#' ||
            href === '' ||
            href.includes('javascript:')) {
            return;
        }
        
        if (!href.startsWith('http') || href.includes(window.location.hostname) || href.startsWith('/')) {
            e.preventDefault();
            navigateWithAnimation(href);
        }
    }
    
    document.querySelectorAll('.nav-links a, .logo, [data-navigate]').forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        newLink.addEventListener('click', handleLinkClick);
    });
    
    document.querySelectorAll('.mobile-nav-item, .mobile-nav-center .center-button').forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        newLink.addEventListener('click', handleLinkClick);
    });
    
    document.querySelectorAll('.mobile-submenu-content a, .quick-action-item[data-url]').forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        newLink.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href) return;
            
            const mobileMenu = this.closest('.mobile-submenu-content');
            if (mobileMenu) {
                const parent = mobileMenu.closest('.mobile-submenu');
                if (parent) parent.classList.remove('open');
            }
            
            const navLinks = document.getElementById('navLinks');
            if (navLinks) navLinks.classList.remove('show');
            
            if (!href.startsWith('http') || href.includes(window.location.hostname) || href.startsWith('/')) {
                e.preventDefault();
                navigateWithAnimation(href);
            }
        });
    });
}

async function initHeader() {
    ensureMobileNavContainer();
    
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    createIndicators();

    const user = auth.currentUser;
    let isPartner = false;
    let userId = null;
    let userName = '';

    if (user) {
        userId = user.uid;
        try {
            const userDoc = await getDoc(doc(db, "fighters", userId));
            isPartner = userDoc.data()?.isPartner === true;
            userName = userDoc.data()?.name || 'Боец';
            setTimeout(() => {
                window.updateHeaderBalance();
                updateFighterMoneyBalance();
                updatePartnerWalletBalance();
            }, 100);
        } catch (err) { console.error(err); }
    }

    const currentPage = getCurrentPage();
    const isDesktop = window.innerWidth > 768;

    function updateActiveAndLogout() {
        const links = navLinks.querySelectorAll('a');
        setActiveLink(links, currentPage);
        const logoutLink = document.getElementById('logoutLink');
        if (logoutLink) {
            const newLogout = logoutLink.cloneNode(true);
            logoutLink.parentNode.replaceChild(newLogout, logoutLink);
            newLogout.addEventListener('click', async (e) => {
                e.preventDefault();
                await signOut(auth);
                window.location.href = 'index.html';
            });
        }
    }

    if (navLinks.children.length > 0) {
        updateActiveAndLogout();
        initBurger();
        initMobileSubmenus();
        await renderMobileBottomNav();
        initPWABanner();
        setupGlobalNavigation();
        return;
    }

    if (isDesktop) {
        if (user && isPartner) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="messages">
                    <button class="dropbtn"><i class="fas fa-comments"></i> Общение <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="catalog.html"><i class="fas fa-boxes"></i> Каталог товаров</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Залы</a>
                    </div>
                </div>
                <div class="dropdown" data-section="finance">
                    <button class="dropbtn"><i class="fas fa-wallet"></i> Финансы <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="wallet.html"><i class="fas fa-wallet"></i> Мой кошелёк</a>
                    </div>
                </div>
                <div class="user-menu">
                    <img src="${user.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${escapeHtml(userName)}</span>
                        <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет партнёра</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (user && !isPartner) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Залы</a>
                        <a href="shop.html"><i class="fas fa-gem"></i> Премиум</a>
                    </div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                    </div>
                </div>
                <div class="user-menu">
                    <img src="${user.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${escapeHtml(userName)}</span>
                        <a href="buyer-wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                        <a href="profile.html?id=${userId}"><i class="fas fa-user"></i> Профиль</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a>
                        <a href="shop.html"><i class="fas fa-gem"></i> Премиум</a>
                    </div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <a href="login.html" class="login-btn"><i class="fas fa-sign-in-alt"></i> Войти</a>
            `;
        }
    } else {
        if (user && isPartner) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-comments"></i> Общение <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Залы</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-wallet"></i> Финансы <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                    </div>
                </div>
                <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (user && !isPartner) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Залы</a>
                        <a href="shop.html"><i class="fas fa-gem"></i> Премиум</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                    </div>
                </div>
                <a href="buyer-wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                <a href="profile.html?id=${userId}"><i class="fas fa-user"></i> Профиль</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a>
                        <a href="shop.html"><i class="fas fa-gem"></i> Премиум</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <a href="login.html"><i class="fas fa-sign-in-alt"></i> Войти</a>
            `;
        }
        initMobileSubmenus();
    }

    updateActiveAndLogout();
    initBurger();
    await renderMobileBottomNav();
    initPWABanner();
    setupGlobalNavigation();
}

// ===== ЭКСПОРТЫ ДЛЯ ДРУГИХ МОДУЛЕЙ =====
export { 
    renderMobileBottomNav, 
    initHeader, 
    navigateWithAnimation,
    updateFighterMoneyBalance,
    updatePartnerWalletBalance
};

// ===== АНИМАЦИЯ ВХОДА НА СТРАНИЦУ =====
if (document.readyState === 'complete') {
    setTimeout(animatePageIn, 100);
} else {
    window.addEventListener('load', () => {
        setTimeout(animatePageIn, 100);
    });
}

setInterval(() => {
    const menu = document.querySelector('.mobile-bottom-nav');
    if (menu) menu.style.display = 'flex';
}, 300);

window.addEventListener('popstate', () => setTimeout(renderMobileBottomNav, 50));
window.addEventListener('pageshow', () => setTimeout(renderMobileBottomNav, 50));

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => {
        await initHeader();
    });
});

window.updateFighterMoneyBalance = updateFighterMoneyBalance;
window.updatePartnerWalletBalance = updatePartnerWalletBalance;
window.navigateWithAnimation = navigateWithAnimation;
window.animatePageIn = animatePageIn;