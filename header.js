import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { initSeasons, lazyResetFighter, lazyResetClub } from './seasons.js';

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

// ===== ПУТЬ К ЛОГОТИПУ (поменяй если файл называется иначе) =====
const LOGO_SRC = 'icons/icon-192.png';

// ===== ГЛОБАЛЬНЫЕ СТИЛИ ДЛЯ МОДАЛКИ ДЕЙСТВИЙ =====
function injectQuickActionsStyles() {
    if (document.getElementById('quickActionsStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'quickActionsStyles';
    styles.textContent = `
        .quick-actions-overlay { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 9999 !important; background: rgba(0,0,0,0.75) !important; backdrop-filter: blur(6px) !important; animation: quickFadeIn 0.25s ease !important; }
        .quick-actions-panel { background: radial-gradient(ellipse at 30% 40%, rgba(251,191,36,0.08) 0%, transparent 60%), linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%) !important; border-radius: 24px !important; padding: 24px !important; width: 90% !important; max-width: 380px !important; border: 1px solid rgba(251,191,36,0.12) !important; box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important; animation: quickSlideUp 0.3s ease !important; max-height: 85vh !important; overflow-y: auto !important; }
        .quick-actions-header { display: flex !important; align-items: center !important; gap: 10px !important; font-size: 1rem !important; font-weight: 700 !important; color: #fbbf24 !important; padding-bottom: 16px !important; border-bottom: 1px solid rgba(251,191,36,0.08) !important; margin-bottom: 12px !important; }
        .quick-action-item { display: flex !important; align-items: center !important; gap: 12px !important; padding: 12px 16px !important; border-radius: 12px !important; cursor: pointer !important; transition: all 0.2s ease !important; color: #ddd !important; font-size: 0.85rem !important; border-bottom: 1px solid rgba(255,255,255,0.03) !important; }
        .quick-action-item:hover { background: rgba(251,191,36,0.08) !important; transform: translateX(4px) !important; }
        .quick-action-item i { color: #fbbf24 !important; width: 20px !important; text-align: center !important; }
        .quick-actions-close { text-align: center !important; padding: 12px 0 4px !important; color: #555 !important; font-size: 0.7rem !important; cursor: pointer !important; border-top: 1px solid rgba(255,255,255,0.03) !important; margin-top: 8px !important; transition: all 0.2s ease !important; }
        .quick-actions-close:hover { color: #fbbf24 !important; }
        @keyframes quickFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes quickSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 480px) { .quick-actions-panel { padding: 18px !important; width: 95% !important; border-radius: 20px !important; } .quick-actions-header { font-size: 0.85rem !important; padding-bottom: 12px !important; } .quick-action-item { padding: 10px 12px !important; font-size: 0.75rem !important; } }
    `;
    document.head.appendChild(styles);
}
injectQuickActionsStyles();

// ===== СТИЛИ ДЛЯ ЛОАДЕРОВ =====
function injectLoaderStyles() {
    if (document.getElementById('prorankLoaderStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'prorankLoaderStyles';
    styles.textContent = `
        /* ===== APP LOADER (полноэкранный) ===== */
        #prorankAppLoader{
            position:fixed;inset:0;z-index:9999;
            background:#07070a;
            display:grid;place-items:center;
            opacity:1;visibility:visible;
            transition:opacity 0.7s ease,visibility 0.7s ease,transform 0.7s ease;
        }
        #prorankAppLoader::before{
            content:'';position:absolute;inset:0;
            background:radial-gradient(circle at 50% 45%,rgba(251,191,36,0.10) 0%,transparent 60%);
            pointer-events:none;
        }
        #prorankAppLoader.hidden{
            opacity:0;visibility:hidden;transform:scale(1.04);pointer-events:none;
        }
        .app-loader-inner{
            position:relative;display:flex;flex-direction:column;align-items:center;
            gap:22px;padding:24px;width:100%;max-width:340px;
        }
        .app-loader-logo{
            width:64px;height:64px;border-radius:20px;
            display:grid;place-items:center;overflow:hidden;
            box-shadow:0 0 40px rgba(251,191,36,0.4);
            animation:appLoaderPulse 2.4s ease infinite;
            position:relative;
        }
        .app-loader-logo img{width:100%;height:100%;object-fit:cover;display:block}
        .app-loader-logo::after{
            content:'';position:absolute;inset:-6px;border-radius:26px;
            border:1px solid rgba(251,191,36,0.25);
            animation:appLoaderRing 2.4s ease infinite;pointer-events:none;
        }
        @keyframes appLoaderPulse{
            0%,100%{box-shadow:0 0 40px rgba(251,191,36,0.4)}
            50%{box-shadow:0 0 64px rgba(251,191,36,0.7)}
        }
        @keyframes appLoaderRing{
            0%,100%{transform:scale(1);opacity:0.6}
            50%{transform:scale(1.08);opacity:0.2}
        }
        .app-loader-name{
            font-size:26px;font-weight:800;letter-spacing:-0.02em;
            color:#f5f5f7;animation:appLoaderFade 0.6s ease 0.05s both;
        }
        .app-loader-name span{color:#fbbf24}
        .app-loader-bar{
            width:100%;height:3px;border-radius:100px;
            background:rgba(255,255,255,0.08);overflow:hidden;position:relative;
            animation:appLoaderFade 0.6s ease 0.1s both;
        }
        .app-loader-fill{
            height:100%;width:0%;
            background:linear-gradient(90deg,#b45309 0%,#fbbf24 50%,#fde68a 100%);
            border-radius:100px;box-shadow:0 0 14px rgba(251,191,36,0.6);
            transition:width 0.45s cubic-bezier(0.4,0,0.2,1);position:relative;
        }
        .app-loader-fill::after{
            content:'';position:absolute;top:0;right:0;bottom:0;width:50px;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,0.7));
            animation:appLoaderShimmer 1.6s ease infinite;
        }
        @keyframes appLoaderShimmer{
            0%{transform:translateX(-50px)}100%{transform:translateX(50px)}
        }
        .app-loader-percent{
            font-family:'Bebas Neue',sans-serif;font-size:38px;
            color:#fbbf24;letter-spacing:0.06em;line-height:1;
            animation:appLoaderFade 0.6s ease 0.15s both;
        }
        .app-loader-status{
            font-size:12px;color:#71717a;letter-spacing:0.06em;
            text-transform:uppercase;font-weight:500;text-align:center;
            animation:appLoaderFade 0.6s ease 0.2s both;min-height:16px;
        }
        @keyframes appLoaderFade{
            from{opacity:0;transform:translateY(8px)}
            to{opacity:1;transform:translateY(0)}
        }

        /* ===== NAV LOADER (компактный) ===== */
        #prorankNavLoader{
            position:fixed;inset:0;z-index:9998;
            display:grid;place-items:center;
            background:rgba(7,7,10,0.82);
            backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
            opacity:1;visibility:visible;
            transition:opacity 0.35s ease,visibility 0.35s ease;
        }
        #prorankNavLoader.hidden{
            opacity:0;visibility:hidden;pointer-events:none;
        }
        .nav-loader-inner{
            display:flex;flex-direction:column;align-items:center;
            gap:14px;padding:20px;
            animation:navLoaderIn 0.35s cubic-bezier(0.4,0,0.2,1) both;
        }
        @keyframes navLoaderIn{
            from{opacity:0;transform:translateY(6px) scale(0.96)}
            to{opacity:1;transform:translateY(0) scale(1)}
        }
        .nav-loader-logo{
            width:44px;height:44px;border-radius:14px;
            display:grid;place-items:center;overflow:hidden;
            box-shadow:0 0 28px rgba(251,191,36,0.45);
            animation:navLoaderPulse 1.6s ease infinite;
        }
        .nav-loader-logo img{width:100%;height:100%;object-fit:cover;display:block}
        @keyframes navLoaderPulse{
            0%,100%{box-shadow:0 0 28px rgba(251,191,36,0.45);transform:scale(1)}
            50%{box-shadow:0 0 44px rgba(251,191,36,0.7);transform:scale(1.04)}
        }
        .nav-loader-bar{
            width:120px;height:3px;border-radius:100px;
            background:rgba(255,255,255,0.08);overflow:hidden;position:relative;
        }
        .nav-loader-fill{
            height:100%;width:0%;
            background:linear-gradient(90deg,#b45309 0%,#fbbf24 50%,#fde68a 100%);
            border-radius:100px;box-shadow:0 0 10px rgba(251,191,36,0.6);
            transition:width 0.4s cubic-bezier(0.4,0,0.2,1);position:relative;
        }
        .nav-loader-fill::after{
            content:'';position:absolute;top:0;right:0;bottom:0;width:30px;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,0.8));
            animation:navShimmer 1.2s ease infinite;
        }
        @keyframes navShimmer{
            0%{transform:translateX(-30px)}100%{transform:translateX(30px)}
        }
        .nav-loader-text{
            font-size:11px;color:#a1a1aa;
            letter-spacing:0.12em;text-transform:uppercase;font-weight:600;
        }
    `;
    document.head.appendChild(styles);
}
injectLoaderStyles();

// ===== APP LOADER (полноэкранный, для входа) =====
const AppLoader = {
    el: null, fill: null, percent: null, status: null,
    value: 0, visible: false, minDuration: 600, startTime: 0,

    _ensure(){
        if (this.el) return;
        injectLoaderStyles();
        const div = document.createElement('div');
        div.id = 'prorankAppLoader';
        div.style.display = 'none';
        div.innerHTML = `
            <div class="app-loader-inner">
                <div class="app-loader-logo"><img src="${LOGO_SRC}" alt="PRORANK"></div>
                <div class="app-loader-name">PRO<span>RANK</span></div>
                <div class="app-loader-bar"><div class="app-loader-fill"></div></div>
                <div class="app-loader-percent">0%</div>
                <div class="app-loader-status">Запуск</div>
            </div>
        `;
        document.body.appendChild(div);
        this.el = div;
        this.fill = div.querySelector('.app-loader-fill');
        this.percent = div.querySelector('.app-loader-percent');
        this.status = div.querySelector('.app-loader-status');
    },

    start(){
        this._ensure();
        this.value = 0;
        this.startTime = Date.now();
        this.fill.style.width = '0%';
        this.percent.textContent = '0%';
        this.status.textContent = 'Запуск';
        this.el.style.display = 'grid';
        this.el.classList.remove('hidden');
        this.visible = true;
        void this.el.offsetWidth;
    },

    set(v, text){
        if (!this.visible) return;
        this.value = Math.max(this.value, Math.min(100, v));
        this.fill.style.width = this.value + '%';
        this.percent.textContent = Math.round(this.value) + '%';
        if (text) this.status.textContent = text;
    },

    finish(){
        if (!this.visible) return;
        this.set(100, 'Готово');
        const elapsed = Date.now() - this.startTime;
        const wait = Math.max(0, this.minDuration - elapsed);
        setTimeout(() => {
            this.el.classList.add('hidden');
            this.visible = false;
            setTimeout(() => { if (this.el) this.el.style.display = 'none'; }, 800);
        }, 250 + wait);
    },

    error(text){
        if (!this.visible) return;
        this.set(100, text || 'Ошибка');
        const elapsed = Date.now() - this.startTime;
        const wait = Math.max(0, this.minDuration - elapsed);
        setTimeout(() => {
            this.el.classList.add('hidden');
            this.visible = false;
            setTimeout(() => { if (this.el) this.el.style.display = 'none'; }, 800);
        }, 350 + wait);
    }
};

// ===== NAV LOADER (компактный, для переходов) =====
const NavLoader = {
    el: null, fill: null,
    value: 0, visible: false,

    _ensure(){
        if (this.el) return;
        injectLoaderStyles();
        const div = document.createElement('div');
        div.id = 'prorankNavLoader';
        div.className = 'hidden';
        div.innerHTML = `
            <div class="nav-loader-inner">
                <div class="nav-loader-logo"><img src="${LOGO_SRC}" alt="PRORANK"></div>
                <div class="nav-loader-bar"><div class="nav-loader-fill"></div></div>
                <div class="nav-loader-text">Загрузка</div>
            </div>
        `;
        document.body.appendChild(div);
        this.el = div;
        this.fill = div.querySelector('.nav-loader-fill');
    },

    start(){
        this._ensure();
        this.value = 0;
        this.fill.style.transition = 'none';
        this.fill.style.width = '0%';
        this.el.classList.remove('hidden');
        this.visible = true;
        void this.fill.offsetWidth;
        this.fill.style.transition = 'width 0.4s cubic-bezier(0.4,0,0.2,1)';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.value = 25;
                this.fill.style.width = '25%';
            });
        });
    },

    grow(target = 70){
        if (!this.visible) return;
        setTimeout(() => {
            this.value = target;
            this.fill.style.width = target + '%';
        }, 200);
    },

    finish(){
        if (!this.visible) return;
        this.fill.style.transition = 'width 0.25s ease-out';
        this.fill.style.width = '100%';
        setTimeout(() => {
            this.el.classList.add('hidden');
            this.visible = false;
            setTimeout(() => {
                this.fill.style.transition = 'none';
                this.fill.style.width = '0%';
                this.value = 0;
            }, 400);
        }, 350);
    }
};

