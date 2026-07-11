import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ensureUserFields, getAvailableBadges, selectBadge, getSelectedBadge, ALL_BADGES, getBadgeImage } from './payment.js';
import { applyAllPremiumBonuses } from './premium.js';
import { showError, handleFirebaseError, withErrorHandling } from './error-handler.js';

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

function getDeclension(number, one, two, five) {
    let n = Math.abs(number);
    n %= 100;
    if (n >= 5 && n <= 20) return five;
    n %= 10;
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return two;
    return five;
}

function getLeague(frs) {
    if (frs >= 5000) return { name: 'ЛЕГЕНДАРНАЯ', min: 5000, icon: 'fa-skull', color: '#ff4500', reward: { type: 'premium', days: 30 } };
    if (frs >= 3500) return { name: 'ЭЛИТНАЯ', min: 3500, icon: 'fa-dragon', color: '#9400d3', reward: { type: 'challenges', amount: 10 } };
    if (frs >= 2000) return { name: 'АЛМАЗНАЯ', min: 2000, icon: 'fa-gem', color: '#00ffff', reward: { type: 'challenges', amount: 5 } };
    if (frs >= 1000) return { name: 'ЗОЛОТАЯ', min: 1000, icon: 'fa-crown', color: '#ffd700', reward: { type: 'challenges', amount: 3 } };
    if (frs >= 500) return { name: 'СЕРЕБРЯНАЯ', min: 500, icon: 'fa-medal', color: '#c0c0c0', reward: { type: 'challenges', amount: 1 } };
    return { name: 'БРОНЗОВАЯ', min: 0, icon: 'fa-medal', color: '#cd7f32', reward: null };
}

function getNextLeagueMin(frs) {
    if (frs < 500) return 500;
    if (frs < 1000) return 1000;
    if (frs < 2000) return 2000;
    if (frs < 3500) return 3500;
    if (frs < 5000) return 5000;
    return null;
}

async function checkAndAwardLeagueRewards(userId, oldFrs, newFrs) {
    const oldLeague = getLeague(oldFrs);
    const newLeague = getLeague(newFrs);
    
    if (newLeague.name !== oldLeague.name && newLeague.reward) {
        const userRef = doc(db, "fighters", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        if (newLeague.reward.type === 'challenges') {
            const currentPurchased = userData.purchasedChallenges || 0;
            await updateDoc(userRef, {
                purchasedChallenges: currentPurchased + newLeague.reward.amount
            });
            showError(`🎉 Поздравляем! Вы достигли ${newLeague.name} ЛИГИ и получили +${newLeague.reward.amount} вызовов!`, 'success');
        }
        
        if (newLeague.reward.type === 'premium') {
            const premiumUntil = new Date(Date.now() + newLeague.reward.days * 24 * 60 * 60 * 1000);
            await updateDoc(userRef, {
                premium: true,
                premiumUntil: premiumUntil
            });
            showError(`🎉 ПОЗДРАВЛЯЕМ! Вы достигли ЛЕГЕНДАРНОЙ ЛИГИ и получили ПРЕМИУМ на ${newLeague.reward.days} дней!`, 'success');
        }
        
        if (window.updateHeaderBalance) window.updateHeaderBalance();
    }
}

async function refreshMonthlyChallenges(userId) {
    console.log('❌ Автоначисление вызовов ОТКЛЮЧЕНО');
    return;
}

function updateLeagueDisplay(frs) {
    const league = getLeague(frs);
    const leagueBadge = document.getElementById('leagueBadge');
    const leagueIcon = document.getElementById('leagueIconBig');
    const leagueName = document.getElementById('leagueName');
    
    if (!leagueBadge) return;
    
    leagueIcon.className = `fas ${league.icon}`;
    leagueIcon.style.color = league.color;
    leagueName.innerText = `${league.name} ЛИГА`;
    
    const nextMin = getNextLeagueMin(frs);
    const progressBar = document.getElementById('leagueProgressFill');
    const progressText = document.getElementById('leagueProgressText');
    
    if (nextMin) {
        const currentMin = league.min;
        const progress = ((frs - currentMin) / (nextMin - currentMin)) * 100;
        const remaining = nextMin - frs;
        const nextLeague = getLeague(nextMin);
        
        if (progressBar) progressBar.style.width = `${Math.min(100, progress)}%`;
        if (progressText) progressText.innerText = `До ${nextLeague.name} лиги осталось ${remaining} FRS`;
    } else if (progressBar && progressText) {
        progressBar.style.width = '100%';
        progressText.innerText = `Максимальная лига! 🔥`;
    }
}

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
            showError('Только владелец профиля может изменить аватар', 'warning');
            return;
        }
        fileInput.click();
    });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            showError('❌ Файл больше 20MB', 'error');
            return;
        }
        const originalSrc = avatarImg.src;
        avatarImg.style.opacity = '0.5';
        try {
            const url = await uploadAvatar(file, profileId);
            await updateDoc(doc(db, "fighters", profileId), { avatar: url });
            avatarImg.src = url;
            showError('✅ Аватар обновлён!', 'success');
        } catch (err) {
            avatarImg.src = originalSrc;
            showError('❌ Ошибка: ' + err.message, 'error');
        }
        avatarImg.style.opacity = '1';
        fileInput.value = '';
    });
}

