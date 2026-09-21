#!/usr/bin/env node
/* ============================================================================
   🔧ФИКС: PRORANK · tools/to-webp.js
   ----------------------------------------------------------------------------
   Утилита пережатия тяжёлых растровых исходников (PNG/JPG > 100 КБ) в WebP.

   Что делает по шагам:
     1) находит все .png/.jpg/.jpeg тяжелее --min-kb в папках иконок;
     2) конвертирует их в .webp через cwebp (кодек libwebp, lossy q --quality);
     3) заменяет ссылки на эти файлы во всех .html/.js/.json/.css проекта
        (включая динамические шаблоны вида `./achiev-icons/${id}.png`);
     4) удаляет исходные тяжёлые PNG/JPG и печатает экономию в мегабайтах.

   Запуск (из корня проекта):
        node tools/to-webp.js
        node tools/to-webp.js --quality 78 --min-kb 100
        node tools/to-webp.js --dry-run          # только анализ, без записи

   Требуется cwebp.exe (кодек libwebp). Утилита ищет его в PATH, в
   %CWEBP_PATH%, а также рекурсивно в %TEMP%/prorank-webp.
   ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Папки, где лежат «рабочие» картинки проекта
const IMAGE_DIRS = ['achiev-icons', 'league-icons', 'category-icons', 'icons'];

// Что не сканируем и не правим
const SKIP_DIRS = new Set(['node_modules', '.git', 'tools', 'onesignal']);

// Файлы, в которых переписываем ссылки на картинки
const TEXT_EXT = new Set(['.html', '.js', '.json', '.css']);

// Папки, у которых меняются ВСЕ файлы, поэтому можно править даже
// динамические шаблоны вида `league-icons/${id}.png`
const FULLY_CONVERTED_DIRS = ['achiev-icons', 'league-icons', 'category-icons'];

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const hasFlag = (name) => argv.includes(name);

const QUALITY = String(arg('--quality', '78'));
const MIN_BYTES = Math.max(0, Number(arg('--min-kb', '100')) || 0) * 1024;
const DRY_RUN = hasFlag('--dry-run');

const kb = (bytes) => (bytes / 1024).toFixed(1) + ' КБ';
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' МБ';

/* ---------------------------------------------------------------------------
   1. ПОИСК УТИЛИТЫ cwebp
   ------------------------------------------------------------------------ */

function walkForCwebp(dir, depth) {
    if (depth > 4 || !fs.existsSync(dir)) return null;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        return null;
    }
    for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase() === 'cwebp.exe') {
            return path.join(dir, entry.name);
        }
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const found = walkForCwebp(path.join(dir, entry.name), depth + 1);
        if (found) return found;
    }
    return null;
}

function resolveCwebp() {
    const candidates = [];

    if (process.env.CWEBP_PATH) candidates.push(process.env.CWEBP_PATH);

    const onPath = spawnSync('where', ['cwebp'], { encoding: 'utf8' });
    if (onPath.status === 0 && onPath.stdout) {
        onPath.stdout.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (trimmed) candidates.push(trimmed);
        });
    }

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }

    const temp = process.env.TEMP || process.env.TMP;
    if (temp) {
        const found = walkForCwebp(path.join(temp, 'prorank-webp'), 0);
        if (found) return found;
    }

    return null;
}

/* ---------------------------------------------------------------------------
   2. ПОИСК ТЯЖЁЛЫХ ИСХОДНИКОВ
   ------------------------------------------------------------------------ */

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg']);

function collectHeavyImages() {
    const found = [];

    for (const dirName of IMAGE_DIRS) {
        const dir = path.join(ROOT, dirName);
        if (!fs.existsSync(dir)) continue;

        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (!RASTER_EXT.has(ext)) continue;

            const full = path.join(dir, entry.name);
            const size = fs.statSync(full).size;
            if (size <= MIN_BYTES) continue;

            found.push({
                dirName,
                fileName: entry.name,
                baseName: path.basename(entry.name, ext),
                fullPath: full,
                size
            });
        }
    }

    found.sort((a, b) => b.size - a.size);
    return found;
}

/* ---------------------------------------------------------------------------
   3. КОНВЕРТАЦИЯ
   ------------------------------------------------------------------------ */