// ===== УТИЛИТЫ =====
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
        if (hrefPath === currentPath) link.classList.add('active');
        else link.classList.remove('active');
    });
}

function initBurger() {
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    if (menuToggle && navLinks) {
        const newToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newToggle, menuToggle);
        newToggle.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
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
    if (menuToggle) navbar.insertBefore(indicatorsContainer, menuToggle);
    else navbar.appendChild(indicatorsContainer);
    
    challengesIndicator = document.getElementById('challengesIndicator');
    fighterMoneyIndicator = document.getElementById('fighterMoneyIndicator');
    partnerWalletIndicator = document.getElementById('partnerWalletIndicator');
    
    const plusBtn = document.getElementById('balancePlusBtn');
    if (plusBtn) plusBtn.onclick = () => { window.location.href = 'shop.html'; };
}

export async function getNotificationStatus() {
    try {
        const { isPushSupported, getPushStatus } = await import('./push-notifications.js');
        if (!isPushSupported()) return { supported: false, subscribed: false, permission: 'unsupported' };
        const status = await getPushStatus();
        return { supported: true, subscribed: status.subscribed && status.permission === 'granted', permission: status.permission };
    } catch (err) {
        return { supported: false, subscribed: false, permission: 'error' };
    }
}

export async function toggleNotifications() {
    try {
        const { isPushSupported, subscribeToPush, unsubscribeFromPush, getPushStatus } = await import('./push-notifications.js');
        if (!isPushSupported()) throw new Error('Push-уведомления не поддерживаются');
        const status = await getPushStatus();
        if (status.permission === 'denied') throw new Error('Уведомления заблокированы в браузере');
        
        const currentlySubscribed = status.subscribed && status.permission === 'granted';
        if (currentlySubscribed) {
            const result = await unsubscribeFromPush();
            if (result) return { success: true, action: 'unsubscribed', message: 'Уведомления отключены' };
            else throw new Error('Не удалось отключить уведомления');
        } else {
            const result = await subscribeToPush();
            if (result) return { success: true, action: 'subscribed', message: 'Уведомления включены' };
            else throw new Error('Не удалось включить уведомления');
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}
window.getNotificationStatus = getNotificationStatus;
window.toggleNotifications = toggleNotifications;

window.updateHeaderBalance = async function() {
    const user = auth.currentUser;
    const balanceCount = document.getElementById('headerChallengesCount');
    if (!user || !balanceCount) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (!userDoc.exists() || userDoc.data()?.isPartner === true) {
            if (challengesIndicator) challengesIndicator.style.display = 'none';
            return;
        }
        const data = userDoc.data();
        const total = (data.freeChallenges || 0) + (data.purchasedChallenges || 0);
        balanceCount.innerText = total;
        if (challengesIndicator) challengesIndicator.style.display = 'flex';
    } catch (err) { 
        if (challengesIndicator) challengesIndicator.style.display = 'none';
    }
};

async function updateFighterMoneyBalance() {
    const user = auth.currentUser;
    if (!user || !fighterMoneyIndicator) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (!userDoc.exists() || userDoc.data()?.isPartner === true) {
            fighterMoneyIndicator.style.display = 'none';
            return;
        }
        const balanceDoc = await getDoc(doc(db, "wallet_balances", user.uid));
        let available = balanceDoc.exists() ? (balanceDoc.data().available || 0) : 0;
        const moneyAmount = document.getElementById('fighterMoneyAmount');
        if (moneyAmount) moneyAmount.innerText = available.toLocaleString();
        fighterMoneyIndicator.style.display = 'flex';
    } catch (err) { 
        fighterMoneyIndicator.style.display = 'none';
    }
}

