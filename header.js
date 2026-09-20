import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { initSeasons, lazyResetFighter, lazyResetClub } from './seasons.js';

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
    if (document.getElementById('quickActionsStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'quickActionsStyles';
    styles.textContent = `
        .quick-actions-overlay { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 9999 !important; background: rgba(0,0,0,0.75) !important; backdrop-filter: blur(6px) !important; animation: quickFadeIn 0.25s ease !important; }
        .quick-actions-panel { background: radial-gradient(ellipse at 30% 40%, rgba(251,191,36,0.08) 0%, transparent 60%), linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%) !important; border-radius: 24px !important; padding: 24px !important; width: 90% !important; max-width: 380px !important; border: 1px solid rgba(251,191,36,0.12) !important; box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important; animation: quickSlideUp 0.3s ease !important; max-height: 85vh !important; overflow-y: auto !important; }
        .quick-actions-header { display: flex !important; align-items: center !important; gap: 10px !important; font-size: 1rem !important; font-weight: 700 !important; color: #fbbf24 !important; padding-bottom: 16px !important; border-bottom: 1px solid rgba(251,191,36,0.08) !important; margin-bottom: 12px !important; }
        .quick-action-item { display: flex !important; align-items: center !important; gap: 12px !important; padding: 12px 16px !important; border-radius: 12px !important; cursor: pointer !important; transition: all 0.2s ease !important; color: #ddd !important; font-size: 0.85rem !important; border-bottom: 1px solid rgba(255,255,255,0.03) !important; }
        .quick-action-item:hover { background: rgba(251,191,36,0.08) !important; transform: translateX(4px) !important; }
        .quick-action-item i { color: #fbbf24 !important; width: 20px !important; text-align: center !important; }
        .quick-actions-close { text-align: center !important; padding: 12px 0 4px !important; color: #555 !important; font-size: 0.7rem !important; cursor: pointer !important; border-top: 1px solid rgba(255,255,255,0.03) !important; margin-top: 8px !important; transition: all 0.2s ease !important; }
        .quick-actions-close:hover { color: #fbbf24 !important; }
        @keyframes quickFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes quickSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 480px) { .quick-actions-panel { padding: 18px !important; width: 95% !important; border-radius: 20px !important; } .quick-actions-header { font-size: 0.85rem !important; padding-bottom: 12px !important; } .quick-action-item { padding: 10px 12px !important; font-size: 0.75rem !important; } }
    `;
    document.head.appendChild(styles);
}
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
        if (hrefPath === currentPath) link.classList.add('active');
        else link.classList.remove('active');
    });
}

function initBurger() {
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    if (menuToggle && navLinks) {
        const newToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newToggle, menuToggle);
        newToggle.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
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
    if (menuToggle) navbar.insertBefore(indicatorsContainer, menuToggle);
    else navbar.appendChild(indicatorsContainer);
    
    challengesIndicator = document.getElementById('challengesIndicator');
    fighterMoneyIndicator = document.getElementById('fighterMoneyIndicator');
    partnerWalletIndicator = document.getElementById('partnerWalletIndicator');
    
    const plusBtn = document.getElementById('balancePlusBtn');
    if (plusBtn) plusBtn.onclick = () => { window.location.href = 'shop.html'; };
}

export async function getNotificationStatus() {
    try {
        const { isPushSupported, getPushStatus } = await import('./push-notifications.js');
        if (!isPushSupported()) return { supported: false, subscribed: false, permission: 'unsupported' };
        const status = await getPushStatus();
        return { supported: true, subscribed: status.subscribed && status.permission === 'granted', permission: status.permission };
    } catch (err) {
        return { supported: false, subscribed: false, permission: 'error' };
    }
}

