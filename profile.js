import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, addDoc } from "firebase/firestore";
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

let currentFighterRef = null;
let currentFighterId = null;

// Аватарки временно отключены
async function uploadAvatar(file, userId) {
    alert('📸 Загрузка аватарок временно отключена. Скоро заработает!');
    throw new Error('Загрузка аватарок временно недоступна');
}

function setupAvatarUpload() {
    const avatarImg = document.getElementById('profAvatar');
    if (!avatarImg) return;
    avatarImg.style.cursor = 'pointer';
    avatarImg.addEventListener('click', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        const params = new URLSearchParams(window.location.search);
        const profileId = params.get('id');
        if (!user || user.uid !== profileId) {
            alert('Только владелец профиля может изменить аватар');
            return;
        }
        alert('📸 Загрузка аватарок временно отключена. Функция появится в следующем обновлении!');
    });
}

async function loadProfileData() {
    const loadingDiv = document.getElementById('profileLoading');
    if (loadingDiv) loadingDiv.style.display = 'block';

    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('id');
    if (!profileId) {
        document.getElementById('profName').innerText = 'ID не указан';
        if (loadingDiv) loadingDiv.style.display = 'none';
        return;
    }
    currentFighterId = profileId;
    currentFighterRef = doc(db, "fighters", profileId);
    
    try {
        const fighterSnap = await getDoc(currentFighterRef);
        if (!fighterSnap.exists()) {
            document.getElementById('profName').innerText = 'Боец не найден';
            if (loadingDiv) loadingDiv.style.display = 'none';
            return;
        }
        const fighter = fighterSnap.data();
        
        document.getElementById('profName').innerText = fighter.name || 'Без имени';
        document.getElementById('profSport').innerText = fighter.sport || '—';
        document.getElementById('profWeight').innerText = fighter.weight ? fighter.weight + " кг" : '—';
        document.getElementById('profCity').innerText = fighter.city || '—';
        document.getElementById('bioText').innerText = fighter.bio || "Тут пока пусто...";
        
        const avatarImg = document.getElementById('profAvatar');
        if (avatarImg) {
            avatarImg.src = fighter.avatar || 'Avatar.png';
            avatarImg.onerror = () => { avatarImg.src = 'Avatar.png'; };
        }
        
        document.getElementById('statWins').innerText = fighter.wins || 0;
        document.getElementById('statFinishes').innerText = fighter.finishes || 0;
        document.getElementById('statViews').innerText = fighter.viewsLast30Days || 0;
        document.getElementById('statSubs').innerText = fighter.subscribers || 0;
        document.getElementById('statLastFight').innerText = fighter.lastFightDate ? fighter.lastFightDate.toDate().toLocaleDateString() : '—';
        document.getElementById('statFRS').innerText = fighter.frs || 0;
        document.getElementById('statWeightClass').innerText = fighter.weightClass || '—';
        
        await loadLikesCount();
        
        const editProfileBtn = document.getElementById('editProfileBtn');
        const editBioBtn = document.getElementById('editBtn');
        const saveBioBtn = document.getElementById('saveBtn');
        const bioText = document.getElementById('bioText');
        const bioInput = document.getElementById('bioInput');
        const modal = document.getElementById('editProfileModal');

        onAuthStateChanged(auth, async (user) => {
            const isOwner = user && user.uid === profileId;
            if (isOwner) {
                if (editProfileBtn) editProfileBtn.classList.remove('hidden');
                if (editBioBtn) editBioBtn.classList.remove('hidden');
                document.getElementById('btnChallenge')?.classList.add('hidden');
                document.getElementById('btnMessage')?.classList.add('hidden');
            } else {
                if (editProfileBtn) editProfileBtn.classList.add('hidden');
                if (editBioBtn) editBioBtn.classList.add('hidden');
            }
            
            if (user && !isOwner) {
                await checkIfUserLiked(user.uid);
            } else if (!user) {
                const likeBtn = document.getElementById('likeBtn');
                if (likeBtn) {
                    likeBtn.disabled = true;
                    likeBtn.title = "Войдите, чтобы поставить лайк";
                }
            }
        });

        if (editBioBtn) {
            editBioBtn.onclick = () => {
                bioInput.value = bioText.innerText === "Тут пока пусто..." ? "" : bioText.innerText;
                bioText.classList.add('hidden');
                bioInput.classList.remove('hidden');
                editBioBtn.classList.add('hidden');
                saveBioBtn.classList.remove('hidden');
            };
        }
        if (saveBioBtn) {
            saveBioBtn.onclick = async () => {
                await updateDoc(currentFighterRef, { bio: bioInput.value });
                bioText.innerText = bioInput.value || "Тут пока пусто...";
                bioText.classList.remove('hidden');
                bioInput.classList.add('hidden');
                editBioBtn.classList.remove('hidden');
                saveBioBtn.classList.add('hidden');
            };
        }

        if (editProfileBtn) {
            editProfileBtn.onclick = () => {
                document.getElementById('editName').value = fighter.name || '';
                document.getElementById('editCity').value = fighter.city || '';
                document.getElementById('editWeight').value = fighter.weight || '';
                document.getElementById('editSport').value = fighter.sport || 'Бокс';
                modal.style.display = 'flex';
            };
        }
        
        document.getElementById('saveProfileBtn').onclick = async () => {
            const updatedData = {
                name: document.getElementById('editName').value,
                city: document.getElementById('editCity').value,
                weight: parseInt(document.getElementById('editWeight').value) || 0,
                sport: document.getElementById('editSport').value
            };
            await updateDoc(currentFighterRef, updatedData);
            alert("Профиль обновлён");
            modal.style.display = 'none';
            loadProfileData();
        };
        document.getElementById('cancelProfileBtn').onclick = () => {
            modal.style.display = 'none';
        };
        window.onclick = (event) => {
            if (event.target === modal) modal.style.display = 'none';
        };
        
        const challengeBtn = document.getElementById('btnChallenge');
        const messageBtn = document.getElementById('btnMessage');
        
        if (challengeBtn) {
            challengeBtn.onclick = async () => {
                const targetId = profileId;
                const targetDoc = await getDoc(doc(db, "fighters", targetId));
                const targetData = targetDoc.data();
                const targetTelegram = targetData?.telegramId;
                const targetName = targetData?.name || 'Соперник';
                const targetWeight = targetData?.weight || 0;
                
                const user = auth.currentUser;
                if (!user) {
                    alert('Вы не авторизованы');
                    return;
                }
                
                const currentDoc = await getDoc(doc(db, "fighters", user.uid));
                const currentData = currentDoc.data();
                const currentName = currentData?.name || 'Боец';
                const currentWeight = currentData?.weight || 0;
                const currentTelegram = currentData?.telegramId || null;
                
                if (Math.abs(currentWeight - targetWeight) > 5) {
                    alert('⚠️ Разница в весе больше 5 кг — спарринг небезопасен');
                    return;
                }
                
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
                
                const message = prompt('💬 Напишите сообщение сопернику (необязательно):', 'Хочешь спарринг?') || '';
                
                try {
                    await addDoc(collection(db, "challenges"), {
                        fromUserId: user.uid,
                        fromName: currentName,
                        fromWeight: currentWeight,
                        fromTelegramId: currentTelegram,
                        toUserId: targetId,
                        toName: targetName,
                        toWeight: targetWeight,
                        toTelegramId: targetTelegram,
                        status: "pending",
                        message: message,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                } catch (firestoreError) {
                    console.error('Ошибка Firestore:', firestoreError);
                    alert('❌ Ошибка базы данных. Вызов не сохранён.');
                    return;
                }
                
                if (targetTelegram) {
                    const tgMessage = `🥊 *ВЫЗОВ НА СПАРРИНГ!*\nБоец *${currentName}* вызывает тебя на бой.\n📝 Сообщение: ${message || '—'}\n\n👉 Зайди в раздел "Мои вызовы" на сайте!`;
                    try {
                        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: targetTelegram,
                                text: tgMessage,
                                parse_mode: 'Markdown'
                            })
                        });
                    } catch (tgError) {
                        console.error('Ошибка Telegram:', tgError);
                    }
                } else {
                    alert('⚠️ У соперника нет Telegram, но вызов сохранён.');
                }
                
                alert('✅ Вызов отправлен!');
            };
        }
        
        if (messageBtn) {
            messageBtn.onclick = async () => {
                const targetId = profileId;
                const targetDoc = await getDoc(doc(db, "fighters", targetId));
                const targetTelegram = targetDoc.data()?.telegramId;
                
                if (!targetTelegram) {
                    alert('У этого бойца не привязан Telegram');
                    return;
                }
                window.open(`https://t.me/${targetTelegram}`, '_blank');
            };
        }
        
        setupAvatarUpload();
        
        if (loadingDiv) loadingDiv.style.display = 'none';
    } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

