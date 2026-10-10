// Блог Героёнка: собирает страницы блога из scripts/blog/posts/*.md в папку сборки (по умолчанию dist/).
// Запускается из scripts/build-pages.sh после копирования страниц и до clean-urls.
// Пока в posts/ нет ни одной статьи, скрипт ничего не публикует: ни /blog, ни ссылки в подвале, ни записей в sitemap.
// Шапка, подвал и общие стили берутся из about.html — так блог всегда совпадает с остальным сайтом.
// Формат статьи — в scripts/blog/README.md. Локальная проверка: node scripts/build-blog.mjs dist [папка-со-статьями]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist');
const postsDir = process.argv[3] || join(root, 'scripts', 'blog', 'posts');
const SITE = 'https://geroenok.online';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- статьи ---
function parsePost(file) {
  const text = readFileSync(join(postsDir, file), 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: нет блока --- с полями в начале`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const key of ['title', 'description', 'date']) if (!meta[key]) throw new Error(`${file}: нет поля ${key}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date должна быть ГГГГ-ММ-ДД`);
  meta.slug = file.replace(/\.md$/, '');
  if (!/^[a-z0-9-]+$/.test(meta.slug)) throw new Error(`${file}: имя файла — только латиница, цифры и дефис`);
  meta.body = m[2].trim();
  return meta;
}

const posts = existsSync(postsDir)
  ? readdirSync(postsDir).filter((f) => f.endsWith('.md')).map(parsePost)
      .filter((p) => p.draft !== 'да')
      .sort((a, b) => b.date.localeCompare(a.date))
  : [];

if (!posts.length) {
  console.log('blog: статей нет — блог не публикуется');
  process.exit(0);
}

// --- небольшой Markdown: заголовки ##/###, абзацы, списки, цитаты, **жирный**, *курсив*, [ссылки](адрес), картинки, HTML как есть ---
function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
}
function markdown(md) {
  const html = [];
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flush(); closeList(); continue; }
    if (line.startsWith('<')) { flush(); closeList(); html.push(line); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); closeList(); html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); closeList(); html.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    if ((m = line.match(/^(-|\d+\.)\s+(.*)$/))) {
      flush();
      const tag = m[1] === '-' ? 'ul' : 'ol';
      if (list !== tag) { closeList(); html.push(`<${tag}>`); list = tag; }
      html.push(`<li>${inline(m[2])}</li>`);
      continue;
    }
    closeList();
    para.push(line);
  }
  flush();
  closeList();
  return html.join('\n');
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ruDate = (d) => { const [y, mo, da] = d.split('-').map(Number); return `${da} ${MONTHS[mo - 1]} ${y}`; };
const readMinutes = (md) => Math.max(1, Math.round(md.split(/\s+/).length / 180));

// --- шаблон из about.html ---
const about = readFileSync(join(root, 'about.html'), 'utf8');
const headEnd = about.indexOf('<meta name="theme-color"');
const headTpl = about.slice(0, about.indexOf('>', headEnd) + 1);
const header = about.slice(about.indexOf('<header class="site-header">'), about.indexOf('</header>') + 9);
const footer = about.slice(about.indexOf('<footer class="site-footer">'), about.indexOf('</footer>') + 9);
for (const [name, part] of [['head', headTpl], ['header', header], ['footer', footer]]) {
  if (part.length < 200) throw new Error(`blog: не нашёл ${name} в about.html`);
}

function head({ title, description, path, type, image, extra }) {
  const url = SITE + path;
  return headTpl
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${image ? SITE + '/' + image.replace(/^\//, '') : SITE + '/assets/brand/og-image.jpg'}">`)
    + `\n<style>${STYLE}</style>\n${extra || ''}\n</head>\n<body>\n\n${header}\n`;
}

