#!/usr/bin/env node
/* ============================================================================
   🔧ФИКС: PRORANK · tools/optimize-head.js
   ----------------------------------------------------------------------------
   Утилита оптимизации <head> во всех HTML-страницах проекта:
     1) добавляет rel="preconnect" / rel="dns-prefetch" для внешних CDN
        (Google Fonts, Font Awesome, jsDelivr, OneSignal, gstatic/Firebase) —
        браузер начинает соединение заранее, шрифты и иконки приходят раньше;
     2) ставит defer классическим скриптам, которые блокировали отрисовку.

   Выполняется ровно один раз на файл: повторный запуск ничего не дублирует
   (проверяется маркер preconnect и уже проставленные defer/async).

   Запуск (из корня проекта):
        node tools/optimize-head.js
        node tools/optimize-head.js --dry-run
   ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const MARKER = '<!--🔧ФИКС: preconnect -->';

// Внешние хосты → как к ним подключаться заранее.
// crossOrigin: true для тех, кто отдаёт шрифты/скрипты с CORS.
const HOST_RULES = [
    { hosts: ['fonts.googleapis.com'], url: 'https://fonts.googleapis.com', crossOrigin: false },
    { hosts: ['fonts.gstatic.com', 'fonts.googleapis.com'], url: 'https://fonts.gstatic.com', crossOrigin: true },
    { hosts: ['cdnjs.cloudflare.com'], url: 'https://cdnjs.cloudflare.com', crossOrigin: true },
    { hosts: ['cdn.jsdelivr.net'], url: 'https://cdn.jsdelivr.net', crossOrigin: true },
    { hosts: ['cdn.onesignal.com'], url: 'https://cdn.onesignal.com', crossOrigin: true },
    { hosts: ['www.gstatic.com'], url: 'https://www.gstatic.com', crossOrigin: true },
    { hosts: ['res.cloudinary.com'], url: 'https://res.cloudinary.com', crossOrigin: false }
];

// 🔧ФИКС: ранее вставленный блок нужно уметь снимать — чтобы утилита была
// идемпотентной и могла переставить блок в правильное место.
function stripExistingBlock(html) {
    return html.replace(
        /[ \t]*<!--🔧ФИКС: preconnect -->\r?\n(?:[ \t]*<link rel="(?:preconnect|dns-prefetch)"[^\r\n]*>\r?\n)*\r?\n?/g,
        ''
    );
}

// Блок вставляем СРАЗУ ПОСЛЕ <meta charset>: до него браузер ещё не знает
// кодировку, а charset обязан попасть в первые 1024 байта документа.
function insertEarly(html, block) {
    const charsetRe = /<meta\s+charset\s*=\s*["']?[^"'>\s]+["']?\s*\/?>/i;
    const trimmed = block.replace(/\s+$/, '');

    if (charsetRe.test(html)) {
        return html.replace(charsetRe, (match) => match + '\n' + trimmed);
    }
    return html.replace(/<head[^>]*>/i, (match) => match + '\n' + trimmed);
}

function buildPreconnectBlock(html) {
    const lines = [MARKER];
    const seen = new Set();

    for (const rule of HOST_RULES) {
        const used = rule.hosts.some((host) => html.indexOf(host) !== -1);
        if (!used || seen.has(rule.url)) continue;
        seen.add(rule.url);

        const cross = rule.crossOrigin ? ' crossorigin' : '';
        lines.push('    <link rel="preconnect" href="' + rule.url + '"' + cross + '>');
        lines.push('    <link rel="dns-prefetch" href="' + rule.url + '">');
    }

    return lines.length > 1 ? lines.join('\n') + '\n' : null;
}

// Классические скрипты (без type="module" / defer / async) задерживают парсинг
function addDefer(html) {
    let changed = false;

    const result = html.replace(/<script\b([^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*)>/gi, (tag, attrs) => {
        if (/\b(defer|async)\b/i.test(attrs)) return tag;
        if (/\btype\s*=\s*["']module["']/i.test(attrs)) return tag;
        changed = true;
        return '<script' + attrs + ' defer>';
    });

    return { html: result, changed };
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'tools', 'onesignal']);

function walkHtml(dir, acc) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walkHtml(path.join(dir, entry.name), acc);
            continue;
        }
        if (path.extname(entry.name).toLowerCase() === '.html') acc.push(path.join(dir, entry.name));
    }
    return acc;
}

function main() {
    console.log('\n=== PRORANK · оптимизация <head> ===');
    console.log('Режим: ' + (DRY_RUN ? 'DRY-RUN (без записи)' : 'запись на диск') + '\n');

    const files = walkHtml(ROOT, []);
    let preconnectAdded = 0;
    let deferFiles = 0;
    let skipped = 0;

    for (const file of files) {
        const rel = path.relative(ROOT, file);
        let html = fs.readFileSync(file, 'utf8');
        const before = html;
        const notes = [];

        if (!/<head[^>]*>/i.test(html)) {
            skipped++;
            console.log('  · ' + rel + ' — нет <head>, пропуск');
            continue;
        }

        // 1) preconnect / dns-prefetch — идемпотентно: старый блок снимаем
        //    и ставим в правильное место (сразу после <meta charset>)
        html = stripExistingBlock(html);
        if (html.indexOf('rel="preconnect"') === -1) {
            const block = buildPreconnectBlock(html);
            if (block) {
                html = insertEarly(html, block);
                preconnectAdded++;
                notes.push('preconnect');
            }
        } else {
            notes.push('preconnect уже был');
        }

        // 2) defer для классических скриптов, блокирующих отрисовку
        const defer = addDefer(html);
        if (defer.changed) {
            html = defer.html;
            deferFiles++;
            notes.push('defer');
        }

        if (html !== before) {
            if (!DRY_RUN) fs.writeFileSync(file, html, 'utf8');
            console.log('  OK ' + rel + ' -> ' + notes.join(', '));
        }
    }

    console.log('\n--- ИТОГО ---');
    console.log('Файлов проверено        : ' + files.length);
    console.log('Добавлено preconnect    : ' + preconnectAdded);
    console.log('Файлов c defer          : ' + deferFiles);
    console.log('Пропущено (нет <head>)  : ' + skipped);
    console.log('');
}

main();
