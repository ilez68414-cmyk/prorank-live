import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

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

const BOT_TOKEN = '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const BOT_USERNAME = 'ProRankBot';
const CLOUD_NAME = 'dbv7bfkgy';
const UPLOAD_PRESET = 'prorank_avatars';

let currentFighterId = null;
let currentFighterData = null;
let authListenerUnsub = null;

async function uploadAvatar(file, userId) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    if (data.secure_url) {
        return data.secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill,f_auto,q_auto/');
    } else {
        throw new Error(data.error?.message || 'Ошибка загрузки');
    }
}

function setupAvatarUpload() {
    const avatarImg = document.getElementById('profAvatar');
    if (!avatarImg) return;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    const profileId = new URLSearchParams(window.location.search).get('id');
    if (!profileId) return;
    avatarImg.style.cursor = 'pointer';
    avatarImg.addEventListener('click', (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user || user.uid !== profileId) {
            alert('Только владелец профиля может изменить аватар');
            return;
        }
        fileInput.click();
    });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            alert('❌ Файл больше 20MB');
            return;
        }
        const originalSrc = avatarImg.src;
        avatarImg.style.opacity = '0.5';
        try {
            const url = await uploadAvatar(file, profileId);
            await updateDoc(doc(db, "fighters", profileId), { avatar: url });
            avatarImg.src = url;
            alert('✅ Аватар обновлён!');
        } catch (err) {
            avatarImg.src = originalSrc;
            alert('❌ Ошибка: ' + err.message);
        }
        avatarImg.style.opacity = '1';
        fileInput.value = '';
    });
}

async function loadProfileData() {
    const loadingDiv = document.getElementById('profileLoading');
    const profileContent = document.getElementById('profileContent');
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (profileContent) profileContent.style.display = 'none';

    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('id');
    if (!profileId) {
        if (loadingDiv) loadingDiv.style.display = 'none';
        return;
    }
    currentFighterId = profileId;
    const fighterRef = doc(db, "fighters", profileId);
    
    try {
        const fighterSnap = await getDoc(fighterRef);
        if (!fighterSnap.exists()) {
            document.getElementById('profName').innerText = 'Боец не найден';
            if (loadingDiv) loadingDiv.style.display = 'none';
            return;
        }
        currentFighterData = fighterSnap.data();
        const fighter = currentFighterData;
        
        document.getElementById('profName').innerText = fighter.name || 'Без имени';
        document.getElementById('profSport').innerText = fighter.sport || '—';
        document.getElementById('profCity').innerText = fighter.city || '—';
        
        let weightDisplay = '—';
        const weightMap = {
            '47': 'Наилегчайшая (до 50 кг)', '53': 'Легчайшая (51–56 кг)', '59': 'Полулёгкая (57–61 кг)',
            '64': 'Лёгкая (62–66 кг)', '69': '1-я полусредняя (67–71 кг)', '74': 'Полусредняя (72–77 кг)',
            '80': '1-я средняя (78–83 кг)', '86': 'Средняя (84–89 кг)', '94': 'Полутяжёлая (90–99 кг)',
            '110': 'Тяжёлая (100+ кг)'
        };
        weightDisplay = weightMap[fighter.weightClass] || fighter.weightClass || '—';
        document.getElementById('profWeight').innerText = weightDisplay;
        document.getElementById('bioText').innerText = fighter.bio || "Тут пока пусто...";
        
        const avatarImg = document.getElementById('profAvatar');
        if (avatarImg) {
            avatarImg.src = fighter.avatar || 'Avatar.png';
            avatarImg.onerror = () => { avatarImg.src = 'Avatar.png'; };
        }
        
        document.getElementById('statWinsHeader').innerText = fighter.wins || 0;
        document.getElementById('statFRSHeader').innerText = fighter.frs || 0;
        
        await updateLikesUI();
        await updateSubscribeUI();
        
        const ownerDiv = document.getElementById('ownerButtons');
        const visitorDiv = document.getElementById('visitorButtons');
        const navBtn = document.getElementById('profileLoginBtn');

        // Отписываемся от старого слушателя
        if (authListenerUnsub) authListenerUnsub();
        
        // Устанавливаем новый слушатель
        authListenerUnsub = onAuthStateChanged(auth, (user) => {
            console.log('Auth state changed', user?.uid);
            const isOwner = user && user.uid === profileId;
            const isLogged = !!user;
            
            // Навигационная кнопка
            if (navBtn) {
                if (!isLogged) {
                    navBtn.innerText = 'Войти';
                    navBtn.href = 'login.html';
                    navBtn.classList.remove('hidden');
                } else if (isOwner) {
                    navBtn.classList.add('hidden');
                } else {
                    navBtn.innerText = 'Мой профиль';
                    navBtn.href = `profile.html?id=${user.uid}`;
                    navBtn.classList.remove('hidden');
                }
            }
            
            // Кнопки действий
            if (ownerDiv && visitorDiv) {
                if (isOwner) {
                    ownerDiv.classList.remove('hidden');
                    visitorDiv.classList.add('hidden');
                    // Онбординг только для владельца (один раз)
                    const shown = localStorage.getItem('frs_onboarding_shown');
                    if (!shown) {
                        const onboarding = document.getElementById('frsOnboarding');
                        if (onboarding) {
                            onboarding.classList.remove('hidden');
                            document.getElementById('onboardingFrs').innerText = fighter.frs || 0;
                        }
                    }
                } else if (isLogged) {
                    ownerDiv.classList.add('hidden');
                    visitorDiv.classList.remove('hidden');
                } else {
                    ownerDiv.classList.add('hidden');
                    visitorDiv.classList.add('hidden');
                }
            }
        });
        
        // Инициализация кнопок
        setupEditProfile(fighterRef, fighter);
        setupEditBio();
        setupVerifyRecord();
        setupChallengeButton(profileId);
        setupMessageButton(profileId);
        setupLikeButton();
        setupSubscribeButton();
        setupAvatarUpload();
        setupOnboardingClose();
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (profileContent) profileContent.style.display = 'block';
    } catch (error) {
        console.error(error);
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (profileContent) profileContent.style.display = 'block';
    }
}