async function loadLikesCount() {
    const likesRef = collection(db, "likes");
    const q = query(likesRef, where("fighterId", "==", currentFighterId));
    const snapshot = await getDocs(q);
    const likesCountSpan = document.getElementById('likesCount');
    if (likesCountSpan) likesCountSpan.innerText = snapshot.size;
}

async function checkIfUserLiked(userId) {
    const likeDocRef = doc(db, "likes", `${userId}_${currentFighterId}`);
    const likeSnap = await getDoc(likeDocRef);
    const likeBtn = document.getElementById('likeBtn');
    
    if (likeSnap.exists()) {
        likeBtn.classList.add('liked');
        likeBtn.innerText = '❤️ Лайкнут';
        likeBtn.disabled = true;
    } else {
        likeBtn.classList.remove('liked');
        likeBtn.innerText = '👍 Лайк';
        likeBtn.disabled = false;
        likeBtn.onclick = async () => {
            await setDoc(doc(db, "likes", `${userId}_${currentFighterId}`), {
                fighterId: currentFighterId,
                userId: userId,
                createdAt: new Date()
            });
            likeBtn.classList.add('liked');
            likeBtn.innerText = '❤️ Лайкнут';
            likeBtn.disabled = true;
            loadLikesCount();
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProfileData();
});

window.loadProfileData = loadProfileData;