async function updatePartnerWalletBalance() {
    const user = auth.currentUser;
    if (!user || !partnerWalletIndicator) return;
    try {
        const userDoc = await getDoc(doc(db, "fighters", user.uid));
        if (!userDoc.exists() || userDoc.data()?.isPartner !== true) {
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
    } catch (err) { 
        partnerWalletIndicator.style.display = 'none';
    }
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

// ===== ОПРЕДЕЛЕНИЕ РОЛЕЙ =====
async function getUserRoles(userId) {
    let isPartner = false;
    let isClubUser = false;
    let isOrgUser = false;
    let myClubId = null;
    let myOrgId = null;
    let userName = 'Пользователь';

    try {
        const userDoc = await getDoc(doc(db, "fighters", userId));
        if (userDoc.exists()) {
            isPartner = userDoc.data()?.isPartner === true;
            myClubId = userDoc.data()?.clubId || null;
            userName = userDoc.data()?.name || 'Боец';
        }

        const clubDoc = await getDoc(doc(db, "clubs", userId));
        if (clubDoc.exists()) {
            isClubUser = true;
            myClubId = userId;
            userName = clubDoc.data()?.name || 'Клуб';
        }

        const orgRequests = await getDocs(query(
            collection(db, "organization_requests"),
            where("userId", "==", userId),
            where("status", "==", "approved")
        ));
        if (!orgRequests.empty) {
            const request = orgRequests.docs[0].data();
            isOrgUser = true;
            myOrgId = request.organizationId || orgRequests.docs[0].id;
            userName = request.orgName || 'Организация';
        }

        if (!isPartner && !isClubUser) {
            try {
                initSeasons(db, auth);
                await lazyResetFighter(userId);
                if (myClubId) {
                    await lazyResetClub(myClubId);
                }
            } catch (seasonsErr) {
                console.warn('⚠️ Сезоны: ошибка ленивого сброса', seasonsErr);
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки ролей:', err);
    }

    return { isPartner, isClubUser, isOrgUser, myClubId, myOrgId, userName };
}

async function renderMobileBottomNav() {
    const container = ensureMobileNavContainer();
    if (!container) return;
    
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const user = auth.currentUser;
    
    let displayRole = 'fighter'; 
    let roles = { isPartner: false, isClubUser: false, isOrgUser: false, myClubId: null, myOrgId: null, userName: 'Пользователь' };

    if (user) {
        roles = await getUserRoles(user.uid);
        
        if (roles.isOrgUser) displayRole = 'organizer';
        else if (roles.isPartner) displayRole = 'partner';
        else if (roles.isClubUser) displayRole = 'club';
    }
    
    let profileLink, profileIcon, profileText;
    
    if (displayRole === 'organizer') {
        profileLink = `organization-dashboard.html?id=${roles.myOrgId}`;
        profileIcon = 'fa-building';
        profileText = 'Организация';
    } else if (displayRole === 'partner') {
        profileLink = 'partner-dashboard.html';
        profileIcon = 'fa-chart-line';
        profileText = 'Кабинет';
    } else if (displayRole === 'club') {
        profileLink = `club-profile.html?id=${roles.myClubId}`;
        profileIcon = 'fa-users';
        profileText = 'Клуб';
    } else {
        profileLink = `profile.html?id=${user ? user.uid : ''}`;
        profileIcon = 'fa-user';
        profileText = 'Профиль';
    }

    let isMyProfile = false;
    if (currentPage === 'profile.html' && user) {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('id') || urlParams.get('id') === user.uid) isMyProfile = true;
    }
    if ((currentPage === 'organization-dashboard.html' && displayRole === 'organizer') ||
        (currentPage === 'partner-dashboard.html' && displayRole === 'partner') ||
        (currentPage === 'club-profile.html' && displayRole === 'club')) {
        isMyProfile = true;
    }
    
    container.innerHTML = `
        <nav class="mobile-bottom-nav">
            <a href="index.html" class="mobile-nav-item ${currentPage === 'index.html' ? 'active' : ''}">
                <i class="fas fa-home"></i><span>Главная</span>
            </a>
            <a href="${displayRole === 'organizer' ? 'tournaments.html' : 'catalog.html'}" class="mobile-nav-item ${(displayRole === 'organizer' && currentPage === 'tournaments.html') || (displayRole !== 'organizer' && currentPage === 'catalog.html') ? 'active' : ''}">
                <i class="fas ${displayRole === 'organizer' ? 'fa-trophy' : 'fa-store'}"></i>
                <span>${displayRole === 'organizer' ? 'Турниры' : 'Каталог'}</span>
            </a>
            <div class="mobile-nav-center" id="centerActionBtn">
                <div class="center-button"><i class="fas fa-bolt"></i></div>
            </div>
            <a href="chats.html" class="mobile-nav-item ${currentPage === 'chats.html' ? 'active' : ''}">
                <i class="fas fa-comments"></i><span>Чаты</span>
            </a>
            <a href="${profileLink}" class="mobile-nav-item ${isMyProfile ? 'active' : ''}" id="mobileProfileBtn">
                <i class="fas ${profileIcon}"></i><span>${profileText}</span>
            </a>
        </nav>
    `;
    
    const mobileProfileBtn = document.getElementById('mobileProfileBtn');
    if (mobileProfileBtn) {
        mobileProfileBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = profileLink;
        };
    }
    
    const centerBtn = document.getElementById('centerActionBtn');
    if (centerBtn) {
        centerBtn.onclick = () => {
            let actions = [];
            
            if (displayRole === 'organizer') {
                actions = [
                    { text: 'Дашборд', icon: 'fa-chart-pie', url: `organization-dashboard.html?id=${roles.myOrgId}` },
                    { text: 'Мои турниры', icon: 'fa-trophy', url: 'my-tournaments.html' },
                    { text: 'Создать турнир', icon: 'fa-plus', url: 'tournament-create.html' },
                    { text: 'Рейтинг бойцов', icon: 'fa-chart-line', url: 'rating.html' },
                    { text: 'Все турниры', icon: 'fa-list', url: 'tournaments.html' }
                ];
            } else if (displayRole === 'partner') {
                actions = [
                    { text: 'Аналитика', icon: 'fa-chart-line', url: 'partner-analytics.html' },
                    { text: 'Товары', icon: 'fa-box', url: 'partner-products.html' },
                    { text: 'Заказы', icon: 'fa-shopping-cart', url: 'partner-orders.html' },
                    { text: 'Отзывы', icon: 'fa-star', url: 'partner-reviews.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'wallet.html' }
                ];
            } else if (displayRole === 'club') {
                actions = [
                    { text: 'Мой клуб', icon: 'fa-users', url: `club-profile.html?id=${roles.myClubId}` },
                    { text: 'Все клубы', icon: 'fa-building', url: 'clubs.html' },
                    { text: 'Рейтинг', icon: 'fa-chart-line', url: 'rating.html' }
                ];
            } else {
                actions = [
                    { text: 'Премиум и вызовы', icon: 'fa-gem', url: 'shop.html' },
                    { text: 'Кинуть вызов', icon: 'fa-fist-raised', url: 'challenges.html' },
                    { text: 'Мой рейтинг', icon: 'fa-chart-line', url: 'rating.html' },
                    { text: 'Лиги', icon: 'fa-trophy', url: 'leagues.html' },
                    { text: 'Кошелёк', icon: 'fa-wallet', url: 'buyer-wallet.html' },
                    { text: roles.myClubId ? 'Мой клуб' : 'Клубы', icon: 'fa-users', url: roles.myClubId ? `club-profile.html?id=${roles.myClubId}` : 'clubs.html' },
                    { text: 'Турниры', icon: 'fa-trophy', url: 'tournaments.html' }
                ];
            }
            
            actions.push({ text: 'Выйти', icon: 'fa-sign-out-alt', isLogout: true });
            
            let menu = document.getElementById('quickActionsMenu');
            if (menu) menu.remove();
            
            const roleTitles = { organizer: 'Управление организацией', partner: 'Управление магазином', club: 'Управление клубом', fighter: 'Быстрые действия' };
            
            menu = document.createElement('div');
            menu.id = 'quickActionsMenu';
            menu.innerHTML = `
                <div class="quick-actions-overlay">
                    <div class="quick-actions-panel">
                        <div class="quick-actions-header">
                            <i class="fas fa-bolt"></i> ${roleTitles[displayRole]}
                        </div>
                        ${actions.map(a => `
                            <div class="quick-action-item" data-url="${a.url || ''}" data-logout="${a.isLogout || false}">
                                <i class="fas ${a.icon}"></i><span>${a.text}</span>
                            </div>
                        `).join('')}
                        <div class="quick-actions-close">Закрыть</div>
                    </div>
                </div>
            `;
            document.body.appendChild(menu);
            
            menu.querySelectorAll('.quick-action-item').forEach(item => {
                if (item.dataset.logout === 'true') {
                    item.onclick = async () => { await signOut(auth); window.location.href = 'index.html'; };
                } else if (item.dataset.url) {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        menu.remove();
                        // Быстрые действия — навигационный переход: просим NavLoader
                        // на новой странице (и снимаем возможный «skip»-флаг).
                        sessionStorage.removeItem('prorankSkipLoader');
                        sessionStorage.setItem('prorankNavLoader', '1');
                        window.location.href = item.dataset.url;
                    };
                }
            });
            menu.querySelector('.quick-actions-close').onclick = () => menu.remove();
            menu.onclick = (e) => { if (e.target === menu) menu.remove(); };
        };
    }
}

// ===== PWA =====
function initPWABanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (!banner) return;
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        banner.style.display = 'none'; return;
    }
    banner.style.display = 'flex';
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) {
        installBtn.onclick = async () => {
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) alert('Нажмите "Поделиться" → "На экран Домой"');
            else if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; banner.style.display = 'none'; deferredPrompt = null; }
            else alert('Нажмите меню (три точки) → "Установить приложение"');
        };
    }
    const closeBtn = document.getElementById('closePwaBanner');
    if (closeBtn) closeBtn.onclick = () => { banner.style.display = 'none'; };
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
});
window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
});