async function loadFightHistory() {
    const profileId = currentFighterId;
    if (!profileId) return;
    const fightsSection = document.getElementById('fightsSection');
    const fightsList = document.getElementById('fightsList');
    if (!fightsSection) return;
    
    try {
        const qWinner = query(collection(db, "fights"), where("winnerId", "==", profileId));
        const qLoser = query(collection(db, "fights"), where("loserId", "==", profileId));
        
        const [winnerSnap, loserSnap] = await Promise.all([getDocs(qWinner), getDocs(qLoser)]);
        
        const fights = [];
        winnerSnap.forEach(docSnap => fights.push({ id: docSnap.id, ...docSnap.data(), result: 'win' }));
        loserSnap.forEach(docSnap => fights.push({ id: docSnap.id, ...docSnap.data(), result: 'loss' }));
        
        if (fights.length === 0) {
            fightsList.innerHTML = '<div class="empty-fights">📭 Пока нет боёв</div>';
            document.getElementById('fightsCount').innerText = '0 боёв';
            fightsSection.style.display = 'block';
            return;
        }
        
        fights.sort((a, b) => b.date?.toDate() - a.date?.toDate());
        
        let html = '';
        fights.forEach(fight => {
            const date = fight.date?.toDate().toLocaleDateString() || '—';
            const finishHtml = fight.isFinish ? '<span class="fight-finish"><i class="fas fa-bolt"></i> Финиш</span>' : '<span class="fight-finish" style="background:#555;"><i class="fas fa-balance-scale"></i> Решением</span>';
            
            if (fight.result === 'win') {
                html += `<div class="fight-item win">
                    <div class="fight-result"><i class="fas fa-trophy icon-green"></i><span class="fight-result-text win">Победа</span></div>
                    <div><a href="profile.html?id=${fight.loserId}" class="fight-opponent"><i class="fas fa-fist-raised"></i> ${fight.loserName || 'Соперник'}</a></div>
                    <div class="fight-details"><i class="fas fa-calendar-alt"></i> ${date}<span class="fight-sport"><i class="fas ${fight.sport === 'Бокс' ? 'fa-fist-raised' : (fight.sport === 'Борьба' ? 'fa-handshake' : 'fa-shield-alt')}"></i> ${fight.sport || '—'}</span>${finishHtml}</div>
                </div>`;
            } else {
                html += `<div class="fight-item loss">
                    <div class="fight-result"><i class="fas fa-skull-crossbones icon-red"></i><span class="fight-result-text loss">Поражение</span></div>
                    <div><a href="profile.html?id=${fight.winnerId}" class="fight-opponent"><i class="fas fa-fist-raised"></i> ${fight.winnerName || 'Соперник'}</a></div>
                    <div class="fight-details"><i class="fas fa-calendar-alt"></i> ${date}<span class="fight-sport"><i class="fas ${fight.sport === 'Бокс' ? 'fa-fist-raised' : (fight.sport === 'Борьба' ? 'fa-handshake' : 'fa-shield-alt')}"></i> ${fight.sport || '—'}</span>${finishHtml}</div>
                </div>`;
            }
        });
        
        fightsList.innerHTML = html;
        const wins = fights.filter(f => f.result === 'win').length;
        const losses = fights.filter(f => f.result === 'loss').length;
        document.getElementById('fightsCount').innerHTML = `${fights.length} ${getDeclension(fights.length, 'бой', 'боя', 'боёв')} <span style="color:#10b981;">(${wins} побед)</span> <span style="color:#ef4444;">(${losses} поражений)</span>`;
        fightsSection.style.display = 'block';
    } catch (err) {
        console.error('Ошибка загрузки истории боёв:', err);
        fightsList.innerHTML = '<div class="empty-fights"><i class="fas fa-exclamation-triangle icon-red"></i> Ошибка загрузки</div>';
        fightsSection.style.display = 'block';
    }
}

