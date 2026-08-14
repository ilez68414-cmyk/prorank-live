// =============================================
// ===== print-utils.js - Печать накладных =====
// =============================================

/**
 * Вспомогательные функции (дублируем, чтобы файл был независимым)
 */
const PrintUtils = {
    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, m => ({ 
            '&': '&amp;', 
            '<': '&lt;', 
            '>': '&gt;' 
        }[m] || m));
    },

    formatCurrency(amount) {
        return (amount || 0).toLocaleString() + ' ₽';
    },

    getStatusText(status) {
        const map = { 
            'paid': 'Оплачен', 
            'shipped': 'В пути', 
            'completed': 'Завершён', 
            'cancelled': 'Отменён' 
        };
        return map[status] || status;
    },

    formatDate(date) {
        if (!date) return '—';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleString('ru-RU', { 
            day: '2-digit', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
};

/**
 * Печать накладной для одного заказа
 */
function printOrderInvoice(orderData) {
    // Принимаем либо объект заказа, либо ID
    let order = orderData;
    
    // Если передан ID, пытаемся найти заказ
    if (typeof orderData === 'string') {
        // Ищем в глобальном состоянии (если оно есть)
        if (window.state && window.state.allOrders) {
            order = window.state.allOrders.find(o => o.id === orderData);
        }
        if (!order) {
            alert('Заказ не найден');
            return;
        }
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        alert('Пожалуйста, разрешите всплывающие окна');
        return;
    }

    // Формируем HTML для накладной
    const itemsHtml = order.partnerItems?.map(item => `
        <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${PrintUtils.escapeHtml(item.productName)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${PrintUtils.formatCurrency(item.price)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${PrintUtils.formatCurrency(item.totalPrice || item.price * item.quantity)}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#999;">Нет товаров</td></tr>';

    const total = order.partnerOrderTotal || 0;
    const date = new Date(order.createdAt?.seconds * 1000 || Date.now()).toLocaleString('ru-RU');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Накладная ${order.id}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #fbbf24; padding-bottom: 20px; margin-bottom: 24px; }
                .header .logo { font-size: 24px; font-weight: 800; color: #1a1a1a; }
                .header .logo span { color: #fbbf24; }
                .header .order-id { font-size: 14px; color: #666; }
                .title { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #1a1a1a; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #f8f8f8; padding: 16px 20px; border-radius: 8px; }
                .info-grid .field .label { font-size: 11px; color: #888; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
                .info-grid .field .value { font-size: 14px; font-weight: 500; margin-top: 2px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                table th { background: #fbbf24; color: #000; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
                table td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
                .total-row { display: flex; justify-content: flex-end; padding: 16px 0; border-top: 2px solid #fbbf24; margin-top: 8px; }
                .total-row .total-label { font-weight: 600; color: #666; margin-right: 24px; }
                .total-row .total-amount { font-size: 20px; font-weight: 800; color: #fbbf24; }
                .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
                .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                .status-paid { background: #fef3c7; color: #f59e0b; }
                .status-shipped { background: #ede9fe; color: #8b5cf6; }
                .status-completed { background: #d1fae5; color: #10b981; }
                .status-cancelled { background: #fee2e2; color: #ef4444; }
                @media print { body { padding: 20px; } .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">PRO<span>RANK</span></div>
                <div class="order-id">Заказ #${order.id}</div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="title">Накладная на отгрузку</div>
                <span class="status-badge status-${order.status}">${PrintUtils.getStatusText(order.status)}</span>
            </div>
            <div class="info-grid">
                <div class="field"><div class="label">👤 Покупатель</div><div class="value">${PrintUtils.escapeHtml(order.userName || 'Покупатель')}</div></div>
                <div class="field"><div class="label">📞 Телефон</div><div class="value">${PrintUtils.escapeHtml(order.userPhone || '—')}</div></div>
                <div class="field" style="grid-column:1/-1;"><div class="label">📍 Адрес доставки</div><div class="value">${PrintUtils.escapeHtml(order.userAddress || '—')}</div></div>
                ${order.userComment ? `<div class="field" style="grid-column:1/-1;"><div class="label">💬 Комментарий</div><div class="value" style="color:#fbbf24;">${PrintUtils.escapeHtml(order.userComment)}</div></div>` : ''}
                <div class="field"><div class="label">📅 Дата заказа</div><div class="value">${date}</div></div>
                ${order.trackingNumber ? `<div class="field"><div class="label">📦 Трек-номер</div><div class="value" style="color:#3b82f6;">${PrintUtils.escapeHtml(order.trackingNumber)}</div></div>` : ''}
            </div>
            <table>
                <thead><tr><th>Товар</th><th style="text-align:center;">Кол-во</th><th style="text-align:right;">Цена</th><th style="text-align:right;">Сумма</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <div class="total-row"><span class="total-label">Итого к оплате:</span><span class="total-amount">${PrintUtils.formatCurrency(total)}</span></div>
            <div class="footer"><p>Спасибо за покупку! | PRORANK — рейтинг спортсменов-любителей</p><p style="margin-top:4px;">Дата печати: ${new Date().toLocaleString('ru-RU')}</p></div>
            <div style="text-align:center;margin-top:20px;" class="no-print">
                <button onclick="window.print()" style="padding:10px 30px;background:#fbbf24;color:#000;border:none;border-radius:30px;font-weight:600;font-size:14px;cursor:pointer;">🖨️ Печать</button>
                <button onclick="window.close()" style="padding:10px 30px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:30px;font-weight:600;font-size:14px;cursor:pointer;margin-left:8px;">Закрыть</button>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => { if (printWindow && !printWindow.closed) printWindow.print(); }, 500);
}

/**
 * Массовая печать накладных
 */
async function printBulkInvoices(orderIds) {
    if (!orderIds || orderIds.length === 0) {
        alert('Выберите заказы для печати');
        return;
    }

    // Пытаемся получить заказы из глобального состояния
    let orders = [];
    if (window.state && window.state.allOrders) {
        orders = orderIds.map(id => window.state.allOrders.find(o => o.id === id)).filter(o => o !== undefined);
    }

    if (orders.length === 0) {
        alert('Заказы не найдены');
        return;
    }

    // Показываем прогресс
    const overlay = document.getElementById('batchOverlay');
    if (overlay) {
        overlay.classList.add('show');
        document.getElementById('batchStatus').textContent = `Подготовка накладных (${orders.length} шт)...`;
    }

    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        if (overlay) {
            document.getElementById('batchStatus').textContent = `Печать ${i + 1} из ${orders.length}: ${order.id}`;
            const progress = document.getElementById('batchProgress');
            if (progress) progress.style.width = ((i + 1) / orders.length * 100) + '%';
        }
        await new Promise(resolve => {
            setTimeout(() => { printOrderInvoice(order); resolve(); }, 300);
        });
    }

    if (overlay) {
        overlay.classList.remove('show');
    }
    alert(`✅ Накладные подготовлены (${orders.length} шт.)`);
}

// =============================================
// ===== Делаем функции доступными глобально =====
// =============================================

// Добавляем функции в глобальный объект window
window.printOrderInvoice = printOrderInvoice;
window.printBulkInvoices = printBulkInvoices;

console.log('🖨️ print-utils.js загружен!');
console.log('📄 Используйте: printOrderInvoice(orderId) или printBulkInvoices([id1, id2])');