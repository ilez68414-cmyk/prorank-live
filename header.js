import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
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

// Инициализация бургер-меню (вынесена отдельно)
function initBurger() {
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    
    if (menuToggle && navLinks) {
        // Удаляем старый обработчик, если был
        const newToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newToggle, menuToggle);
        
        newToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            navLinks.classList.toggle('show');
        });
    }
}

// Инициализация мобильных подменю
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

async function initHeader() {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

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

    // Если навигация уже есть — просто обновляем и выходим
    if (navLinks.children.length > 0) {
        updateActiveAndLogout();
        initBurger();
        initMobileSubmenus();
        return;
    }

    // Генерация навигации
    if (isDesktop) {
        if (user && isPartner) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="compete">
                    <button class="dropbtn"><i class="fas fa-trophy"></i> Соревнования <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="shop.html"><i class="fas fa-gem"></i> Товары</a>
                        <a href="equipment.html"><i class="fas fa-tshirt"></i> Экипировка</a>
                    </div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                    </div>
                </div>
                <div class="user-menu">
                    <img src="${user.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${escapeHtml(userName)}</span>
                        <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } 
        else if (user && !isPartner) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="compete">
                    <button class="dropbtn"><i class="fas fa-trophy"></i> Соревнования <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="shop.html"><i class="fas fa-gem"></i> Товары</a>
                        <a href="equipment.html"><i class="fas fa-tshirt"></i> Экипировка</a>
                    </div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                    </div>
                </div>
                <div class="user-menu">
                    <img src="${user.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${escapeHtml(userName)}</span>
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
                <div class="dropdown" data-section="compete">
                    <button class="dropbtn"><i class="fas fa-trophy"></i> Соревнования <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="shop.html"><i class="fas fa-gem"></i> Товары</a>
                        <a href="equipment.html"><i class="fas fa-tshirt"></i> Экипировка</a>
                    </div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                    </div>
                </div>
                <a href="login.html" class="login-btn"><i class="fas fa-sign-in-alt"></i> Войти</a>
            `;
        }
    } 
    else {
        // Мобильная версия
        if (user) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-trophy"></i> Соревнования <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="shop.html"><i class="fas fa-gem"></i> Товары</a>
                        <a href="equipment.html"><i class="fas fa-tshirt"></i> Экипировка</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                    </div>
                </div>
                <a href="profile.html?id=${userId}"><i class="fas fa-user"></i> Мой профиль</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } 
        else {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-trophy"></i> Соревнования <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
                        <a href="halls.html"><i class="fas fa-building"></i> Клубы</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="shop.html"><i class="fas fa-gem"></i> Товары</a>
                        <a href="equipment.html"><i class="fas fa-tshirt"></i> Экипировка</a>
                    </div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
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

// Запуск после полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => {
        await initHeader();
    });
});

// При ресайзе окна — пересоздаём навигацию
window.addEventListener('resize', () => {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.innerHTML = '';
        onAuthStateChanged(auth, async () => {
            await initHeader();
        });
    }
});