export async function toggleNotifications() {
    try {
        const { isPushSupported, subscribeToPush, unsubscribeFromPush, getPushStatus } = await import('./push-notifications.js');
        if (!isPushSupported()) throw new Error('Push-уведомления не поддерживаются');
        const status = await getPushStatus();
        if (status.permission === 'denied') throw new Error('Уведомления заблокированы в браузере');
        
        const currentlySubscribed = status.subscribed && status.permission === 'granted';
        if (currentlySubscribed) {
            const result = await unsubscribeFromPush();
            if (result) return { success: true, action: 'unsubscribed', message: 'Уведомления отключены' };
            else throw new Error('Не удалось отключить уведомления');
        } else {
            const result = await subscribeToPush();
            if (result) return { success: true, action: 'subscribed', message: 'Уведомления включены' };
            else throw new Error('Не удалось включить уведомления');
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}
window.getNotificationStatus = getNotificationStatus;
window.toggleNotifications = toggleNotifications;

window.updateHeaderBalance = async function() {
    const user = auth.currentUser;
    const balanceCount = document.getElementById('headerChallengesCount');
    if (!user || !balanceCount) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (!userDoc.exists() || userDoc.data()?.isPartner === true) {
            if (challengesIndicator) challengesIndicator.style.display = 'none';
            return;
        }
        const data = userDoc.data();
        const total = (data.freeChallenges || 0) + (data.purchasedChallenges || 0);
        balanceCount.innerText = total;
        if (challengesIndicator) challengesIndicator.style.display = 'flex';
    } catch (err) { 
        if (challengesIndicator) challengesIndicator.style.display = 'none';
    }
};

async function updateFighterMoneyBalance() {
    const user = auth.currentUser;
    if (!user || !fighterMoneyIndicator) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (!userDoc.exists() || userDoc.data()?.isPartner === true) {
            fighterMoneyIndicator.style.display = 'none';
            return;
        }
        const balanceDoc = await getDoc(doc(db, "wallet_balances", user.uid));
        let available = balanceDoc.exists() ? (balanceDoc.data().available || 0) : 0;
        const moneyAmount = document.getElementById('fighterMoneyAmount');
        if (moneyAmount) moneyAmount.innerText = available.toLocaleString();
        fighterMoneyIndicator.style.display = 'flex';
    } catch (err) { 
        fighterMoneyIndicator.style.display = 'none';
    }
}

