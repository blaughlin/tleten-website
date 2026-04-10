#!/usr/bin/env node
/**
 * Build static HTML files for each blog post.
 *
 * Reads:
 *   blog/posts.json
 *   blog/posts/<slug>.md
 *   blog/post-template.html
 *
 * Writes:
 *   blog/<slug>.html  (one per post)
 *
 * Run with:
 *   node scripts/build-blog.js
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://tleten.com';
const ROOT = path.resolve(__dirname, '..');
const POSTS_JSON = path.join(ROOT, 'blog', 'posts.json');
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const TEMPLATE = path.join(ROOT, 'blog', 'post-template.html');
const OUTPUT_DIR = path.join(ROOT, 'blog');

function escapeHtmlAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlText(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Markdown parser ported from blog/post.html so behavior stays consistent.
 * Relative image paths get prefixed with `posts/` so they resolve from
 * blog/<slug>.html (which sits next to the posts/ folder).
 */
function parseMarkdown(md) {
    // Strip a leading H1 line if present — the title is rendered separately
    // from posts.json so we don't want a duplicate H1 in the body.
    md = md.replace(/^#\s+.+\n+/, '');

    let html = md
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        // Headings
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        // Horizontal rules
        .replace(/^---$/gm, '<hr>')
        // Bold & italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Images
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
            const resolved = /^(https?:|\/)/.test(src)
                ? src
                : 'posts/' + src.replace(/^\.\//, '');
            return `<img src="${resolved}" alt="${alt}">`;
        })
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Blockquotes
        .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

    // Process unordered lists. Trailing \n is appended so the paragraph
    // splitter still sees a \n\n separator with the next block.
    html = html.replace(/(?:^[-*] .+\n?)+/gm, function (match) {
        const items = match.trim().split('\n').map(line =>
            '<li>' + line.replace(/^[-*] /, '') + '</li>'
        ).join('\n');
        return '<ul>\n' + items + '\n</ul>\n';
    });

    // Process ordered lists
    html = html.replace(/(?:^\d+\. .+\n?)+/gm, function (match) {
        const items = match.trim().split('\n').map(line =>
            '<li>' + line.replace(/^\d+\. /, '') + '</li>'
        ).join('\n');
        return '<ol>\n' + items + '\n</ol>\n';
    });

    // Paragraphs — wrap remaining loose text
    html = html.split('\n\n').map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|img)/.test(block)) return block;
        return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');

    return html;
}

function formatDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
}

function buildPost(post, template) {
    const mdPath = path.join(POSTS_DIR, post.slug + '.md');
    if (!fs.existsSync(mdPath)) {
        console.warn(`  ! Skipping ${post.slug} — no markdown file at ${mdPath}`);
        return null;
    }

    const md = fs.readFileSync(mdPath, 'utf8');
    const contentHtml = parseMarkdown(md);

    const canonicalUrl = `${SITE_URL}/blog/${post.slug}.html`;
    const description = post.description || post.excerpt || '';
    const ogImage = post.image
        ? `${SITE_URL}/blog/posts/${post.image}`
        : `${SITE_URL}/hero-logo.png`;

    const tagHtml = post.tag
        ? `<span class="post-tag">${escapeHtmlText(post.tag)}</span>`
        : '';

    const heroImageHtml = post.image
        ? `<div class="post-hero-image"><img src="posts/${escapeHtmlAttr(post.image)}" alt="${escapeHtmlAttr(post.title)}"></div>`
        : '';

    const replacements = {
        '{{TITLE}}': escapeHtmlAttr(post.title),
        '{{DESCRIPTION}}': escapeHtmlAttr(description),
        '{{CANONICAL_URL}}': canonicalUrl,
        '{{OG_IMAGE}}': ogImage,
        '{{PUBLISHED_TIME}}': new Date(post.date + 'T00:00:00').toISOString(),
        '{{TAG_HTML}}': tagHtml,
        '{{FORMATTED_DATE}}': formatDate(post.date),
        '{{HERO_IMAGE_HTML}}': heroImageHtml,
        '{{CONTENT_HTML}}': contentHtml,
    };

    let html = template;
    for (const [key, value] of Object.entries(replacements)) {
        html = html.split(key).join(value);
    }

    const outPath = path.join(OUTPUT_DIR, post.slug + '.html');
    fs.writeFileSync(outPath, html);
    return outPath;
}

function main() {
    const posts = JSON.parse(fs.readFileSync(POSTS_JSON, 'utf8'));
    const template = fs.readFileSync(TEMPLATE, 'utf8');

    console.log(`Building ${posts.length} post(s)...`);
    let built = 0;
    for (const post of posts) {
        const out = buildPost(post, template);
        if (out) {
            console.log(`  ✓ ${path.relative(ROOT, out)}`);
            built++;
        }
    }
    console.log(`Done. Built ${built} of ${posts.length} post(s).`);
}

main();