// ===== SERVICE WORKER =====
const SW_URL = '/prorank-live/sw.js';
const SW_SCOPE = '/prorank-live/';

function registerServiceWorker() {
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
        .then(registration => {
            console.log('✅ Service Worker зарегистрирован:', registration.scope);
            registration.addEventListener('updatefound', () => {
                const installing = registration.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🔄 Загружена новая версия приложения — обновите страницу');
                    }
                });
            });
        })
        .catch(err => console.error('❌ SW error:', err));
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', registerServiceWorker);
}

// ===== ОФЛАЙН-ПЛАШКА =====
const OFFLINE_BANNER_ID = 'prorankOfflineBanner';

function injectOfflineBannerStyles() {
    if (document.getElementById('prorankOfflineBannerStyles')) return;
    const styles = document.createElement('style');
    styles.id = 'prorankOfflineBannerStyles';
    styles.textContent = `
        #prorankOfflineBanner { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 2147483000 !important; display: flex !important; align-items: center !important; gap: 10px !important; padding: 10px 14px !important; margin: 0 !important; box-sizing: border-box !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: 13px !important; font-weight: 600 !important; line-height: 1.35 !important; letter-spacing: .2px !important; color: #fbbf24 !important; background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 60%, #1a1a1a 100%) !important; border-bottom: 1px solid rgba(251,191,36,.35) !important; box-shadow: 0 8px 24px rgba(0,0,0,.55) !important; transform: translateY(-110%) !important; transition: transform .35s ease, color .35s ease !important; }
        #prorankOfflineBanner.prorank-offline-visible { transform: translateY(0) !important; }
        #prorankOfflineBanner.prorank-offline-restored { color: #4ade80 !important; border-bottom-color: rgba(74,222,128,.45) !important; }
        #prorankOfflineBanner .prorank-offline-dot { width: 9px !important; height: 9px !important; min-width: 9px !important; border-radius: 50% !important; background: #fbbf24 !important; animation: prorankOfflinePulse 1.6s ease-out infinite !important; }
        #prorankOfflineBanner.prorank-offline-restored .prorank-offline-dot { background: #4ade80 !important; animation: none !important; }
        #prorankOfflineBanner .prorank-offline-text { flex: 1 1 auto !important; color: inherit !important; text-align: left !important; }
        #prorankOfflineBanner .prorank-offline-retry { flex: 0 0 auto !important; padding: 7px 16px !important; border: 1px solid rgba(251,191,36,.45) !important; border-radius: 40px !important; background: rgba(251,191,36,.12) !important; color: #fbbf24 !important; font: inherit !important; font-size: 12px !important; font-weight: 700 !important; cursor: pointer !important; }
        @keyframes prorankOfflinePulse { 0% { box-shadow: 0 0 0 0 rgba(251,191,36,.55); } 70% { box-shadow: 0 0 0 10px rgba(251,191,36,0); } 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); } }
        @media (max-width: 420px) { #prorankOfflineBanner { font-size: 12px !important; padding: 9px 12px !important; gap: 8px !important; } #prorankOfflineBanner .prorank-offline-retry { padding: 6px 13px !important; } }
    `;
    document.head.appendChild(styles);
}

