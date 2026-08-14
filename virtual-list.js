// =============================================
// ===== virtual-list.js - Виртуализация списка =====
// =============================================

class VirtualOrderList {
    constructor(container, options = {}) {
        this.container = container;
        this.itemHeight = options.itemHeight || 180;
        this.items = [];
        this.renderWindow = { start: 0, end: 0 };
        this.isRendering = false;
        this.onItemClick = options.onItemClick || null;
        this.onSelectionChange = options.onSelectionChange || null;
        
        // Создаём контейнер для скролла
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.style.cssText = `
            height: ${options.height || '70vh'};
            overflow-y: auto;
            position: relative;
            border-radius: 12px;
            scroll-behavior: smooth;
        `;
        
        // Контейнер для содержимого
        this.contentContainer = document.createElement('div');
        this.contentContainer.style.cssText = `
            position: relative;
            min-height: 100%;
        `;
        
        this.scrollContainer.appendChild(this.contentContainer);
        this.container.innerHTML = '';
        this.container.appendChild(this.scrollContainer);
        
        // Обработчики
        this.scrollContainer.addEventListener('scroll', () => this.onScroll());
        window.addEventListener('resize', () => this.onScroll());
        
        // Делегирование событий для кнопок
        this.contentContainer.addEventListener('click', (e) => this.handleClick(e));
    }
    
    setItems(items) {
        this.items = items;
        this.contentContainer.style.height = (items.length * this.itemHeight) + 'px';
        this.onScroll();
    }
    
    onScroll() {
        if (this.isRendering) return;
        
        const scrollTop = this.scrollContainer.scrollTop;
        const containerHeight = this.scrollContainer.clientHeight;
        
        const start = Math.floor(scrollTop / this.itemHeight);
        const visibleCount = Math.ceil(containerHeight / this.itemHeight) + 2;
        const end = Math.min(start + visibleCount, this.items.length);
        
        const buffer = 5;
        const renderStart = Math.max(0, start - buffer);
        const renderEnd = Math.min(this.items.length, end + buffer);
        
        if (renderStart !== this.renderWindow.start || renderEnd !== this.renderWindow.end) {
            this.renderWindow.start = renderStart;
            this.renderWindow.end = renderEnd;
            this.render();
        }
    }
    
    render() {
        if (this.isRendering) return;
        this.isRendering = true;
        
        const { start, end } = this.renderWindow;
        const visibleItems = this.items.slice(start, end);
        
        const fragment = document.createDocumentFragment();
        
        visibleItems.forEach((item, index) => {
            const actualIndex = start + index;
            const card = this.createCard(item, actualIndex);
            fragment.appendChild(card);
        });
        
        this.contentContainer.innerHTML = '';
        this.contentContainer.appendChild(fragment);
        
        this.isRendering = false;
    }
    
    createCard(order, index) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.orderId = order.id;
        card.dataset.index = index;
        card.style.cssText = `
            position: absolute;
            top: ${index * this.itemHeight}px;
            left: 4px;
            right: 4px;
            height: ${this.itemHeight - 8}px;
            margin: 4px 0;
            cursor: pointer;
        `;
        