function setupOnboardingClose() {
    const close1 = document.getElementById('closeOnboarding');
    const close2 = document.getElementById('closeOnboardingX');
    const handler = () => {
        const el = document.getElementById('frsOnboarding');
        if (el) el.classList.add('hidden');
        localStorage.setItem('frs_onboarding_shown', 'true');
    };
    if (close1) close1.addEventListener('click', handler);
    if (close2) close2.addEventListener('click', handler);
}

function setupEditProfile(fighterRef, fighter) {
    const btn = document.getElementById('editProfileBtn');
    if (!btn) return;
    btn.onclick = () => {
        document.getElementById('editName').value = fighter.name || '';
        document.getElementById('editCity').value = fighter.city || '';
        document.getElementById('editWeightClass').value = fighter.weightClass || '64';
        document.getElementById('editSport').value = fighter.sport || 'Бокс';
        document.getElementById('editProfileModal').style.display = 'flex';
    };
    const save = document.getElementById('saveProfileBtn');
    if (save) {
        save.onclick = async () => {
            await updateDoc(fighterRef, {
                name: document.getElementById('editName').value,
                city: document.getElementById('editCity').value,
                weightClass: document.getElementById('editWeightClass').value,
                sport: document.getElementById('editSport').value
            });
            document.getElementById('editProfileModal').style.display = 'none';
            loadProfileData();
        };
    }
    const cancel = document.getElementById('cancelProfileBtn');
    if (cancel) cancel.onclick = () => document.getElementById('editProfileModal').style.display = 'none';
}

function setupEditBio() {
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const bioText = document.getElementById('bioText');
    const bioInput = document.getElementById('bioInput');
    if (!editBtn) return;
    editBtn.onclick = () => {
        bioInput.value = bioText.innerText === "Тут пока пусто..." ? "" : bioText.innerText;
        bioText.classList.add('hidden');
        bioInput.classList.remove('hidden');
        editBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');
    };
    saveBtn.onclick = async () => {
        await updateDoc(doc(db, "fighters", currentFighterId), { bio: bioInput.value });
        bioText.innerText = bioInput.value || "Тут пока пусто...";
        bioText.classList.remove('hidden');
        bioInput.classList.add('hidden');
        editBtn.classList.remove('hidden');
        saveBtn.classList.add('hidden');
    };
}