const STYLE = `
.blog-hero{ padding:56px 0 24px; text-align:center; }
.blog-hero .kicker{ font-family:var(--font-script); color:var(--gold-dark); font-size:24px; }
.blog-hero h1{ font-family:'Lora', Georgia, serif; font-size:40px; line-height:1.2; color:#2f2618; margin:6px auto 14px; max-width:820px; }
.blog-hero .lead{ font-family:'Literata', Georgia, serif; font-size:19px; color:#5a4a3a; max-width:640px; margin:0 auto; }
.blog-meta{ font-size:14px; color:var(--text-soft); margin-top:14px; }
.blog-list{ display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:28px; max-width:1040px; margin:0 auto; padding:24px 0 88px; }
.blog-card{ display:flex; flex-direction:column; background:var(--cream); border-radius:var(--radius-m); overflow:hidden; text-decoration:none; color:inherit; box-shadow:var(--shadow-soft); transition:transform .2s ease; }
.blog-card:hover{ transform:translateY(-4px); }
.blog-card img{ width:100%; aspect-ratio:16/9; object-fit:cover; }
.blog-card div{ padding:20px 22px 24px; }
.blog-card .kicker{ font-family:var(--font-script); color:var(--gold-dark); font-size:20px; }
.blog-card h2{ font-family:'Lora', Georgia, serif; font-size:21px; line-height:1.3; color:#2f2618; margin:2px 0 8px; }
.blog-card p{ font-size:15.5px; color:var(--text-soft); margin:0; }
.blog-article{ max-width:720px; margin:0 auto; padding:8px 0 40px; font-family:'Literata', Georgia, serif; font-size:18.5px; line-height:1.8; color:#2f2618; }
.blog-article h2{ font-family:'Lora', Georgia, serif; font-size:28px; margin:1.6em 0 .5em; }
.blog-article h3{ font-family:'Lora', Georgia, serif; font-size:22px; margin:1.4em 0 .4em; }
.blog-article ul, .blog-article ol{ padding-left:1.3em; margin:0 0 1.1em; }
.blog-article li{ margin:.3em 0; }
.blog-article a{ color:var(--gold-dark); }
.blog-article img{ border-radius:var(--radius-m); margin:1.4em auto; box-shadow:var(--shadow-soft); }
.blog-article blockquote{ margin:1.4em 0; padding:16px 22px; background:var(--cream); border-left:4px solid var(--gold); border-radius:0 var(--radius-m) var(--radius-m) 0; font-style:italic; }
.blog-article blockquote p{ margin:0; }
.blog-cta{ max-width:720px; margin:8px auto 40px; padding:30px 34px; background:var(--ink); color:var(--text-light); border-radius:var(--radius-l); text-align:center; }
.blog-cta p{ font-family:'Literata', Georgia, serif; font-size:19px; margin:0 0 18px; }
.blog-more{ max-width:720px; margin:0 auto; padding:0 0 88px; }
.blog-more h2{ font-family:'Lora', Georgia, serif; font-size:24px; color:#2f2618; }
.blog-more a{ display:block; padding:12px 0; border-bottom:1px solid var(--line); color:#2f2618; text-decoration:none; font-family:'Literata', Georgia, serif; }
.blog-more a:hover{ color:var(--gold-dark); }
.blog-article .tldr{ background:var(--cream); border:1px solid var(--line); border-radius:var(--radius-m); padding:20px 24px; margin:0 0 1.6em; font-size:17px; }
.blog-article .tldr p{ margin:0; }
.blog-article .toc{ background:var(--paper-2); border-radius:var(--radius-m); padding:18px 24px 8px; margin:0 0 1.8em; font-size:16.5px; line-height:1.6; }
.blog-article .toc p{ margin:0 0 .4em; }
.blog-article .toc a{ text-decoration:none; }
.blog-article .table-wrap{ overflow-x:auto; margin:1.2em 0 1.6em; }
.blog-article table{ width:100%; border-collapse:collapse; font-family:var(--font-body); font-size:15px; line-height:1.45; background:var(--cream); border-radius:var(--radius-m); overflow:hidden; }
.blog-article th, .blog-article td{ padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
.blog-article th{ background:var(--ink); color:var(--text-light); font-weight:700; }
.blog-article figure{ margin:1.6em 0; }
.blog-article .spread{ display:grid; grid-template-columns:1fr 1fr; gap:0; border-radius:var(--radius-m); overflow:hidden; box-shadow:var(--shadow-soft); }
.blog-article .spread img{ margin:0; border-radius:0; box-shadow:none; width:100%; height:auto; }
.blog-article figcaption{ font-size:15px; line-height:1.55; color:var(--text-soft); margin-top:10px; font-style:italic; }
.blog-article details{ background:var(--cream); border-radius:var(--radius-m); padding:14px 20px; margin:0 0 12px; }
.blog-article summary{ cursor:pointer; font-family:'Lora', Georgia, serif; }
.blog-article details p{ margin:.7em 0 0; }
.blog-article .related{ font-size:16px; margin-top:2em; }
@media (max-width:640px){
  .blog-hero h1{ font-size:29px; }
  .blog-hero .lead{ font-size:17px; }
  .blog-article{ font-size:17px; }
  .blog-article h2{ font-size:23px; }
  .blog-cta{ padding:24px 20px; border-radius:16px; }
}
@media print{
  .site-header, .site-footer, .blog-cta, .blog-more, .no-print{ display:none !important; }
  body{ background:#fff; }
}`;

const tail = `\n${footer}\n\n</body>\n</html>\n`;
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
// «Частые вопросы» в статье (<details><summary>вопрос</summary><p>ответ</p>) → разметка FAQPage
const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function faqLd(body) {
  const qa = [...body.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map((m) => ({ '@type': 'Question', name: plain(m[1]), acceptedAnswer: { '@type': 'Answer', text: plain(m[2]) } }));
  return qa.length ? '\n' + ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa }) : '';
}
const publisher = { '@type': 'Organization', name: 'Героёнок', url: SITE + '/', logo: SITE + '/assets/brand/apple-touch-icon.png' };