function showOfflineBanner() {
    if (document.getElementById(OFFLINE_BANNER_ID)) return;
    injectOfflineBannerStyles();
    const banner = document.createElement('div');
    banner.id = OFFLINE_BANNER_ID;
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = '<span class="prorank-offline-dot"></span>' +
        '<span class="prorank-offline-text">Офлайн-режим. Проверьте сеть</span>' +
        '<button type="button" class="prorank-offline-retry">Обновить</button>';
    const retry = banner.querySelector('.prorank-offline-retry');
    if (retry) retry.onclick = () => window.location.reload();
    (document.body || document.documentElement).appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('prorank-offline-visible'));
}

function hideOfflineBanner() {
    const banner = document.getElementById(OFFLINE_BANNER_ID);
    if (!banner) return;
    banner.classList.add('prorank-offline-restored');
    const label = banner.querySelector('.prorank-offline-text');
    if (label) label.textContent = 'Соединение восстановлено. Обновите страницу';
    setTimeout(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 4000);
}

function probeConnection() {
    fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        .then(() => hideOfflineBanner())
        .catch(() => showOfflineBanner());
}

window.addEventListener('offline', showOfflineBanner);
window.addEventListener('online', probeConnection);
if (navigator.onLine === false) showOfflineBanner();
setInterval(() => {
    if (document.getElementById(OFFLINE_BANNER_ID)) probeConnection();
}, 20000);

