import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app",
    messagingSenderId: "716836144015",
    appId: "1:716836144015:web:f1575147750608d0f881fa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ========== ФУНКЦИЯ ВЕСОВОЙ КАТЕГОРИИ ==========
function getWeightClass(weight) {
    if (weight <= 50) return 'Наилегчайшая (45–50 кг)';
    if (weight <= 56) return 'Легчайшая (51–56 кг)';
    if (weight <= 61) return 'Полулёгкая (57–61 кг)';
    if (weight <= 66) return 'Лёгкая (62–66 кг)';
    if (weight <= 71) return '1-я полусредняя (67–71 кг)';
    if (weight <= 77) return 'Полусредняя (72–77 кг)';
    if (weight <= 83) return '1-я средняя (78–83 кг)';
    if (weight <= 89) return 'Средняя (84–89 кг)';
    if (weight <= 99) return 'Полутяжёлая (90–99 кг)';
    return 'Тяжёлая (100+ кг)';
}

// ========== РЕЙТИНГ ==========
async function displayFighters() {
    const tableBody = document.getElementById('ratingTableBody');
    if (!tableBody) return;

    const fileName = window.location.pathname.split("/").pop() || 'index.html';
    let sportFilter = null;
    if (fileName.includes('boxing')) sportFilter = 'Бокс';
    else if (fileName.includes('mma')) sportFilter = 'ММА';
    else if (fileName.includes('wrestling')) sportFilter = 'Борьба';

    try {
        const fightersRef = collection(db, "fighters");
        let q = sportFilter ? query(fightersRef, where("sport", "==", sportFilter), orderBy("frs", "desc")) : query(fightersRef, orderBy("frs", "desc"));
        const querySnapshot = await getDocs(q);
        const oldRows = tableBody.querySelectorAll('.js-added-row');
        oldRows.forEach(row => row.remove());
        let index = 1;
        querySnapshot.forEach((doc) => {
            const fighter = doc.data();
            const row = document.createElement('tr');
            row.classList.add('js-added-row');
            row.style.cursor = 'pointer';
            row.onclick = () => window.location.href = `profile.html?id=${doc.id}`;
            row.innerHTML = `<td>${index++}</td><td><strong>${fighter.name || 'Без имени'}</strong></td><td>${fighter.city || '—'}</td><td class="points">${fighter.frs || 0} ⭐</td>`;
            tableBody.appendChild(row);
        });
        if (querySnapshot.size === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="4" style="text-align:center">Нет бойцов в этой категории</td>`;
            tableBody.appendChild(row);
        }
    } catch (error) {
        console.error("Ошибка загрузки рейтинга:", error);
    }
}

// ========== РЕГИСТРАЦИЯ ==========
async function registerUser(name, email, password, weight, city, sport) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        const weightNum = parseInt(weight);
        const weightClass = getWeightClass(weightNum);
        
        await setDoc(doc(db, "fighters", uid), {
            name, email, city, sport, weight: weightNum, weightClass,
            frs: 50, wins: 0, finishes: 0, bio: "", avatar: "Avatar.png"
        });
        alert("Регистрация успешна!");
        window.location.href = `profile.html?id=${uid}`;
    } catch (error) {
        alert(error.code === 'auth/email-already-in-use' ? "Этот email уже зарегистрирован!" : "Ошибка: " + error.message);
    }
}

// ========== ВХОД ==========
async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        window.location.href = `profile.html?id=${userCredential.user.uid}`;
    } catch (error) {
        const messageEl = document.getElementById('loginMessage');
        if (messageEl) messageEl.innerText = "Ошибка: неверный email или пароль";
    }
}

// ========== ТАБЫ (ВХОД / РЕГИСТРАЦИЯ) ==========
function initTabs() {
    const loginTab = document.getElementById('loginTabBtn');
    const registerTab = document.getElementById('registerTabBtn');
    const loginForm = document.getElementById('loginFormContainer');
    const registerForm = document.getElementById('registerFormContainer');

    if (loginTab && registerTab && loginForm && registerForm) {
        loginTab.addEventListener('click', () => {
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        });
        registerTab.addEventListener('click', () => {
            registerTab.classList.add('active');
            loginTab.classList.remove('active');
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        });
    }
}

// ========== НАВИГАЦИЯ ==========
window.goToMyProfile = function() {
    if (auth.currentUser) {
        window.location.href = `profile.html?id=${auth.currentUser.uid}`;
    } else {
        alert("Пожалуйста, сначала войдите!");
    }
};

function updateNavbar() {
    const authBtn = document.querySelector('.nav-links .btn-primary');
    if (authBtn && auth.currentUser) {
        authBtn.innerText = 'Мой профиль';
        authBtn.setAttribute('onclick', `window.location.href='profile.html?id=${auth.currentUser.uid}'`);
    }
}

// ========== СКРЫТИЕ ФОРМ ПОСЛЕ ВХОДА ==========
function hideAuthSectionOnLogin(user) {
    const authSection = document.getElementById('authSection');
    if (authSection) authSection.style.display = user ? 'none' : 'block';
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', function() {
    const regForm = document.getElementById('registrationForm');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('userName').value.trim();
            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const password = document.getElementById('userPassword').value;
            const weight = document.getElementById('userWeight').value;
            const city = document.getElementById('userCity').value;
            const sport = document.getElementById('userSport').value;
            
            if (name.split(' ').length < 2) return alert("Введите имя и фамилию");
            if (password.length < 6) return alert("Пароль минимум 6 символов");
            await registerUser(name, email, password, weight, city, sport);
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            await loginUser(email, password);
        });
    }
    initTabs();
    displayFighters();
});

onAuthStateChanged(auth, (user) => {
    updateNavbar();
    hideAuthSectionOnLogin(user);
    if (user && window.location.pathname.includes('profile.html') && window.loadProfileData) {
        window.loadProfileData();
    } else if (!user && window.location.pathname.includes('profile.html')) {
        window.location.href = 'index.html#authSection';
    }
});