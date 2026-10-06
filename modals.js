/**
 * modals.js — единые модалки ProRank
 * showToast(message, type)  — всплывающее уведомление (info | success | error | warning)
 * showConfirm(title, body, label) — модальное окно подтверждения, возвращает Promise<boolean>
 *
 * Определяет только то, чего ещё нет: страницы с собственным showToast
 * (partner-*, tournament-*) продолжают использовать свою реализацию.
 */
(function () {
    'use strict';

    // ===== TOAST =====
    if (!window.showToast) {
        window.showToast = function (message, type) {
            try {
                var host = document.getElementById('prorankToastHost');
                if (!host) {
                    host = document.createElement('div');
                    host.id = 'prorankToastHost';
                    document.body.appendChild(host);
                }

                var icons = {
                    success: 'fa-check-circle',
                    error: 'fa-exclamation-circle',
                    warning: 'fa-exclamation-triangle',
                    info: 'fa-info-circle'
                };

                var t = type || 'info';
                var toast = document.createElement('div');
                toast.className = 'prorank-toast prorank-toast-' + t;

                var ico = document.createElement('i');
                ico.className = 'fas ' + (icons[t] || icons.info) + ' prorank-toast-ico';

                var msg = document.createElement('span');
                msg.className = 'prorank-toast-msg';
                msg.textContent = (message === undefined || message === null) ? '' : String(message);

                toast.appendChild(ico);
                toast.appendChild(msg);
                host.appendChild(toast);

                requestAnimationFrame(function () { toast.classList.add('show'); });
                setTimeout(function () {
                    toast.classList.remove('show');
                    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
                }, 3500);
            } catch (e) {
                console.warn('showToast error:', e);
            }
        };
    }

    // ===== CONFIRM =====
    if (!window.showConfirm) {
        window.showConfirm = function (title, body, okLabel) {
            return new Promise(function (resolve) {
                var prev = document.getElementById('prorankConfirmOverlay');
                if (prev && prev._resolve) {
                    prev._resolve(false);
                    prev._resolve = null;
                    if (prev.parentNode) prev.parentNode.removeChild(prev);
                }

                var overlay = document.createElement('div');
                overlay.id = 'prorankConfirmOverlay';
                overlay.className = 'prorank-confirm-overlay';

                var box = document.createElement('div');
                box.className = 'prorank-confirm';
                box.setAttribute('role', 'dialog');
                box.setAttribute('aria-modal', 'true');

                var header = document.createElement('div');
                header.className = 'prorank-confirm-header';
                var ico = document.createElement('i');
                ico.className = 'fas fa-question-circle';
                var titleEl = document.createElement('div');
                titleEl.className = 'prorank-confirm-title';
                titleEl.textContent = (title === undefined || title === null) ? '' : String(title);
                header.appendChild(ico);
                header.appendChild(titleEl);
                box.appendChild(header);

                if (body !== undefined && body !== null && String(body) !== '') {
                    var bodyEl = document.createElement('div');
                    bodyEl.className = 'prorank-confirm-body';
                    bodyEl.textContent = String(body);
                    box.appendChild(bodyEl);
                }

                var actions = document.createElement('div');
                actions.className = 'prorank-confirm-actions';

                var cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'prorank-confirm-btn prorank-confirm-cancel';
                cancelBtn.textContent = 'Отмена';

                var okBtn = document.createElement('button');
                okBtn.type = 'button';
                okBtn.className = 'prorank-confirm-btn prorank-confirm-ok';
                okBtn.textContent = (okLabel !== undefined && okLabel !== null && String(okLabel) !== '') ? String(okLabel) : 'Подтвердить';

                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                box.appendChild(actions);
                overlay.appendChild(box);
                document.body.appendChild(overlay);

                function close(result) {
                    document.removeEventListener('keydown', onKey);
                    overlay.removeEventListener('click', onOverlay);
                    overlay._resolve = null;
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    resolve(result);
                }
                function onKey(e) {
                    if (e.key === 'Escape') close(false);
                }
                function onOverlay(e) {
                    if (e.target === overlay) close(false);
                }

                overlay._resolve = close;
                okBtn.addEventListener('click', function () { close(true); });
                cancelBtn.addEventListener('click', function () { close(false); });
                overlay.addEventListener('click', onOverlay);
                document.addEventListener('keydown', onKey);
                okBtn.focus();
            });
        };
    }
})();