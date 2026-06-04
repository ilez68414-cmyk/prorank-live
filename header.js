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

// Удаление старых индикаторов из HTML
function removeOldIndicators() {
    const oldIndicator = document.getElementById('balanceIndicator');
    if (oldIndicator) {
        oldIndicator.remove();
        console.log('✅ Старый индикатор вызовов удалён');
    }
    
    const oldWalletIndicator = document.querySelector('.wallet-indicator');
    if (oldWalletIndicator) {
        oldWalletIndicator.remove();
    }
}

// СОЗДАНИЕ ИНДИКАТОРОВ В ШАПКЕ
function createIndicators() {
    // Удаляем старые индикаторы
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
    
    // Кнопка пополнения вызовов (работает)
    const plusBtn = document.getElementById('balancePlusBtn');
    if (plusBtn) {
        plusBtn.onclick = () => {
            window.location.href = 'shop.html';
        };
    }
}

// ГЛОБАЛЬНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ ВЫЗОВОВ
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
        
        const free = data.freeChallenges || 0;
        const purchased = data.purchasedChallenges || 0;
        const total = free + purchased;
        balanceCount.innerText = total;
        if (challengesIndicator) challengesIndicator.style.display = 'flex';
    } catch (err) { 
        console.error('Ошибка загрузки вызовов:', err);
    }
};

// ОБНОВЛЕНИЕ КОШЕЛЬКА БОЙЦА
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
        let available = 0;
        
        if (balanceDoc.exists()) {
            available = balanceDoc.data().available || 0;
        }
        
        const moneyAmount = document.getElementById('fighterMoneyAmount');
        if (moneyAmount) moneyAmount.innerText = available.toLocaleString();
        fighterMoneyIndicator.style.display = 'flex';
    } catch (err) {
        console.error('Ошибка загрузки кошелька бойца:', err);
        if (fighterMoneyIndicator) fighterMoneyIndicator.style.display = 'none';
    }
}

// ОБНОВЛЕНИЕ КОШЕЛЬКА ПАРТНЁРА
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
        let available = 0;
        
        if (balanceDoc.exists()) {
            available = balanceDoc.data().available || 0;
        }
        
        const walletAmount = document.getElementById('partnerWalletAmount');
        if (walletAmount) walletAmount.innerText = available.toLocaleString() + ' ₽';
        partnerWalletIndicator.style.display = 'flex';
    } catch (err) {
        console.error('Ошибка загрузки кошелька партнёра:', err);
        if (partnerWalletIndicator) partnerWalletIndicator.style.display = 'none';
    }
}

async function initHeader() {
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
                if (window.updateHeaderBalance) window.updateHeaderBalance();
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
        return;
    }

    // Генерация навигации (десктоп)
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
        } 
        else if (user && !isPartner) {
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
                        <a href="deposit.html"><i class="fas fa-plus-circle"></i> Пополнить</a>
                        <a href="profile.html?id=${userId}"><i class="fas fa-user"></i> Профиль</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } 
        else {
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
    } 
    else {
        // Мобильная версия
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
        }
        else if (user && !isPartner) {
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
        } 
        else {
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
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => {
        await initHeader();
    });
});

window.addEventListener('resize', () => {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.innerHTML = '';
        onAuthStateChanged(auth, async () => {
            await initHeader();
        });
    }
});

window.updateFighterMoneyBalance = updateFighterMoneyBalance;
window.updatePartnerWalletBalance = updatePartnerWalletBalance;