async function loadAchievements() {
    const userId = currentFighterId;
    if (!userId) return;
    
    const container = document.getElementById('achievementsList');
    if (!container) return;
    
    try {
        const achievementsSnap = await getDocs(collection(db, "achievements"));
        const allAchievements = [];
        achievementsSnap.forEach(doc => allAchievements.push({ id: doc.id, ...doc.data() }));
        
        const userAchievementsSnap = await getDocs(query(collection(db, "userAchievements"), where("userId", "==", userId)));
        const earnedIds = new Set();
        userAchievementsSnap.forEach(doc => earnedIds.add(doc.data().achievementId));
        
        const earnedCount = earnedIds.size;
        const totalCount = allAchievements.length;
        const countSpan = document.getElementById('achievementsCount');
        if (countSpan) countSpan.innerText = `${earnedCount}/${totalCount}`;
        
        let html = '';
        for (const ach of allAchievements) {
            const earned = earnedIds.has(ach.id);
            const iconPath = `./achiev-icons/${ach.id}.png`;
            
            let rewardHtml = '';
            if (ach.reward && ach.reward.amount) {
                const amount = ach.reward.amount;
                const typeText = ach.reward.type === 'frs' ? 'FRS' : (ach.reward.type === 'challenges' ? 'вызовов' : '');
                const isNegative = amount < 0;
                const sign = isNegative ? '' : '+';
                const rewardClass = isNegative ? 'negative' : 'positive';
                rewardHtml = `<div class="achievement-reward ${rewardClass}"><i class="fas fa-gift"></i> ${sign}${amount} ${typeText}</div>`;
            }
            
            html += `
                <div class="achievement-card ${earned ? 'earned' : 'locked'}">
                    <div class="achievement-icon">
                        <img src="${iconPath}" 
                             alt="${ach.name}" 
                             style="width: 42px; height: 42px; object-fit: contain;"
                             onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-medal\\' style=\\'font-size: 2rem; color: #fbbf24;\\'></i>';">
                    </div>
                    <div class="achievement-name">${ach.name}</div>
                    ${rewardHtml}
                </div>
            `;
        }
        
        container.innerHTML = html;
    } catch (err) {
        console.error('Ошибка загрузки ачивок:', err);
        container.innerHTML = '<div class="empty-state">Ошибка загрузки достижений</div>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

async function checkAndAwardAchievements(userId) {
    const userRef = doc(db, "fighters", userId);
    const userSnap = await getDoc(userRef);
    const user = userSnap.data();
    if (!user) return;
    
    const achievementsSnap = await getDocs(collection(db, "achievements"));
    const userAchievementsSnap = await getDocs(query(collection(db, "userAchievements"), where("userId", "==", userId)));
    const earnedIds = new Set();
    userAchievementsSnap.forEach(doc => earnedIds.add(doc.data().achievementId));
    
    const fightsSnap = await getDocs(query(collection(db, "fights"), where("winnerId", "==", userId)));
    const totalFights = fightsSnap.size;
    const wins = user.wins || 0;
    const finishes = user.finishes || 0;
    const likes = await getLikesCount(userId);
    const subscribers = user.subscribers || 0;
    const frs = user.frs || 0;
    
    for (const docSnap of achievementsSnap.docs) {
        const ach = docSnap.data();
        if (earnedIds.has(docSnap.id)) continue;
        
        let earned = false;
        const cond = ach.condition;
        if (!cond) continue;
        
        if (cond.type === 'total_fights' && totalFights >= cond.value) earned = true;
        if (cond.type === 'wins' && wins >= cond.value) earned = true;
        if (cond.type === 'finishes' && finishes >= cond.value) earned = true;
        if (cond.type === 'likes' && likes >= cond.value) earned = true;
        if (cond.type === 'subscribers' && subscribers >= cond.value) earned = true;
        if (cond.type === 'frs' && frs >= cond.value) earned = true;
        
        if (earned) {
            if (ach.reward && ach.reward.type === 'frs') {
                await updateDoc(userRef, { frs: (user.frs || 0) + ach.reward.amount });
            }
            if (ach.reward && ach.reward.type === 'challenges') {
                const purchased = user.purchasedChallenges || 0;
                await updateDoc(userRef, { purchasedChallenges: purchased + ach.reward.amount });
            }
            await setDoc(doc(db, "userAchievements", `${userId}_${docSnap.id}`), {
                userId: userId,
                achievementId: docSnap.id,
                earnedAt: new Date(),
                isNegative: ach.isNegative || false
            });
            
            if (user.telegramId) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: user.telegramId,
                        text: `🏆 НОВАЯ АЧИВКА!\n\n${ach.name}\n${ach.description || ''}\nНаграда: ${ach.reward?.amount > 0 ? '+' : ''}${ach.reward?.amount || 0} ${ach.reward?.type === 'frs' ? 'FRS' : 'вызовов'}`,
                        parse_mode: 'Markdown'
                    })
                });
            }
            
            console.log(`🏆 ${ach.name} получена!`);
        }
    }
}

