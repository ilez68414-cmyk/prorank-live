// header.js — универсальная шапка для всех страниц
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

// Получаем имя текущей страницы
function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop();
    return page || 'index.html';
}

// Добавляем класс active к ссылке, если она совпадает с текущей страницей
function setActiveLink(links, currentPage) {
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

async function initHeader() {
    const user = auth.currentUser;
    let isPartner = false;
    let userId = null;
    let userDoc = null;
    
    if (user) {
        userId = user.uid;
        userDoc = await getDoc(doc(db, "fighters", userId));
        isPartner = userDoc.data()?.isPartner === true;
    }
    
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;
    
    const currentPage = getCurrentPage();
    
    if (user && isPartner) {
        // Шапка для партнёра (авторизован)
        navLinks.innerHTML = `
            <a href="index.html"><i class="fas fa-home"></i> Главная</a>
            <a href="shop.html"><i class="fas fa-store"></i> Магазин</a>
            <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет</a>
            <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
        `;
        document.getElementById('logoutLink')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
            window.location.href = 'index.html';
        });
        const links = document.querySelectorAll('#navLinks a');
        setActiveLink(links, currentPage);
    } 
    else if (user && !isPartner) {
        // Шапка для бойца (авторизован)
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
        document.getElementById('logoutLink')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
            window.location.href = 'index.html';
        });
        const links = document.querySelectorAll('#navLinks a');
        setActiveLink(links, currentPage);
    } 
    else {
        // Шапка для неавторизованного пользователя
        navLinks.innerHTML = `
            <a href="index.html"><i class="fas fa-home"></i> Главная</a>
            <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
            <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
            <a href="rules.html"><i class="fas fa-book"></i> Правила</a>
            <a href="shop.html"><i class="fas fa-store"></i> Магазин</a>
            <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
            <a href="login.html"><i class="fas fa-sign-in-alt"></i> Войти</a>
        `;
        const links = document.querySelectorAll('#navLinks a');
        setActiveLink(links, currentPage);
    }
}

// Запускаем при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => {
        await initHeader();
    });
});