async function updatePartnerWalletBalance() {
    const user = auth.currentUser;
    if (!user || !partnerWalletIndicator) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (!userDoc.exists() || userDoc.data()?.isPartner !== true) {
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
    } catch (err) { 
        partnerWalletIndicator.style.display = 'none';
    }
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

// ===== ИСПРАВЛЕННАЯ ЛОГИКА ОПРЕДЕЛЕНИЯ РОЛЕЙ =====
async function getUserRoles(userId) {
    let isPartner = false;
    let isClubUser = false;
    let isOrgUser = false;
    let myClubId = null;
    let myOrgId = null;
    let userName = 'Пользователь';

    try {
        // 1. Проверяем бойца/партнера (независимо от остального)
        const userDoc = await getDoc(doc(db, "fighters", userId));
        if (userDoc.exists()) {
            isPartner = userDoc.data()?.isPartner === true;
            myClubId = userDoc.data()?.clubId || null;
            userName = userDoc.data()?.name || 'Боец';
        }

        // 2. Проверяем клуб (независимо)
        const clubDoc = await getDoc(doc(db, "clubs", userId));
        if (clubDoc.exists()) {
            isClubUser = true;
            myClubId = userId;
            userName = clubDoc.data()?.name || 'Клуб';
        }

        // 3. Проверяем организатора (НЕЗАВИСИМО! Даже если есть документ fighter)
        const orgRequests = await getDocs(query(
            collection(db, "organization_requests"),
            where("userId", "==", userId),
            where("status", "==", "approved")
        ));
        if (!orgRequests.empty) {
            const request = orgRequests.docs[0].data();
            isOrgUser = true;
            myOrgId = request.organizationId || orgRequests.docs[0].id;
            userName = request.orgName || 'Организация';
        }

        // 🔧 СЕЗОНЫ: ленивый сброс FRS при заходе
        // ⚠️ Только для бойцов (не партнёров, не клубов-как-юзеров)
        if (!isPartner && !isClubUser) {
            try {
                initSeasons(db, auth);
                await lazyResetFighter(userId);
                // Если боец в клубе — сбрасываем и clubFRS клуба
                if (myClubId) {
                    await lazyResetClub(myClubId);
                }
            } catch (seasonsErr) {
                console.warn('⚠️ Сезоны: ошибка ленивого сброса', seasonsErr);
                // Не роняем приложение — просто логируем
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки ролей:', err);
    }

    return { isPartner, isClubUser, isOrgUser, myClubId, myOrgId, userName };
}

async function renderMobileBottomNav() {
    const container = ensureMobileNavContainer();
    if (!container) return;
    
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const user = auth.currentUser;
    
    // По умолчанию роль бойца
    let displayRole = 'fighter'; 
    let roles = { isPartner: false, isClubUser: false, isOrgUser: false, myClubId: null, myOrgId: null, userName: 'Пользователь' };

    if (user) {
        roles = await getUserRoles(user.uid);
        
        // ПРИОРИТЕТ НАВИГАЦИИ: Организатор > Партнер > Клуб > Боец
        if (roles.isOrgUser) displayRole = 'organizer';
        else if (roles.isPartner) displayRole = 'partner';
        else if (roles.isClubUser) displayRole = 'club';
    }
    
    // Формируем ссылки и иконки на основе ПРИОРИТЕТНОЙ роли
    let profileLink, profileIcon, profileText;
    
    if (displayRole === 'organizer') {
        profileLink = `organization-dashboard.html?id=${roles.myOrgId}`;
        profileIcon = 'fa-building';
        profileText = 'Организация';
    } else if (displayRole === 'partner') {
        profileLink = 'partner-dashboard.html';
        profileIcon = 'fa-chart-line';
        profileText = 'Кабинет';
    } else if (displayRole === 'club') {
        profileLink = `club-profile.html?id=${roles.myClubId}`;
        profileIcon = 'fa-users';
        profileText = 'Клуб';
    } else {
        profileLink = `profile.html?id=${user ? user.uid : ''}`;
        profileIcon = 'fa-user';
        profileText = 'Профиль';
    }

    // Определяем, активна ли вкладка профиля
    let isMyProfile = false;
    if (currentPage === 'profile.html' && user) {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('id') || urlParams.get('id') === user.uid) isMyProfile = true;
    }
    if ((currentPage === 'organization-dashboard.html' && displayRole === 'organizer') ||
        (currentPage === 'partner-dashboard.html' && displayRole === 'partner') ||
        (currentPage === 'club-profile.html' && displayRole === 'club')) {
        isMyProfile = true;
    }
    
    container.innerHTML = `
        <nav class="mobile-bottom-nav">
            <a href="index.html" class="mobile-nav-item ${currentPage === 'index.html' ? 'active' : ''}">
                <i class="fas fa-home"></i><span>Главная</span>
            </a>
            <a href="${displayRole === 'organizer' ? 'tournaments.html' : 'catalog.html'}" class="mobile-nav-item ${(displayRole === 'organizer' && currentPage === 'tournaments.html') || (displayRole !== 'organizer' && currentPage === 'catalog.html') ? 'active' : ''}">
                <i class="fas ${displayRole === 'organizer' ? 'fa-trophy' : 'fa-store'}"></i>
                <span>${displayRole === 'organizer' ? 'Турниры' : 'Каталог'}</span>
            </a>
            <div class="mobile-nav-center" id="centerActionBtn">
                <div class="center-button"><i class="fas fa-bolt"></i></div>
            </div>
            <a href="chats.html" class="mobile-nav-item ${currentPage === 'chats.html' ? 'active' : ''}">
                <i class="fas fa-comments"></i><span>Чаты</span>
            </a>
            <a href="${profileLink}" class="mobile-nav-item ${isMyProfile ? 'active' : ''}" id="mobileProfileBtn">
                <i class="fas ${profileIcon}"></i><span>${profileText}</span>
            </a>
        </nav>
    `;
    
    const mobileProfileBtn = document.getElementById('mobileProfileBtn');
    if (mobileProfileBtn) {
        mobileProfileBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = profileLink;
        };
    }
    
    const centerBtn = document.getElementById('centerActionBtn');
    if (centerBtn) {
        centerBtn.onclick = () => {
            let actions = [];
            
            // Действия строго по приоритетной роли
            if (displayRole === 'organizer') {
                actions = [
                    { text: 'Дашборд', icon: 'fa-chart-pie', url: `organization-dashboard.html?id=${roles.myOrgId}` },
                    { text: 'Мои турниры', icon: 'fa-trophy', url: 'my-tournaments.html' },
                    { text: 'Создать турнир', icon: 'fa-plus', url: 'tournament-create.html' },
                    { text: 'Рейтинг бойцов', icon: 'fa-chart-line', url: 'rating.html' }, // Организатору нужен рейтинг!
                    { text: 'Все турниры', icon: 'fa-list', url: 'tournaments.html' }
                ];
            } else if (displayRole === 'partner') {
                actions = [
                    { text: 'Аналитика', icon: 'fa-chart-line', url: 'partner-analytics.html' },
                    { text: 'Товары', icon: 'fa-box', url: 'partner-products.html' },
                    { text: 'Заказы', icon: 'fa-shopping-cart', url: 'partner-orders.html' },
                    { text: 'Отзывы', icon: 'fa-star', url: 'partner-reviews.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'wallet.html' }
                ];
            } else if (displayRole === 'club') {
                actions = [
                    { text: 'Мой клуб', icon: 'fa-users', url: `club-profile.html?id=${roles.myClubId}` },
                    { text: 'Все клубы', icon: 'fa-building', url: 'clubs.html' },
                    { text: 'Рейтинг', icon: 'fa-chart-line', url: 'rating.html' }
                ];
            } else {
                actions = [
                    { text: 'Премиум и вызовы', icon: 'fa-gem', url: 'shop.html' },
                    { text: 'Кинуть вызов', icon: 'fa-fist-raised', url: 'challenges.html' },
                    { text: 'Мой рейтинг', icon: 'fa-chart-line', url: 'rating.html' },
                    { text: 'Лиги', icon: 'fa-trophy', url: 'leagues.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'buyer-wallet.html' },
                    { text: roles.myClubId ? 'Мой клуб' : 'Клубы', icon: 'fa-users', url: roles.myClubId ? `club-profile.html?id=${roles.myClubId}` : 'clubs.html' },
                    { text: 'Турниры', icon: 'fa-trophy', url: 'tournaments.html' }
                ];
            }
            
            actions.push({ text: 'Выйти', icon: 'fa-sign-out-alt', isLogout: true });
            
            let menu = document.getElementById('quickActionsMenu');
            if (menu) menu.remove();
            
            const roleTitles = { organizer: 'Управление организацией', partner: 'Управление магазином', club: 'Управление клубом', fighter: 'Быстрые действия' };
            
            menu = document.createElement('div');
            menu.id = 'quickActionsMenu';
            menu.innerHTML = `
                <div class="quick-actions-overlay">
                    <div class="quick-actions-panel">
                        <div class="quick-actions-header">
                            <i class="fas fa-bolt"></i> ${roleTitles[displayRole]}
                        </div>
                        ${actions.map(a => `
                            <div class="quick-action-item" data-url="${a.url || ''}" data-logout="${a.isLogout || false}">
                                <i class="fas ${a.icon}"></i><span>${a.text}</span>
                            </div>
                        `).join('')}
                        <div class="quick-actions-close">Закрыть</div>
                    </div>
                </div>
            `;
            document.body.appendChild(menu);
            
            menu.querySelectorAll('.quick-action-item').forEach(item => {
                if (item.dataset.logout === 'true') {
                    item.onclick = async () => { await signOut(auth); window.location.href = 'index.html'; };
                } else if (item.dataset.url) {
                    item.onclick = (e) => { e.stopPropagation(); menu.remove(); window.location.href = item.dataset.url; };
                }
            });
            menu.querySelector('.quick-actions-close').onclick = () => menu.remove();
            menu.onclick = (e) => { if (e.target === menu) menu.remove(); };
        };
    }
}

// ... (Остальные функции PWA, анимаций и навигации остаются без изменений) ...
function initPWABanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (!banner) return;
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        banner.style.display = 'none'; return;
    }
    banner.style.display = 'flex';
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) {
        installBtn.onclick = async () => {
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) alert('Нажмите "Поделиться" → "На экран Домой"');
            else if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; banner.style.display = 'none'; deferredPrompt = null; }
            else alert('Нажмите меню (три точки) → "Установить приложение"');
        };
    }
    const closeBtn = document.getElementById('closePwaBanner');
    if (closeBtn) closeBtn.onclick = () => { banner.style.display = 'none'; };
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
});
window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
});