async function getLikesCount(userId) {
    const snap = await getDocs(query(collection(db, "likes"), where("fighterId", "==", userId)));
    return snap.size;
}

// ============================================================
// БЕЙДЖИ
// ============================================================
async function loadUserBadge(userId) {
    try {
        await ensureUserFields(userId);
        const selectedBadgeId = await getSelectedBadge(userId);
        const badgeImg = document.getElementById('profileBadgeImg');
        const badgeContainer = document.getElementById('badgeDisplay');
        
        if (!badgeImg || !badgeContainer) return;
        
        if (selectedBadgeId) {
            const badge = ALL_BADGES.find(b => b.id === selectedBadgeId);
            if (badge) {
                badgeImg.src = getBadgeImage(selectedBadgeId);
                badgeImg.style.display = 'block';
                badgeImg.onerror = () => {
                    badgeImg.style.display = 'none';
                    badgeImg.parentElement.innerHTML = `<span style="font-size: 1.8rem;">${badge.emoji}</span>`;
                };
                badgeContainer.style.display = 'flex';
                badgeImg.style.cursor = 'pointer';
                badgeImg.onclick = () => openBadgeSelector();
            }
        } else {
            badgeContainer.style.display = 'none';
        }
    } catch (err) {
        console.error('Ошибка загрузки бейджа:', err);
    }
}