function convert(cwebp, image) {
    const target = path.join(path.dirname(image.fullPath), image.baseName + '.webp');

    const result = spawnSync(cwebp, [
        '-quiet',
        '-q', QUALITY,
        '-m', '6',
        '-mt',
        '-alpha_q', '90',
        '-metadata', 'none',
        image.fullPath,
        '-o', target
    ], { encoding: 'utf8' });

    if (result.status !== 0 || !fs.existsSync(target)) {
        return { ok: false, reason: (result.stderr || result.stdout || 'cwebp error').trim() };
    }

    const newSize = fs.statSync(target).size;

    // Если WebP внезапно оказался тяжелее исходника — оставляем PNG как есть
    if (newSize >= image.size) {
        fs.unlinkSync(target);
        return { ok: false, reason: 'WebP не легче исходника — пропущено' };
    }

    return { ok: true, target, newSize };
}

/* ---------------------------------------------------------------------------
   4. ПЕРЕПИСЬ ССЫЛОК
   ------------------------------------------------------------------------ */

function collectTextFiles(dir, acc) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            collectTextFiles(path.join(dir, entry.name), acc);
            continue;
        }
        if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) acc.push(path.join(dir, entry.name));
    }
    return acc;
}

function rewriteReferences(converted) {
    // Точные имена файлов: 'bronze.png' -> 'bronze.webp'
    const exactRules = converted.map((image) => ({
        from: image.fileName,
        to: image.baseName + '.webp'
    }));

    // Динамические шаблоны: `./achiev-icons/${id}.png` -> `.webp`
    const dynamicFolders = FULLY_CONVERTED_DIRS.filter((dirName) =>
        converted.some((image) => image.dirName === dirName));

    const dynamicRule = dynamicFolders.length
        ? new RegExp('(' + dynamicFolders.join('|') + ')\\/(\\$\\{[^}]+\\})\\.png', 'g')
        : null;

    const files = collectTextFiles(ROOT, []);
    const touched = [];

    for (const file of files) {
        let text = fs.readFileSync(file, 'utf8');
        const before = text;

        for (const rule of exactRules) {
            if (text.indexOf(rule.from) === -1) continue;
            text = text.split(rule.from).join(rule.to);
        }

        if (dynamicRule) text = text.replace(dynamicRule, '$1/$2.webp');

        if (text !== before) {
            if (!DRY_RUN) fs.writeFileSync(file, text, 'utf8');
            touched.push(path.relative(ROOT, file));
        }
    }

    return touched;
}

/* ---------------------------------------------------------------------------
   5. MAIN
   ------------------------------------------------------------------------ */

function main() {
    console.log('\n=== PRORANK · пережатие картинок в WebP ===');
    console.log('Корень проекта : ' + ROOT);
    console.log('Качество WebP  : ' + QUALITY + '%');
    console.log('Порог «тяжёлых»: ' + (MIN_BYTES / 1024) + ' КБ');
    console.log('Режим          : ' + (DRY_RUN ? 'DRY-RUN (без записи)' : 'запись на диск') + '\n');

    const images = collectHeavyImages();
    if (!images.length) {
        console.log('Тяжёлых PNG/JPG не найдено — всё уже оптимизировано.');
        return;
    }

    const totalBefore = images.reduce((sum, image) => sum + image.size, 0);
    console.log('Найдено тяжёлых файлов: ' + images.length + ' · ' + mb(totalBefore) + '\n');

    const cwebp = resolveCwebp();
    if (!cwebp) {
        console.error('cwebp.exe не найден. Укажите путь в переменной CWEBP_PATH.');
        process.exitCode = 1;
        return;
    }
    console.log('Кодек: ' + cwebp + '\n');

    const converted = [];
    let totalAfter = 0;

    for (const image of images) {
        const label = image.dirName + '/' + image.fileName;
        const result = convert(cwebp, image);

        if (!result.ok) {
            console.log('  · ' + label + ' — ' + result.reason);
            continue;
        }

        totalAfter += result.newSize;
        converted.push(image);

        console.log('  OK ' + label + ': ' + kb(image.size) + ' -> ' + kb(result.newSize) +
            '  (-' + Math.round((image.size - result.newSize) / image.size * 100) + '%)');

        if (!DRY_RUN) fs.unlinkSync(image.fullPath);
    }

    if (!converted.length) {
        console.log('\nНи один файл не удалось сжать — исходники не изменены.');
        return;
    }

    const touched = rewriteReferences(converted);

    const totalSaved = totalBefore - totalAfter;
    console.log('\n--- ИТОГО ---');
    console.log('Конвертировано : ' + converted.length + ' из ' + images.length);
    console.log('Было           : ' + mb(totalBefore));
    console.log('Стало          : ' + mb(totalAfter));
    console.log('Сэкономлено    : ' + mb(totalSaved) +
        ' (' + Math.round(totalSaved / totalBefore * 100) + '%)');
    console.log('Обновлено файлов со ссылками: ' + touched.length);
    touched.forEach((file) => console.log('  ~ ' + file));
    console.log('');
}

main();