// ===== ГЛОБАЛЬНАЯ НАВИГАЦИЯ =====
function setupGlobalNavigation() {
    function handleLinkClick(e) {
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        if (!href || link.target === '_blank' || href.startsWith('#') || link.hasAttribute('data-no-animation') || href.includes('javascript:')) return;
        // Модификаторы (Ctrl/Cmd/Shift/Alt) или не левая кнопка — даём браузеру
        // открыть ссылку в новой вкладке: флаги лоадера не ставим, чтобы не
        // «протухли» в текущей вкладке и не исказили переход на другой странице.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === 'number' && e.button !== 0)) return;
        if (!href.startsWith('http') || href.includes(window.location.hostname) || href.startsWith('/')) {
            e.preventDefault();
            
            // Навигационные ссылки (шапка, bottom nav, quick actions, бургер) → NavLoader на новой странице.
            // Функциональные ссылки (внутри страниц: товар → корзина, заказ → деталь и т.п.) → без лоадера.
            const isNavLink = link.closest('.nav-links, .mobile-bottom-nav, .mobile-submenu-content, .quick-actions-menu, .mobile-nav-center, .logo, .mobile-submenu');
            
            // Гигиена флагов: сначала снимаем оба, затем ставим ровно один —
            // иначе остаток прошлого клика мог бы перекрыть текущее решение.
            sessionStorage.removeItem('prorankNavLoader');
            sessionStorage.removeItem('prorankSkipLoader');
            if (isNavLink) {
                sessionStorage.setItem('prorankNavLoader', '1');
            } else {
                sessionStorage.setItem('prorankSkipLoader', '1');
            }
            
            window.location.href = href;
        }
    }
    document.querySelectorAll('.nav-links a, .logo, [data-navigate], .mobile-nav-item, .mobile-nav-center .center-button, .mobile-submenu-content a, .quick-action-item[data-url]').forEach(link => {
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        newLink.addEventListener('click', function(e) {
            if (this.classList.contains('quick-action-item')) {
                const menu = document.getElementById('quickActionsMenu');
                if (menu) menu.remove();
            }
            handleLinkClick(e);
        });
    });
}