async function openBadgeSelector() {
    if (!currentFighterId) return;
    
    const modal = document.getElementById('badgeSelectModal');
    const grid = document.getElementById('badgeSelectGrid');
    const countEl = document.getElementById('availableBadgesCount');
    
    if (!modal || !grid) return;
    
    try {
        const availableBadges = await getAvailableBadges(currentFighterId);
        const available = availableBadges.filter(b => b.isAvailable);
        const selectedBadge = await getSelectedBadge(currentFighterId);
        
        if (countEl) countEl.textContent = available.length;
        grid.innerHTML = '';
        
        if (available.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#888;">
                <i class="fas fa-lock" style="font-size:2rem;display:block;margin-bottom:8px;"></i>
                Нет доступных бейджей<br><span style="font-size:0.7rem;">Купите премиум</span>
            </div>`;
        } else {
            availableBadges.forEach(badge => {
                const div = document.createElement('div');
                div.className = 'badge-option';
                if (badge.id === selectedBadge) div.classList.add('selected');
                
                div.innerHTML = `
                    <img src="${getBadgeImage(badge.id)}" alt="${badge.name}" 
                        onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'font-size:2rem;\\'>${badge.emoji}</div>'">
                    <div class="badge-name">${badge.name}</div>
                    <div class="badge-status ${badge.isOwned ? 'owned' : ''}">${badge.isOwned ? '✅ Владелец' : '🔓 Доступен'}</div>
                `;
                
                if (badge.isAvailable) {
                    div.addEventListener('click', async () => {
                        try {
                            await selectBadge(currentFighterId, badge.id);
                            await loadUserBadge(currentFighterId);
                            modal.style.display = 'none';
                            showError(`✅ Бейдж "${badge.name}" выбран!`, 'success');
                            await updateProfileName();
                        } catch (err) {
                            showError('❌ ' + err.message, 'error');
                        }
                    });
                } else {
                    div.style.opacity = '0.5';
                    div.style.cursor = 'not-allowed';
                }
                grid.appendChild(div);
            });
        }
        modal.style.display = 'flex';
    } catch (err) {
        console.error(err);
        showError('❌ Ошибка загрузки бейджей', 'error');
    }
}

async function initBadgeDisplay(userId) {
    await loadUserBadge(userId);
    const changeBtn = document.getElementById('changeBadgeBtn');
    if (changeBtn) {
        changeBtn.style.display = 'inline-flex';
        changeBtn.onclick = () => openBadgeSelector();
    }
}

// ============================================================
// ИМЯ + ЛИГА + БЕЙДЖ
// ============================================================
async function updateProfileName() {
    const fighter = currentFighterData;
    if (!fighter) {
        console.error('❌ Нет данных бойца');
        return;
    }
    
    try {
        const league = getLeague(fighter.frs || 0);
        const selectedBadgeId = await getSelectedBadge(currentFighterId);
        
        const nameEl = document.getElementById('fighterName');
        if (nameEl) nameEl.textContent = fighter.name || 'Без имени';
        
        const leagueIcon = document.getElementById('leagueIcon');
        if (leagueIcon) {
            leagueIcon.className = `fas ${league.icon} league-icon`;
            leagueIcon.style.color = league.color;
        }
        
        const badgeImg = document.getElementById('profileBadgeImg');
        const badgeEmoji = document.getElementById('badgeEmoji');
        const badgeWrapper = document.getElementById('badgeWrapper');
        
        if (selectedBadgeId && badgeWrapper) {
            const badge = ALL_BADGES.find(b => b.id === selectedBadgeId);
            if (badge) {
                badgeWrapper.style.display = 'inline-flex';
                
                if (badgeImg) {
                    badgeImg.src = getBadgeImage(selectedBadgeId);
                    badgeImg.style.display = 'block';
                    badgeImg.onerror = () => {
                        badgeImg.style.display = 'none';
                        if (badgeEmoji) {
                            badgeEmoji.textContent = badge.emoji;
                            badgeEmoji.style.display = 'block';
                        }
                    };
                }
                if (badgeEmoji) badgeEmoji.style.display = 'none';
                
                badgeWrapper.onclick = () => {
                    if (window.openBadgeSelector) window.openBadgeSelector();
                };
            }
        } else if (badgeWrapper) {
            badgeWrapper.style.display = 'none';
        }
        
        console.log('✅ Имя обновлено:', fighter.name);
    } catch (err) {
        console.error('❌ Ошибка обновления имени:', err);
        const nameEl = document.getElementById('fighterName');
        if (nameEl) nameEl.textContent = fighter.name || 'Без имени';
    }
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================
async function loadProfileData(user) {
    const loadingDiv = document.getElementById('profileLoading');
    const profileContent = document.getElementById('profileContent');
    const unauthorizedMessage = document.getElementById('unauthorizedMessage');
    
    if (!user) {
        if (unauthorizedMessage) {
            unauthorizedMessage.style.display = 'flex';
            unauthorizedMessage.classList.add('show');
        }
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (profileContent) profileContent.style.display = 'none';
        return;
    }
    
    if (unauthorizedMessage) {
        unauthorizedMessage.style.display = 'none';
        unauthorizedMessage.classList.remove('show');
    }
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
            document.getElementById('fighterName').textContent = 'Боец не найден';
            if (loadingDiv) loadingDiv.style.display = 'none';
            return;
        }
        currentFighterData = fighterSnap.data();
        const fighter = currentFighterData;
        
        await ensureUserFields(profileId);
        await applyAllPremiumBonuses(profileId);
        await initBadgeDisplay(profileId);
        await updateProfileName();
        
        document.getElementById('profSport').textContent = fighter.sport || '—';
        document.getElementById('profCity').textContent = fighter.city || '—';
        
        const weightMap = {
            '47': 'Наилегчайшая (до 50 кг)', '53': 'Легчайшая (51–56 кг)', '59': 'Полулёгкая (57–61 кг)',
            '64': 'Лёгкая (62–66 кг)', '69': '1-я полусредняя (67–71 кг)', '74': 'Полусредняя (72–77 кг)',
            '80': '1-я средняя (78–83 кг)', '86': 'Средняя (84–89 кг)', '94': 'Полутяжёлая (90–99 кг)',
            '110': 'Тяжёлая (100+ кг)'
        };
        document.getElementById('profWeight').textContent = weightMap[fighter.weightClass] || fighter.weightClass || '—';
        document.getElementById('bioText').textContent = fighter.bio || "Тут пока пусто...";
        
        const avatarImg = document.getElementById('profAvatar');
        if (avatarImg) {
            avatarImg.src = fighter.avatar || 'Avatar.png';
            avatarImg.onerror = () => { avatarImg.src = 'Avatar.png'; };
        }
        
        const oldFrs = currentFighterData?.frs || 0;
        const newFrs = fighter.frs || 0;
        
        await checkAndAwardLeagueRewards(profileId, oldFrs, newFrs);
        updateLeagueDisplay(newFrs);
        
        document.getElementById('statWinsHeader').textContent = fighter.wins || 0;
        document.getElementById('statLossesHeader').textContent = fighter.losses || 0;
        document.getElementById('statFinishesHeader').textContent = fighter.finishes || 0;
        document.getElementById('statFRSHeader').textContent = fighter.frs || 0;
        
        await updateLikesUI();
        await updateSubscribeUI();
        
        const ownerDiv = document.getElementById('ownerButtons');
        const visitorDiv = document.getElementById('visitorButtons');
        const navBtn = document.getElementById('profileLoginBtn');

        if (authListenerUnsub) authListenerUnsub();
        authListenerUnsub = onAuthStateChanged(auth, async (user) => {
            const isOwner = user && user.uid === profileId;
            const isLogged = !!user;
            if (navBtn) {
                if (!isLogged) { navBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти'; navBtn.href = 'login.html'; navBtn.classList.remove('hidden'); }
                else if (isOwner) { navBtn.classList.add('hidden'); }
                else { navBtn.innerHTML = '<i class="fas fa-user"></i> Мой профиль'; navBtn.href = `profile.html?id=${user.uid}`; navBtn.classList.remove('hidden'); }
            }
            if (ownerDiv && visitorDiv) {
                if (isOwner) {
                    ownerDiv.classList.remove('hidden');
                    visitorDiv.classList.add('hidden');
                    const shown = localStorage.getItem('frs_onboarding_shown');
                    if (!shown) {
                        const onboarding = document.getElementById('frsOnboarding');
                        if (onboarding) {
                            onboarding.classList.remove('hidden');
                            document.getElementById('onboardingFrs').textContent = fighter.frs || 0;
                        }
                    }
                    await setupReferral();
                    await setupTelegramVerify();
                } else if (isLogged) {
                    ownerDiv.classList.add('hidden');
                    visitorDiv.classList.remove('hidden');
                } else {
                    ownerDiv.classList.add('hidden');
                    visitorDiv.classList.add('hidden');
                }
            }
            if (isLogged) setTimeout(() => updateHeaderBalance(), 500);
            else { const balanceDiv = document.getElementById('balanceIndicator'); if (balanceDiv) balanceDiv.style.display = 'none'; }
        });
        
        setupEditProfile(fighterRef, fighter);
        setupEditBio();
        setupVerifyRecord();
        setupChallengeButton(profileId);
        setupMessageButton(profileId);
        setupLikeButton();
        setupSubscribeButton();
        setupAvatarUpload();
        setupOnboardingClose();
        await loadFightHistory();
        await loadAchievements();
        await checkAndAwardAchievements(profileId);
        
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
            try {
                await updateDoc(fighterRef, {
                    name: document.getElementById('editName').value,
                    city: document.getElementById('editCity').value,
                    weightClass: document.getElementById('editWeightClass').value,
                    sport: document.getElementById('editSport').value
                });
                document.getElementById('editProfileModal').style.display = 'none';
                loadProfileData(auth.currentUser);
                showError('✅ Профиль сохранён!', 'success');
            } catch (err) {
                showError(handleFirebaseError(err), 'error');
            }
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
        try {
            await updateDoc(doc(db, "fighters", currentFighterId), { bio: bioInput.value });
            bioText.innerText = bioInput.value || "Тут пока пусто...";
            bioText.classList.remove('hidden');
            bioInput.classList.add('hidden');
            editBtn.classList.remove('hidden');
            saveBtn.classList.add('hidden');
            showError('✅ Био обновлено!', 'success');
        } catch (err) {
            showError(handleFirebaseError(err), 'error');
        }
    };
}

function setupVerifyRecord() {
    const btn = document.getElementById('verifyRecordBtn');
    if (!btn) return;
    btn.onclick = () => {
        const user = auth.currentUser;
        if (!user) {
            showError('Войдите в аккаунт', 'warning');
            return;
        }
        window.open(`https://t.me/${BOT_USERNAME}?start=verify_${user.uid}`, '_blank');
    };
}

// ============================================================
// ВЫЗОВ (ИСПРАВЛЕННАЯ ВЕРСИЯ — БЕЗ CONFIRM)
// ============================================================
async function setupChallengeButton(targetId) {
    const btn = document.getElementById('btnChallenge');
    if (!btn) return;
    
    btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) {
            showError('Вы не авторизованы', 'warning');
            return;
        }
        
        try {
            const currentDoc = await getDoc(doc(db, "fighters", user.uid));
            const current = currentDoc.data();
            let freeChallenges = current.freeChallenges || 0;
            let purchasedChallenges = current.purchasedChallenges || 0;
            let totalChallenges = freeChallenges + purchasedChallenges;
            
            if (totalChallenges <= 0) {
                showError('❌ У вас закончились вызовы!', 'error');
                setTimeout(() => {
                    window.location.href = 'shop.html';
                }, 1500);
                return;
            }
        } catch (err) {
            console.error(err);
            showError('Ошибка проверки вызовов', 'error');
            return;
        }
        
        try {
            const targetDoc = await getDoc(doc(db, "fighters", targetId));
            const target = targetDoc.data();
            const targetName = target?.name || 'Соперник';
            
            if (typeof window.openChallengeModal === 'function') {
                window.openChallengeModal(targetId, targetName);
            } else {
                window.location.href = `challenges.html?target=${targetId}&name=${encodeURIComponent(targetName)}`;
            }
        } catch (err) {
            console.error(err);
            showError('Ошибка получения данных соперника', 'error');
        }
    };
}

