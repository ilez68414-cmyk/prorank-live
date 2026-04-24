import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, setDoc, orderBy } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

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
        let q = sportFilter ? query(fightersRef, where("sport", "==", sportFilter), orderBy("points", "desc")) : query(fightersRef, orderBy("points", "desc"));
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
            row.innerHTML = `<td>${index++}</td><td><strong>${fighter.name || 'Без имени'}</strong></td><td>${fighter.city || '—'}</td><td class="points">${fighter.points || 0}</td>`;
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

document.addEventListener('DOMContentLoaded', function() {
    const regForm = document.getElementById('registrationForm');
    if (regForm) {
        regForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = document.getElementById('userName').value.trim();
            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const password = document.getElementById('userPassword').value;
            const weight = document.getElementById('userWeight').value;
            const city = document.getElementById('userCity').value;
            const sport = document.getElementById('userSport').value;
            if (name.split(' ').length < 2) return alert("Введите имя и фамилию через пробел");
            if (password.length < 6) return alert("Пароль должен быть не менее 6 символов");
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const uid = userCredential.user.uid;
                await setDoc(doc(db, "fighters", uid), { name, email, city, sport, weight, points: 50, bio: "" });
                alert("Регистрация успешна!");
                window.location.href = `profile.html?id=${uid}`;
            } catch (error) {
                alert(error.code === 'auth/email-already-in-use' ? "Этот email уже зарегистрирован!" : "Ошибка: " + error.message);
            }
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const message = document.getElementById('loginMessage');
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                window.location.href = `profile.html?id=${userCredential.user.uid}`;
            } catch (error) {
                message.innerText = "Ошибка: неверный email или пароль";
            }
        });
    }

    displayFighters();
});

window.goToMyProfile = function() {
    if (auth.currentUser) {
        window.location.href = `profile.html?id=${auth.currentUser.uid}`;
    } else {
        alert("Пожалуйста, сначала войдите!");
    }
};

function updateNavbar() {
    const authBtn = document.querySelector('.nav-links .btn-primary');
    if (authBtn && auth.currentUser && auth.currentUser.email) {
        authBtn.innerText = 'Мой профиль';
        authBtn.setAttribute('onclick', `window.location.href='profile.html?id=${auth.currentUser.uid}'`);
    } else if (authBtn) {
        authBtn.innerText = 'Войти';
        authBtn.setAttribute('onclick', `window.location.href='index.html#login'`);
    }
}

onAuthStateChanged(auth, (user) => {
    updateNavbar();
    if (user && window.location.pathname.includes('profile.html') && window.loadProfileData) {
        window.loadProfileData();
    } else if (!user && window.location.pathname.includes('profile.html')) {
        window.location.href = 'index.html#login';
    }
});