function setupVerifyRecord() {
    const btn = document.getElementById('verifyRecordBtn');
    if (!btn) return;
    btn.onclick = () => {
        const user = auth.currentUser;
        if (!user) return alert('Войдите');
        window.open(`https://t.me/${BOT_USERNAME}?start=verify_${user.uid}`, '_blank');
    };
}

async function setupChallengeButton(targetId) {
    const btn = document.getElementById('btnChallenge');
    if (!btn) return;
    
    btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) {
            alert('Вы не авторизованы');
            return;
        }
        
        try {
            // Получаем данные текущего бойца
            const currentDoc = await getDoc(doc(db, "fighters", user.uid));
            const current = currentDoc.data();
            
            // Проверяем остаток вызовов
            let freeChallenges = current.freeChallenges || 0;
            let purchasedChallenges = current.purchasedChallenges || 0;
            let totalChallenges = freeChallenges + purchasedChallenges;
            
            if (totalChallenges <= 0) {
                const confirm = confirm(`❌ У вас закончились вызовы!\n\nБесплатных: ${freeChallenges}\nКупленных: ${purchasedChallenges}\n\nПерейти в магазин вызовов?`);
                if (confirm) {
                    window.location.href = 'shop.html';
                }
                return;
            }
            
            // Получаем данные соперника
            const targetDoc = await getDoc(doc(db, "fighters", targetId));
            const target = targetDoc.data();
            
            if (!target) {
                alert('❌ Данные соперника не найдены');
                return;
            }
            
            // Проверка веса
            const targetWeight = parseInt(target.weightClass) || 0;
            const currentWeight = parseInt(current.weightClass) || 0;
            const weightDiff = Math.abs(currentWeight - targetWeight);
            
            if (weightDiff > 15) {
                alert(`⚠️ Слишком большая разница в весе (${weightDiff} кг). Спарринг небезопасен.`);
                return;
            }
            
            // Проверяем существующий вызов
            const existingQuery = await getDocs(query(
                collection(db, "challenges"),
                where("fromUserId", "==", user.uid),
                where("toUserId", "==", targetId),
                where("status", "in", ["pending", "accepted"])
            ));
            
            if (!existingQuery.empty) {
                alert('Вы уже вызывали этого бойца');
                return;
            }
            
            const message = prompt('💬 Сообщение сопернику:', 'Хочешь спарринг?') || '';
            
            // Создаём вызов
            const challengeData = {
                fromUserId: user.uid,
                fromName: current.name || 'Боец',
                fromWeight: currentWeight,
                fromTelegramId: current.telegramId ? String(current.telegramId) : null,
                toUserId: targetId,
                toName: target.name || 'Соперник',
                toWeight: targetWeight,
                toTelegramId: target.telegramId ? String(target.telegramId) : null,
                status: "pending",
                message: message || '',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await addDoc(collection(db, "challenges"), challengeData);
            
            // Списываем вызов
            if (freeChallenges > 0) {
                await updateDoc(doc(db, "fighters", user.uid), {
                    freeChallenges: freeChallenges - 1
                });
            } else {
                await updateDoc(doc(db, "fighters", user.uid), {
                    purchasedChallenges: purchasedChallenges - 1
                });
            }
            
            // Отправляем уведомление
            if (target.telegramId) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: target.telegramId,
                        text: `🥊 *ВЫЗОВ НА СПАРРИНГ!*\n\nБоец *${current.name}* вызывает тебя на бой.\n📝 Сообщение: ${message || '—'}\n\n👉 Зайди на сайт в раздел "Мои вызовы", чтобы ответить.`,
                        parse_mode: 'Markdown'
                    })
                });
            }
            
            alert(`✅ Вызов отправлен! Осталось вызовов: ${totalChallenges - 1}`);
            
        } catch (err) {
            console.error('Ошибка при отправке вызова:', err);
            alert('❌ Ошибка при отправке вызова');
        }
    };
}
async function setupMessageButton(targetId) {
    const messageBtn = document.getElementById('btnMessage');
    if (!messageBtn) return;
    
    messageBtn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) {
            alert('Войдите в аккаунт');
            return;
        }
        
        if (user.uid === targetId) {
            alert('Нельзя написать самому себе');
            return;
        }
        
        // Создаём ID чата (всегда одинаковый для пары пользователей)
        const chatId = `${user.uid}_${targetId}`;
        
        // Проверяем, существует ли чат
        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);
        
        // Если чата нет — создаём
        if (!chatSnap.exists()) {
            // Получаем имена бойцов
            const currentUserDoc = await getDoc(doc(db, "fighters", user.uid));
            const targetUserDoc = await getDoc(doc(db, "fighters", targetId));
            
            const currentName = currentUserDoc.data()?.name || 'Боец';
            const targetName = targetUserDoc.data()?.name || 'Боец';
            
            await setDoc(chatRef, {
                participants: [user.uid, targetId],
                participantNames: {
                    [user.uid]: currentName,
                    [targetId]: targetName
                },
                createdAt: new Date(),
                lastMessage: "",
                lastMessageTime: new Date()
            });
        }
        
        // Переходим в чат
        window.location.href = `chat.html?id=${chatId}`;
    };
}