async function setupMessageButton(targetId) {
    const messageBtn = document.getElementById('btnMessage');
    if (!messageBtn) return;
    messageBtn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) {
            showError('Войдите в аккаунт', 'warning');
            return;
        }
        if (user.uid === targetId) {
            showError('Нельзя написать самому себе', 'warning');
            return;
        }
        const chatId = `${user.uid}_${targetId}`;
        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
            const currentUserDoc = await getDoc(doc(db, "fighters", user.uid));
            const targetUserDoc = await getDoc(doc(db, "fighters", targetId));
            const currentName = currentUserDoc.data()?.name || 'Боец';
            const targetName = targetUserDoc.data()?.name || 'Боец';
            await setDoc(chatRef, { participants: [user.uid, targetId], participantNames: { [user.uid]: currentName, [targetId]: targetName }, createdAt: new Date(), lastMessage: "", lastMessageTime: new Date() });
        }
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
            btn.innerHTML = `<i class="fas fa-heart"></i> ${count}`;
            const user = auth.currentUser;
            if (user && user.uid !== currentFighterId) {
                const liked = await getDoc(doc(db, "likes", `${user.uid}_${currentFighterId}`));
                if (liked.exists()) { btn.classList.add('liked'); btn.style.background = '#16a34a'; btn.disabled = true; }
                else { btn.classList.remove('liked'); btn.style.background = '#dc2626'; btn.disabled = false; }
            } else { btn.disabled = true; btn.style.background = '#555'; }
        }
        await checkAndAwardAchievements(currentFighterId);
    } catch(e) { console.error('Likes error:', e); }
}