// --- страницы статей ---
for (const p of posts) {
  const path = `/blog-${p.slug}`;
  const more = posts.filter((o) => o !== p).slice(0, 4)
    .map((o) => `<a href="blog-${o.slug}.html">${esc(o.title)}</a>`).join('\n');
  const cta = p.cta === 'нет' ? '' : `<section class="blog-cta">
  <p>${esc(p.cta || 'Хотите, чтобы ваш ребёнок стал героем своей книги? Первые страницы — бесплатно.')}</p>
  <a href="${esc(p.cta_href || 'create.html')}" class="btn btn-primary">${esc(p.cta_button || 'Создать книгу')}</a>
</section>`;
  const html = head({
    title: p.seo_title || `${p.title} | Блог Героёнка`, description: p.description, path, type: 'article', image: p.image,
    extra: ld({
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description,
      datePublished: p.date, dateModified: p.updated || p.date, inLanguage: 'ru',
      mainEntityOfPage: SITE + path, image: p.image ? SITE + '/' + p.image.replace(/^\//, '') : SITE + '/assets/brand/og-image.jpg',
      author: /^Команда/.test(p.author || '') ? { '@type': 'Organization', name: p.author, url: SITE + '/' }
        : { '@type': 'Person', name: p.author || 'Нелли Галстян', url: SITE + '/about' }, publisher,
    }) + faqLd(p.body) + '\n' + ld({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Героёнок', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Блог', item: SITE + '/blog' },
        { '@type': 'ListItem', position: 3, name: p.title, item: SITE + path },
      ],
    }),
  }) + `
<section class="blog-hero">
  <div class="container">
    <a class="kicker" href="blog.html" style="text-decoration:none">${esc(p.kicker || 'Блог Героёнка')}</a>
    <h1>${esc(p.title)}</h1>
    ${p.lead ? `<p class="lead">${esc(p.lead)}</p>` : ''}
    <p class="blog-meta">${ruDate(p.date)} · ${readMinutes(p.body)} мин чтения · ${esc(p.author || 'Нелли Галстян')}</p>
  </div>
</section>

<section class="tight" style="padding-top:8px;">
  <div class="container">
    <article class="blog-article">
${markdown(p.body)}
    </article>
  </div>
</section>

${cta}

${more ? `<section class="blog-more" style="padding-top:0"><div class="container"><h2>Ещё в блоге</h2>\n${more}\n</div></section>` : ''}
` + tail;
  writeFileSync(join(out, `blog-${p.slug}.html`), html);
}

// --- список статей ---
const cards = posts.map((p) => `<a class="blog-card" href="blog-${p.slug}.html">
  ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ''}
  <div><span class="kicker">${esc(p.kicker || ruDate(p.date))}</span><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p></div>
</a>`).join('\n');
writeFileSync(join(out, 'blog.html'), head({
  title: 'Блог Героёнка — о детях, книгах и чтении',
  description: 'Статьи для родителей: как приучить к чтению, что подарить ребёнку, как придумать сказку на ночь, и материалы для печати.',
  path: '/blog', type: 'website',
}) + `
<section class="blog-hero">
  <div class="container">
    <span class="kicker">Блог Героёнка</span>
    <h1>О детях, книгах и маленьких героях</h1>
    <p class="lead">Советы родителям, идеи подарков и материалы для печати.</p>
  </div>
</section>
<section class="tight" style="padding-top:0;"><div class="container"><div class="blog-list">
${cards}
</div></div></section>
` + tail);

// --- ссылка «Блог» в подвале всех страниц и адреса в sitemap ---
const link = '<li><a href="blog.html">Блог</a></li>';
let patched = 0;
for (const f of readdirSync(out).filter((n) => n.endsWith('.html'))) {
  const file = join(out, f);
  const s = readFileSync(file, 'utf8');
  if (s.includes(link)) continue;
  const next = s.replace(/(<li><a href="about\.html">О нас<\/a><\/li>)/, `$1\n          ${link}`);
  if (next !== s) { writeFileSync(file, next); patched += 1; }
}
const sitemap = join(out, 'sitemap.xml');
if (existsSync(sitemap)) {
  const urls = [`  <url><loc>${SITE}/blog</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    ...posts.map((p) => `  <url><loc>${SITE}/blog-${p.slug}</loc><lastmod>${p.updated || p.date}</lastmod><priority>0.6</priority></url>`)];
  writeFileSync(sitemap, readFileSync(sitemap, 'utf8').replace('</urlset>', urls.join('\n') + '\n</urlset>'));
}
console.log(`blog: ${posts.length} статей, ссылка в подвале на ${patched} страницах`);