async function updateLikesUI() {
    if (!currentFighterId) return;
    try {
        const snap = await getDocs(query(collection(db, "likes"), where("fighterId", "==", currentFighterId)));
        const count = snap.size;
        const btn = document.getElementById('likeBtn');
        if (btn) {
            btn.innerHTML = `👍 ${count}`;
            const user = auth.currentUser;
            if (user && user.uid !== currentFighterId) {
                const liked = await getDoc(doc(db, "likes", `${user.uid}_${currentFighterId}`));
                if (liked.exists()) {
                    btn.classList.add('liked');
                    btn.style.background = '#16a34a';
                    btn.disabled = true;
                } else {
                    btn.classList.remove('liked');
                    btn.style.background = '#dc2626';
                    btn.disabled = false;
                }
            } else {
                btn.disabled = true;
                btn.style.background = '#555';
            }
        }
    } catch(e) { console.error('Likes error:', e); }
}

async function updateSubscribeUI() {
    if (!currentFighterId) return;
    try {
        const subs = currentFighterData?.subscribers || 0;
        const btn = document.getElementById('btnSubscribe');
        if (btn) {
            btn.innerHTML = `🔔 ${subs}`;
            const user = auth.currentUser;
            if (user && user.uid !== currentFighterId) {
                const sub = await getDoc(doc(db, "subscriptions", `${user.uid}_${currentFighterId}`));
                if (sub.exists()) {
                    btn.classList.add('subscribed');
                    btn.innerHTML = `✅ ${subs}`;
                    btn.style.background = '#16a34a';
                } else {
                    btn.classList.remove('subscribed');
                    btn.innerHTML = `🔔 ${subs}`;
                    btn.style.background = '#8b5cf6';
                }
            } else {
                btn.disabled = true;
                btn.style.background = '#555';
            }
        }
    } catch(e) { console.error('Subscribe error:', e); }
}

function setupLikeButton() {
    const btn = document.getElementById('likeBtn');
    if (!btn) return;
    btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return alert('Войдите');
        if (user.uid === currentFighterId) return alert('Нельзя лайкать себя');
        const ref = doc(db, "likes", `${user.uid}_${currentFighterId}`);
        if (!(await getDoc(ref)).exists()) {
            await setDoc(ref, { fighterId: currentFighterId, userId: user.uid, createdAt: new Date() });
            await updateLikesUI();
        }
    };
}

function setupSubscribeButton() {
    const btn = document.getElementById('btnSubscribe');
    if (!btn) return;
    btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return alert('Войдите');
        if (user.uid === currentFighterId) return alert('Нельзя подписаться на себя');
        const ref = doc(db, "subscriptions", `${user.uid}_${currentFighterId}`);
        const exists = (await getDoc(ref)).exists();
        const cur = currentFighterData?.subscribers || 0;
        if (exists) {
            await deleteDoc(ref);
            await updateDoc(doc(db, "fighters", currentFighterId), { subscribers: Math.max(0, cur - 1) });
            currentFighterData.subscribers = cur - 1;
        } else {
            await setDoc(ref, { fromUserId: user.uid, toUserId: currentFighterId, createdAt: new Date() });
            await updateDoc(doc(db, "fighters", currentFighterId), { subscribers: cur + 1 });
            currentFighterData.subscribers = cur + 1;
        }
        await updateSubscribeUI();
    };
}

// Чистим слушатель при уходе
window.addEventListener('beforeunload', () => {
    if (authListenerUnsub) authListenerUnsub();
});

document.addEventListener('DOMContentLoaded', () => {
    loadProfileData();
});

window.loadProfileData = loadProfileData;