async function updateSubscribeUI() {
    if (!currentFighterId) return;
    try {
        const subs = currentFighterData?.subscribers || 0;
        const btn = document.getElementById('btnSubscribe');
        if (btn) {
            btn.innerHTML = `<i class="fas fa-bell"></i> ${subs}`;
            const user = auth.currentUser;
            if (user && user.uid !== currentFighterId) {
                const sub = await getDoc(doc(db, "subscriptions", `${user.uid}_${currentFighterId}`));
                if (sub.exists()) { btn.classList.add('subscribed'); btn.innerHTML = `<i class="fas fa-check-circle"></i> ${subs}`; btn.style.background = '#16a34a'; }
                else { btn.classList.remove('subscribed'); btn.innerHTML = `<i class="fas fa-bell"></i> ${subs}`; btn.style.background = '#8b5cf6'; }
            } else { btn.disabled = true; btn.style.background = '#555'; }
        }
        await checkAndAwardAchievements(currentFighterId);
    } catch(e) { console.error('Subscribe error:', e); }
}

function setupLikeButton() {
    const btn = document.getElementById('likeBtn');
    if (!btn) return;
    btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) {
            showError('Войдите в аккаунт', 'warning');
            return;
        }
        if (user.uid === currentFighterId) {
            showError('Нельзя лайкать себя', 'warning');
            return;
        }
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
        if (!user) {
            showError('Войдите в аккаунт', 'warning');
            return;
        }
        if (user.uid === currentFighterId) {
            showError('Нельзя подписаться на себя', 'warning');
            return;
        }
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