        card.innerHTML = this.renderCardHTML(order);
        return card;
    }
    
    renderCardHTML(order) {
        const statusColors = {
            paid: '#f59e0b',
            shipped: '#8b5cf6', 
            completed: '#10b981',
            cancelled: '#ef4444'
        };
        
        const statusTexts = {
            paid: 'Оплачен',
            shipped: 'В пути',
            completed: 'Завершён',
            cancelled: 'Отменён'
        };
        
        const status = order.status || 'paid';
        const statusColor = statusColors[status] || '#666';
        const statusText = statusTexts[status] || status;
        
        return `
            <div class="virtual-card" style="
                background: rgba(18,18,18,0.8);
                border-radius: 12px;
                padding: 12px 16px;
                height: 100%;
                border: 1px solid rgba(251,191,36,0.06);
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
            ">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <input type="checkbox" class="order-checkbox" data-id="${order.id}" 
                               style="width:16px;height:16px;accent-color:#fbbf24;cursor:pointer;">
                        <span style="font-weight:700;color:#fbbf24;font-size:0.85rem;">${order.id}</span>
                        <span style="font-size:0.65rem;color:#555;">${this.formatDate(order.createdAt)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-weight:700;color:#fbbf24;font-size:0.95rem;">
                            ${this.formatCurrency(order.partnerOrderTotal || 0)}
                        </span>
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:20px;font-size:0.6rem;font-weight:600;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}30;">
                            <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
                            ${statusText}
                        </span>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:6px;flex:1;">
                    <div>
                        <div style="font-size:0.55rem;color:#555;text-transform:uppercase;letter-spacing:0.3px;">👤 Покупатель</div>
                        <div style="font-size:0.8rem;color:#e5e5e5;">${this.escapeHtml(order.userName || 'Покупатель')}</div>
                        <div style="font-size:0.65rem;color:#666;">${this.escapeHtml(order.userPhone || '')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.55rem;color:#555;text-transform:uppercase;letter-spacing:0.3px;">📍 Адрес</div>
                        <div style="font-size:0.7rem;color:#888;">${this.escapeHtml(order.userAddress || '—')}</div>
                        ${order.userComment ? `<div style="font-size:0.65rem;color:#fbbf24;margin-top:2px;">💬 ${this.escapeHtml(order.userComment)}</div>` : ''}
                    </div>
                    <div>
                        <div style="font-size:0.55rem;color:#555;text-transform:uppercase;letter-spacing:0.3px;">🛒 Товары</div>
                        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">
                            ${order.partnerItems?.slice(0, 3).map(item => `
                                <span style="background:rgba(255,255,255,0.04);padding:1px 8px;border-radius:10px;font-size:0.6rem;color:#ccc;border:1px solid rgba(255,255,255,0.04);">
                                    ${this.escapeHtml(item.productName)} <span style="color:#fbbf24;">×${item.quantity}</span>
                                </span>
                            `).join('') || '<span style="font-size:0.65rem;color:#666;">—</span>'}
                            ${order.partnerItems?.length > 3 ? `<span style="font-size:0.55rem;color:#555;">+${order.partnerItems.length - 3}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:4px;">
                    <button class="btn-action" data-action="view" data-id="${order.id}" 
                            style="border:none;padding:2px 10px;border-radius:12px;font-size:0.55rem;font-weight:600;cursor:pointer;background:rgba(251,191,36,0.08);color:#fbbf24;transition:all 0.2s ease;">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${order.status === 'paid' ? `
                        <button class="btn-action" data-action="ship" data-id="${order.id}"
                                style="border:none;padding:2px 10px;border-radius:12px;font-size:0.55rem;font-weight:600;cursor:pointer;background:#fbbf24;color:#000;transition:all 0.2s ease;">
                            <i class="fas fa-truck"></i>
                        </button>
                    ` : ''}
                    <button class="btn-action" data-action="chat" data-id="${order.id}"
                            style="border:none;padding:2px 10px;border-radius:12px;font-size:0.55rem;font-weight:600;cursor:pointer;background:rgba(59,130,246,0.12);color:#60a5fa;transition:all 0.2s ease;">
                        <i class="fas fa-comments"></i>
                    </button>
                    <button class="btn-action" data-action="print" data-id="${order.id}"
                            style="border:none;padding:2px 10px;border-radius:12px;font-size:0.55rem;font-weight:600;cursor:pointer;background:rgba(139,92,246,0.12);color:#a78bfa;transition:all 0.2s ease;">
                        <i class="fas fa-print"></i>
                    </button>
                    ${order.status === 'paid' || order.status === 'shipped' ? `
                        <button class="btn-action" data-action="cancel" data-id="${order.id}"
                                style="border:none;padding:2px 10px;border-radius:12px;font-size:0.55rem;font-weight:600;cursor:pointer;background:rgba(239,68,68,0.12);color:#ef4444;transition:all 0.2s ease;">
                            <i class="fas fa-ban"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    handleClick(e) {
        const target = e.target.closest('[data-action]');
        if (target) {
            const action = target.dataset.action;
            const id = target.dataset.id;
            e.stopPropagation();
            
            // Находим заказ
            const order = this.items.find(o => o.id === id);
            if (!order) return;
            
            switch(action) {
                case 'view':
                    window.openViewModal?.(id);
                    break;
                case 'ship':
                    window.openShipModal?.(id);
                    break;
                case 'chat':
                    window.openChat?.(order.userId, id);
                    break;
                case 'print':
                    window.printOrderInvoice?.(id);
                    break;
                case 'cancel':
                    window.openCancelModal?.(id);
                    break;
            }
        }
        
        // Чекбокс
        const checkbox = e.target.closest('.order-checkbox');
        if (checkbox) {
            e.stopPropagation();
            const id = checkbox.dataset.id;
            if (checkbox.checked) {
                window.state?.selectedOrders?.add(id);
            } else {
                window.state?.selectedOrders?.delete(id);
            }
            window.updateBulkActions?.();
            // Обновляем выделение у всех карточек
            this.updateSelection();
        }
    }
    
    updateSelection() {
        if (!window.state?.selectedOrders) return;
        const selected = window.state.selectedOrders;
        this.contentContainer.querySelectorAll('.order-checkbox').forEach(cb => {
            const id = cb.dataset.id;
            if (id) {
                cb.checked = selected.has(id);
                const card = cb.closest('.order-card');
                if (card) {
                    const inner = card.querySelector('.virtual-card');
                    if (inner) {
                        inner.style.borderColor = selected.has(id) ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.06)';
                        inner.style.background = selected.has(id) ? 'rgba(251,191,36,0.04)' : 'rgba(18,18,18,0.8)';
                    }
                }
            }
        });
    }
    
    // Вспомогательные методы
    formatDate(date) {
        if (!date) return '—';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    }
    
    formatCurrency(amount) {
        return (amount || 0).toLocaleString() + ' ₽';
    }
    
    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
    }
    
    clear() {
        this.items = [];
        this.contentContainer.innerHTML = '';
        this.contentContainer.style.height = '0';
    }
}

// Делаем доступным глобально
window.VirtualOrderList = VirtualOrderList;

console.log('📋 virtual-list.js загружен!');