// ===== SERVICE WORKER (PWA / офлайн-режим) =====
// Единый воркер приложения: кэш интерфейса, офлайн-плашка, push.
const SW_URL = '/prorank-live/sw.js';
const SW_SCOPE = '/prorank-live/';

function registerServiceWorker() {
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
        .then(registration => {
            console.log('✅ Service Worker зарегистрирован:', registration.scope);
            registration.addEventListener('updatefound', () => {
                const installing = registration.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🔄 Загружена новая версия приложения — обновите страницу');
                    }
                });
            });
        })
        .catch(err => console.error('❌ SW error:', err));
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', registerServiceWorker);
}

// ===== ПЛАШКА «ОФЛАЙН-РЕЖИМ. ПРОВЕРЬТЕ СЕТЬ» =====
// Показывается, если связь пропала уже во время работы с приложением.
// При загрузке страницы без интернета такую же плашку добавляет sw.js.
const OFFLINE_BANNER_ID = 'prorankOfflineBanner';

function injectOfflineBannerStyles() {
    if (document.getElementById('prorankOfflineBannerStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'prorankOfflineBannerStyles';
    styles.textContent = `
        #prorankOfflineBanner { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 2147483000 !important; display: flex !important; align-items: center !important; gap: 10px !important; padding: 10px 14px !important; margin: 0 !important; box-sizing: border-box !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: 13px !important; font-weight: 600 !important; line-height: 1.35 !important; letter-spacing: .2px !important; color: #fbbf24 !important; background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 60%, #1a1a1a 100%) !important; border-bottom: 1px solid rgba(251,191,36,.35) !important; box-shadow: 0 8px 24px rgba(0,0,0,.55) !important; transform: translateY(-110%) !important; transition: transform .35s ease, color .35s ease !important; }
        #prorankOfflineBanner.prorank-offline-visible { transform: translateY(0) !important; }
        #prorankOfflineBanner.prorank-offline-restored { color: #4ade80 !important; border-bottom-color: rgba(74,222,128,.45) !important; }
        #prorankOfflineBanner .prorank-offline-dot { width: 9px !important; height: 9px !important; min-width: 9px !important; border-radius: 50% !important; background: #fbbf24 !important; animation: prorankOfflinePulse 1.6s ease-out infinite !important; }
        #prorankOfflineBanner.prorank-offline-restored .prorank-offline-dot { background: #4ade80 !important; animation: none !important; }
        #prorankOfflineBanner .prorank-offline-text { flex: 1 1 auto !important; color: inherit !important; text-align: left !important; }
        #prorankOfflineBanner .prorank-offline-retry { flex: 0 0 auto !important; padding: 7px 16px !important; border: 1px solid rgba(251,191,36,.45) !important; border-radius: 40px !important; background: rgba(251,191,36,.12) !important; color: #fbbf24 !important; font: inherit !important; font-size: 12px !important; font-weight: 700 !important; cursor: pointer !important; }
        @keyframes prorankOfflinePulse { 0% { box-shadow: 0 0 0 0 rgba(251,191,36,.55); } 70% { box-shadow: 0 0 0 10px rgba(251,191,36,0); } 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); } }
        @media (max-width: 420px) { #prorankOfflineBanner { font-size: 12px !important; padding: 9px 12px !important; gap: 8px !important; } #prorankOfflineBanner .prorank-offline-retry { padding: 6px 13px !important; } }
    `;
    document.head.appendChild(styles);
}

function showOfflineBanner() {
    if (document.getElementById(OFFLINE_BANNER_ID)) return;
    injectOfflineBannerStyles();
    const banner = document.createElement('div');
    banner.id = OFFLINE_BANNER_ID;
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = '<span class="prorank-offline-dot"></span>' +
        '<span class="prorank-offline-text">Офлайн-режим. Проверьте сеть</span>' +
        '<button type="button" class="prorank-offline-retry">Обновить</button>';
    const retry = banner.querySelector('.prorank-offline-retry');
    if (retry) retry.onclick = () => window.location.reload();
    (document.body || document.documentElement).appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('prorank-offline-visible'));
}

function hideOfflineBanner() {
    const banner = document.getElementById(OFFLINE_BANNER_ID);
    if (!banner) return;
    banner.classList.add('prorank-offline-restored');
    const label = banner.querySelector('.prorank-offline-text');
    if (label) label.textContent = 'Соединение восстановлено. Обновите страницу';
    setTimeout(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 4000);
}

// Проверка связи «в лоб» — запрос уходит мимо кэша Service Worker
function probeConnection() {
    fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        .then(() => hideOfflineBanner())
        .catch(() => showOfflineBanner());
}

window.addEventListener('offline', showOfflineBanner);
window.addEventListener('online', probeConnection);
if (navigator.onLine === false) showOfflineBanner();
setInterval(() => {
    if (document.getElementById(OFFLINE_BANNER_ID)) probeConnection();
}, 20000);

function createTransitionElement() {
    if (document.querySelector('.page-transition')) return document.querySelector('.page-transition');
    const transition = document.createElement('div');
    transition.className = 'page-transition';
    transition.innerHTML = '<div class="light"></div>';
    document.body.appendChild(transition);
    return transition;
}

function navigateWithAnimation(url) {
    const transition = createTransitionElement();
    transition.style.opacity = '1'; transition.style.pointerEvents = 'auto';
    setTimeout(() => { transition.classList.add('active'); }, 50);
    setTimeout(() => { window.location.href = url; }, 700);
}

function animatePageIn() {
    const body = document.body;
    body.classList.add('page-fade-in');
    setTimeout(() => { body.classList.remove('page-fade-in'); }, 400);
    const transition = document.querySelector('.page-transition');
    if (transition) {
        setTimeout(() => { transition.classList.remove('active'); transition.style.opacity = '0'; transition.style.pointerEvents = 'none'; }, 350);
    }
}

function setupGlobalNavigation() {
    function handleLinkClick(e) {
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        if (!href || link.target === '_blank' || href.startsWith('#') || link.hasAttribute('data-no-animation') || href.includes('javascript:')) return;
        if (!href.startsWith('http') || href.includes(window.location.hostname) || href.startsWith('/')) {
            e.preventDefault();
            navigateWithAnimation(href);
        }
    }
    document.querySelectorAll('.nav-links a, .logo, [data-navigate], .mobile-nav-item, .mobile-nav-center .center-button, .mobile-submenu-content a, .quick-action-item[data-url]').forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        newLink.addEventListener('click', function(e) {
            if (this.classList.contains('quick-action-item')) {
                const menu = document.getElementById('quickActionsMenu');
                if (menu) menu.remove();
            }
            handleLinkClick(e);
        });
    });
}