async function setupReferral() {
    const user = auth.currentUser;
    if (!user) return;
    const referralSection = document.getElementById('referralSection');
    if (!referralSection) return;
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('id');
    if (user.uid !== profileId) { referralSection.style.display = 'none'; return; }
    referralSection.style.display = 'block';
    const referralLink = `https://ilez68414-cmyk.github.io/prorank-live/?ref=${user.uid}`;
    const referralInput = document.getElementById('referralLink');
    if (referralInput) referralInput.value = referralLink;
    const copyBtn = document.getElementById('copyReferralBtn');
    if (copyBtn) {
        copyBtn.onclick = () => { const input = document.getElementById('referralLink'); if (input) { input.select(); document.execCommand('copy'); showError('✅ Ссылка скопирована!', 'success'); } };
    }
    const userDoc = await getDoc(doc(db, "fighters", user.uid));
    const refCount = userDoc.data()?.referralCount || 0;
    const refBonus = userDoc.data()?.referralBonus || 0;
    const statsEl = document.getElementById('referralStats');
    if (statsEl) statsEl.innerHTML = `<i class="fas fa-users"></i> Приглашено друзей: ${refCount}<br><i class="fas fa-gift"></i> Получено бонусов: +${refBonus} вызовов`;
}

async function setupTelegramVerify() {
    const user = auth.currentUser;
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('id');
    if (user.uid !== profileId) return;
    const telegramBtn = document.getElementById('telegramVerifyBtn');
    if (telegramBtn) {
        telegramBtn.style.display = 'inline-flex';
        telegramBtn.innerHTML = '<i class="fab fa-telegram"></i> Привязать Telegram';
        telegramBtn.onclick = () => window.open(`https://t.me/ProRankBot?start=verify_${user.uid}`, '_blank');
    }
}

window.updateHeaderBalance = updateHeaderBalance;
window.openBadgeSelector = openBadgeSelector;
window.addEventListener('beforeunload', () => { if (authListenerUnsub) authListenerUnsub(); });

// ===== ЗАПУСК =====
onAuthStateChanged(auth, (user) => {
    loadProfileData(user);
});