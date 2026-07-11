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
    if (plusBtn) plusBtn.onclick = () => window.location.href = 'shop.html';
}

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
            <a href="${profileLink}" class="mobile-nav-item ${currentPage === 'profile.html' || (currentPage === 'partner-dashboard.html' && isPartner) ? 'active' : ''}" id="mobileProfileBtn">
                <i class="fas ${profileIcon}"></i>
                <span>${profileText}</span>
            </a>
        </nav>
    `;
    
    const mobileProfileBtn = document.getElementById('mobileProfileBtn');
    if (mobileProfileBtn) {
        mobileProfileBtn.onclick = () => {
            window.location.href = profileLink;
        };
    }
    
    const centerBtn = document.getElementById('centerActionBtn');
    if (centerBtn) {
        centerBtn.onclick = () => {
            let actions = [];
            
            if (isPartner) {
                actions = [
                    { text: 'Аналитика', icon: 'fa-chart-line', url: 'partner-dashboard.html' },
                    { text: 'Товары', icon: 'fa-box', url: 'partner-products.html' },
                    { text: 'Заказы', icon: 'fa-shopping-cart', url: 'partner-orders.html' },
                    { text: 'Отзывы', icon: 'fa-star', url: 'partner-reviews.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'wallet.html' }
                ];
            } else {
                actions = [
                    { text: 'Премиум и вызовы', icon: 'fa-gem', url: 'shop.html' },
                    { text: 'Кинуть вызов', icon: 'fa-fist-raised', url: 'challenges.html' },
                    { text: 'Мой рейтинг', icon: 'fa-chart-line', url: 'rating.html' },
                    { text: 'Лиги', icon: 'fa-trophy', url: 'leagues.html' },      // ← ДОБАВИТЬ
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'buyer-wallet.html' },
                    { text: 'Мои заказы', icon: 'fa-box', url: 'my-orders.html' },
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
                            <i class="fas fa-bolt"></i> Быстрые действия
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
                    item.onclick = () => {
                        window.location.href = url;
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
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW error:', err));
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str;
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
                        <a href="my-orders.html"><i class="fas fa-box"></i> Мои заказы</a>
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
                        <a href="my-orders.html"><i class="fas fa-box"></i> Мои заказы</a>
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
                        <a href="my-orders.html"><i class="fas fa-box"></i> Мои заказы</a>
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
                        <a href="my-orders.html"><i class="fas fa-box"></i> Мои заказы</a>
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