async function initHeader() {
    ensureMobileNavContainer();
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    createIndicators();
    const user = auth.currentUser;
    let roles = { isPartner: false, isClubUser: false, isOrgUser: false, myClubId: null, myOrgId: null, userName: 'Пользователь' };
    let displayRole = 'fighter';

    if (user) {
        roles = await getUserRoles(user.uid);
        if (roles.isOrgUser) displayRole = 'organizer';
        else if (roles.isPartner) displayRole = 'partner';
        else if (roles.isClubUser) displayRole = 'club';
        
        setTimeout(() => {
            window.updateHeaderBalance();
            updateFighterMoneyBalance();
            updatePartnerWalletBalance();
        }, 100);
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

    const clubLink = roles.myClubId ? `<a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-shield-alt"></i> Мой клуб</a>` : `<a href="clubs.html"><i class="fas fa-users"></i> Клубы</a>`;

    // Генерация верхнего меню строго по приоритетной роли
    if (isDesktop) {
        if (displayRole === 'organizer') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="organization-dashboard.html?id=${roles.myOrgId}"><i class="fas fa-chart-pie"></i> Дашборд</a>
                <a href="my-tournaments.html"><i class="fas fa-trophy"></i> Мои турниры</a>
                <a href="tournaments.html"><i class="fas fa-list"></i> Все турниры</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг бойцов</a>
                <div class="user-menu">
                    <img src="Avatar.png" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="organization-dashboard.html?id=${roles.myOrgId}"><i class="fas fa-chart-pie"></i> Дашборд</a>
                        <a href="tournament-create.html"><i class="fas fa-plus"></i> Создать турнир</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (displayRole === 'partner') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="messages">
                    <button class="dropbtn"><i class="fas fa-comments"></i> Общение <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>${clubLink}</div>
                </div>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог товаров</a></div>
                </div>
                <div class="dropdown" data-section="finance">
                    <button class="dropbtn"><i class="fas fa-wallet"></i> Финансы <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="wallet.html"><i class="fas fa-wallet"></i> Мой кошелёк</a></div>
                </div>
                <div class="user-menu">
                    <img src="${user?.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет партнёра</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (displayRole === 'club') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-shield-alt"></i> Мой клуб</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="user-menu">
                    <img src="Avatar.png" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-users"></i> Мой клуб</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (user) { // Боец
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        ${clubLink}
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <div class="user-menu">
                    <img src="${user?.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="buyer-wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                        <a href="profile.html?id=${user.uid}"><i class="fas fa-user"></i> Профиль</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else { // Гость
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="clubs.html"><i class="fas fa-users"></i> Клубы</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <a href="login.html" class="login-btn"><i class="fas fa-sign-in-alt"></i> Войти</a>
            `;
        }
    } else {
        // Мобильное верхнее меню (бургер) - аналогичная логика приоритета
        if (displayRole === 'organizer') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="organization-dashboard.html?id=${roles.myOrgId}"><i class="fas fa-chart-pie"></i> Дашборд</a>
                <a href="my-tournaments.html"><i class="fas fa-trophy"></i> Мои турниры</a>
                <a href="tournaments.html"><i class="fas fa-list"></i> Все турниры</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг бойцов</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (displayRole === 'partner') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-comments"></i> Общение <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>${clubLink}</div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a></div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-wallet"></i> Финансы <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a></div>
                </div>
                <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (displayRole === 'club') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-shield-alt"></i> Мой клуб</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (user) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        ${clubLink}
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <a href="buyer-wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                <a href="profile.html?id=${user.uid}"><i class="fas fa-user"></i> Профиль</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="clubs.html"><i class="fas fa-users"></i> Клубы</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
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

export { renderMobileBottomNav, initHeader, navigateWithAnimation, updateFighterMoneyBalance, updatePartnerWalletBalance };

if (document.readyState === 'complete') setTimeout(animatePageIn, 100);
else window.addEventListener('load', () => setTimeout(animatePageIn, 100));

setInterval(() => {
    const menu = document.querySelector('.mobile-bottom-nav');
    if (menu) menu.style.display = 'flex';
}, 300);

window.addEventListener('popstate', () => setTimeout(renderMobileBottomNav, 50));
window.addEventListener('pageshow', () => setTimeout(renderMobileBottomNav, 50));

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => { await initHeader(); });
});

window.updateFighterMoneyBalance = updateFighterMoneyBalance;
window.updatePartnerWalletBalance = updatePartnerWalletBalance;
window.navigateWithAnimation = navigateWithAnimation;
window.animatePageIn = animatePageIn;