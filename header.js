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
        if (hrefPath === 'index.html' && (currentPath === '' || currentPath === 'index.html')) {
            link.classList.add('active');
        } else if (hrefPath === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

async function initHeader() {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    const user = auth.currentUser;
    let isPartner = false;
    let userId = null;

    if (user) {
        userId = user.uid;
        try {
            const userDoc = await getDoc(doc(db, "fighters", userId));
            isPartner = userDoc.data()?.isPartner === true;
        } catch (err) {
            console.error('Ошибка загрузки пользователя:', err);
        }
    }

    const currentPage = getCurrentPage();

    // Функция для обновления активной ссылки и обработчика выхода
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

    // Если навигация уже есть (например, chats.html), просто обновляем
    if (navLinks.children.length > 0) {
        updateActiveAndLogout();
        return;
    }

    // Создаём навигацию с нуля
    if (user && isPartner) {
        navLinks.innerHTML = `
            <a href="index.html"><i class="fas fa-home"></i> Главная</a>
            <a href="shop.html"><i class="fas fa-store"></i> Магазин</a>
            <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет</a>
            <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
        `;
    } 
    else if (user && !isPartner) {
        navLinks.innerHTML = `
            <a href="index.html"><i class="fas fa-home"></i> Главная</a>
            <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
            <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
            <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
            <a href="shop.html"><i class="fas fa-store"></i> Магазин</a>
            <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
            <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
            <a href="profile.html?id=${userId}" id="profileLink"><i class="fas fa-user"></i> Мой профиль</a>
            <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
        `;
    } 
    else {
        navLinks.innerHTML = `
            <a href="index.html"><i class="fas fa-home"></i> Главная</a>
            <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
            <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
            <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
            <a href="shop.html"><i class="fas fa-store"></i> Магазин</a>
            <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
            <a href="login.html"><i class="fas fa-sign-in-alt"></i> Войти</a>
        `;
    }

    updateActiveAndLogout();
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => {
        await initHeader();
    });
});