// ===== ИНИЦИАЛИЗАЦИЯ ШАПКИ =====
async function initHeader() {
    ensureMobileNavContainer();

    // === ЛОАДЕРЫ ===
    const isPWA = window.matchMedia('(display-mode: standalone)').matches
               || window.navigator.standalone === true;
    const isNavTransition = sessionStorage.getItem('prorankNavLoader') === '1';
    const skipLoader = sessionStorage.getItem('prorankSkipLoader') === '1';
    const isFirstLoad = !sessionStorage.getItem('prorankAppLoaded');

    sessionStorage.removeItem('prorankNavLoader');
    sessionStorage.removeItem('prorankSkipLoader');

    let activeLoader = null;

    if (skipLoader) {
        // Функциональный переход — лоадер не показываем
        activeLoader = null;
    } else if (isNavTransition) {
        NavLoader.start();
        NavLoader.grow(70);
        activeLoader = NavLoader;
    } else if (isFirstLoad || isPWA) {
        AppLoader.start();
        AppLoader.set(15, 'Инициализация');
        activeLoader = AppLoader;
    } else {
        NavLoader.start();
        NavLoader.grow(70);
        activeLoader = NavLoader;
    }

    function finishLoader() {
        if (activeLoader) {
            activeLoader.finish();
            activeLoader = null;
        }
        sessionStorage.setItem('prorankAppLoaded', '1');
    }

    const navLinks = document.getElementById('navLinks');
    if (!navLinks) {
        finishLoader();
        return;
    }

    createIndicators();
    const user = auth.currentUser;
    let roles = { isPartner: false, isClubUser: false, isOrgUser: false, myClubId: null, myOrgId: null, userName: 'Пользователь' };
    let displayRole = 'fighter';

    if (user) {
        if (activeLoader === AppLoader) AppLoader.set(35, 'Подключение');
        roles = await getUserRoles(user.uid);
        if (activeLoader === AppLoader) AppLoader.set(55, 'Профиль');
        if (roles.isOrgUser) displayRole = 'organizer';
        else if (roles.isPartner) displayRole = 'partner';
        else if (roles.isClubUser) displayRole = 'club';
        
        setTimeout(() => {
            window.updateHeaderBalance();
            updateFighterMoneyBalance();
            updatePartnerWalletBalance();
        }, 100);
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
        if (activeLoader === AppLoader) AppLoader.set(75, 'Меню');
        await renderMobileBottomNav();
        if (activeLoader === AppLoader) AppLoader.set(90, 'Данные');
        initPWABanner();
        setupGlobalNavigation();
        finishLoader();
        return;
    }

    const clubLink = roles.myClubId ? `<a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-shield-alt"></i> Мой клуб</a>` : `<a href="clubs.html"><i class="fas fa-users"></i> Клубы</a>`;

    if (isDesktop) {
        if (displayRole === 'organizer') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="organization-dashboard.html?id=${roles.myOrgId}"><i class="fas fa-chart-pie"></i> Дашборд</a>
                <a href="my-tournaments.html"><i class="fas fa-trophy"></i> Мои турниры</a>
                <a href="tournaments.html"><i class="fas fa-list"></i> Все турниры</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг бойцов</a>
                <div class="user-menu">
                    <img src="Avatar.png" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="organization-dashboard.html?id=${roles.myOrgId}"><i class="fas fa-chart-pie"></i> Дашборд</a>
                        <a href="tournament-create.html"><i class="fas fa-plus"></i> Создать турнир</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (displayRole === 'partner') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="messages">
                    <button class="dropbtn"><i class="fas fa-comments"></i> Общение <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>${clubLink}</div>
                </div>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог товаров</a></div>
                </div>
                <div class="dropdown" data-section="finance">
                    <button class="dropbtn"><i class="fas fa-wallet"></i> Финансы <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="wallet.html"><i class="fas fa-wallet"></i> Мой кошелёк</a></div>
                </div>
                <div class="user-menu">
                    <img src="${user?.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет партнёра</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (displayRole === 'club') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-shield-alt"></i> Мой клуб</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="user-menu">
                    <img src="Avatar.png" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-users"></i> Мой клуб</a>
                        <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
                    </div>
                </div>
            `;
        } else if (user) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="dropdown" data-section="shop">
                    <button class="dropbtn"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        ${clubLink}
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <div class="user-menu">
                    <img src="${user?.photoURL || 'Avatar.png'}" class="user-avatar" onerror="this.src='Avatar.png'">
                    <div class="user-dropdown">
                        <span class="user-name">${roles.userName}</span>
                        <a href="buyer-wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                        <a href="profile.html?id=${user.uid}"><i class="fas fa-user"></i> Профиль</a>
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
                    <div class="dropdown-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="dropdown" data-section="community">
                    <button class="dropbtn"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-down"></i></button>
                    <div class="dropdown-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="clubs.html"><i class="fas fa-users"></i> Клубы</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <a href="login.html" class="login-btn"><i class="fas fa-sign-in-alt"></i> Войти</a>
            `;
        }
    } else {
        if (displayRole === 'organizer') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="organization-dashboard.html?id=${roles.myOrgId}"><i class="fas fa-chart-pie"></i> Дашборд</a>
                <a href="my-tournaments.html"><i class="fas fa-trophy"></i> Мои турниры</a>
                <a href="tournaments.html"><i class="fas fa-list"></i> Все турниры</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг бойцов</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (displayRole === 'partner') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-comments"></i> Общение <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>${clubLink}</div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a></div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-wallet"></i> Финансы <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a></div>
                </div>
                <a href="partner-dashboard.html"><i class="fas fa-tachometer-alt"></i> Кабинет</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (displayRole === 'club') {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="club-profile.html?id=${roles.myClubId}"><i class="fas fa-shield-alt"></i> Мой клуб</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else if (user) {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        ${clubLink}
                        <a href="leagues.html"><i class="fas fa-trophy"></i> Лиги</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <a href="buyer-wallet.html"><i class="fas fa-wallet"></i> Кошелёк</a>
                <a href="profile.html?id=${user.uid}"><i class="fas fa-user"></i> Профиль</a>
                <a href="#" id="logoutLink"><i class="fas fa-sign-out-alt"></i> Выйти</a>
            `;
        } else {
            navLinks.innerHTML = `
                <a href="index.html"><i class="fas fa-home"></i> Главная</a>
                <a href="rating.html"><i class="fas fa-chart-line"></i> Рейтинг</a>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-store"></i> Магазин <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content"><a href="catalog.html"><i class="fas fa-boxes"></i> Каталог</a><a href="shop.html"><i class="fas fa-gem"></i> Премиум</a></div>
                </div>
                <div class="mobile-submenu">
                    <span class="mobile-submenu-trigger"><i class="fas fa-users"></i> Сообщество <i class="fas fa-chevron-right"></i></span>
                    <div class="mobile-submenu-content">
                        <a href="chats.html"><i class="fas fa-comments"></i> Чаты</a>
                        <a href="challenges.html"><i class="fas fa-fist-raised"></i> Вызовы</a>
                        <a href="clubs.html"><i class="fas fa-users"></i> Клубы</a>
                        <a href="tournaments.html"><i class="fas fa-trophy"></i> Турниры</a>
                    </div>
                </div>
                <a href="login.html"><i class="fas fa-sign-in-alt"></i> Войти</a>
            `;
        }
        initMobileSubmenus();
    }

    updateActiveAndLogout();
    initBurger();
    if (activeLoader === AppLoader) AppLoader.set(75, 'Меню');
    await renderMobileBottomNav();
    if (activeLoader === AppLoader) AppLoader.set(90, 'Данные');
    initPWABanner();
    setupGlobalNavigation();
    finishLoader();
}

export { renderMobileBottomNav, initHeader, updateFighterMoneyBalance, updatePartnerWalletBalance };

setInterval(() => {
    const menu = document.querySelector('.mobile-bottom-nav');
    if (menu) menu.style.display = 'flex';
}, 300);

window.addEventListener('popstate', () => setTimeout(renderMobileBottomNav, 50));
window.addEventListener('pageshow', () => setTimeout(renderMobileBottomNav, 50));

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async () => { await initHeader(); });
});

window.updateFighterMoneyBalance = updateFighterMoneyBalance;
window.updatePartnerWalletBalance = updatePartnerWalletBalance;