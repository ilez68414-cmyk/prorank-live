#!/usr/bin/env node
/* ============================================================================
   🔧ФИКС: PRORANK · tools/check-syntax.js
   ----------------------------------------------------------------------------
   Проверка синтаксиса JS во всём проекте без сборщика:
     • обычные .js файлы              → node --check
     • inline <script type="module">  → вырезаются из HTML и тоже проверяются
     • inline <script> (classic)      → проверяются как скрипт

   Это «мини-линтер»: он ловит опечатки, незакрытые скобки и дубли объявлений,
   которые иначе всплыли бы только в браузере.

   Запуск (из корня проекта):
        node tools/check-syntax.js
   Код возврата: 0 — всё чисто, 1 — есть ошибки.
   ========================================================================= */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'tools', 'onesignal']);
const TMP_DIR = path.join(os.tmpdir(), 'prorank-syntax-check');

function walk(dir, ext, acc) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(path.join(dir, entry.name), ext, acc);
            continue;
        }
        if (path.extname(entry.name).toLowerCase() === ext) acc.push(path.join(dir, entry.name));
    }
    return acc;
}

// node --check <file> (module:true — чтобы import/export не считались ошибкой)
function checkSource(label, code, isModule) {
    const safeName = label.replace(/[\\/:"*?<>|]+/g, '_') + (isModule ? '.mjs' : '.cjs');
    const tmpFile = path.join(TMP_DIR, safeName);

    try {
        fs.writeFileSync(tmpFile, code, 'utf8');
    } catch (error) {
        return { ok: false, message: 'не удалось записать временный файл: ' + error.message };
    }

    const result = spawnSync(process.execPath, ['--check', tmpFile], { encoding: 'utf8' });
    if (result.status === 0) return { ok: true };

    const raw = (result.stderr || result.stdout || '').split('\n')
        .filter((line) => line && !line.includes(tmpFile) && !/^\s*\^/.test(line) && !/^Node\.js/.test(line))
        .join(' ').trim();

    return { ok: false, message: raw || 'синтаксическая ошибка' };
}

// Вырезаем все <script>…</script> из HTML
function extractScripts(html) {
    const scripts = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    let index = 0;

    while ((match = re.exec(html)) !== null) {
        index++;
        const attrs = match[1] || '';
        const body = match[2] || '';
        if (!body.trim()) continue;                       // внешний src — нечего проверять
        if (/\bsrc\s*=/i.test(attrs)) continue;

        const isModule =
            /\btype\s*=\s*["']module["']/i.test(attrs) ||
            /\btype\s*=\s*["']importmap["']/i.test(attrs);

        // importmap — это JSON, а не JS
        if (/\btype\s*=\s*["']importmap["']/i.test(attrs)) {
            try {
                JSON.parse(body);
            } catch (error) {
                scripts.push({ index, isModule: false, code: '', jsonError: error.message, raw: body });
            }
            continue;
        }

        scripts.push({ index, isModule, code: body });
    }

    return scripts;
}

function main() {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });

    console.log('\n=== PRORANK · проверка синтаксиса JS ===\n');

    const problems = [];
    let checkedJs = 0;
    let checkedInline = 0;

    // 1) обычные .js
    for (const file of walk(ROOT, '.js', [])) {
        const rel = path.relative(ROOT, file);
        const code = fs.readFileSync(file, 'utf8');
        const isModule = /^\s*(import|export)\b/m.test(code);
        const result = checkSource(rel, code, isModule);
        checkedJs++;
        if (!result.ok) problems.push(rel + ' → ' + result.message);
    }

    // 2) inline-скрипты в HTML
    for (const file of walk(ROOT, '.html', [])) {
        const rel = path.relative(ROOT, file);
        const html = fs.readFileSync(file, 'utf8');

        for (const script of extractScripts(html)) {
            checkedInline++;
            const label = rel + ' [script #' + script.index + ']';
            if (script.jsonError) {
                problems.push(label + ' (importmap JSON) → ' + script.jsonError);
                continue;
            }
            const result = checkSource(label, script.code, script.isModule);
            if (!result.ok) problems.push(label + ' → ' + result.message);
        }
    }

    const jsFiles = walk(ROOT, '.js', []).length;
    console.log('Проверено .js файлов        : ' + checkedJs + ' (найдено ' + jsFiles + ')');
    console.log('Проверено inline-скриптов   : ' + checkedInline);

    if (!problems.length) {
        console.log('\n✅ Синтаксических ошибок нет.\n');
        return;
    }

    console.log('\n❌ Найдено проблем: ' + problems.length + '\n');
    problems.forEach((item) => console.log('  • ' + item));
    console.log('');
    process.exitCode = 1;
}

main();