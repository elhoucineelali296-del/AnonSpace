
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nqzeenelxuhkaqztujbo.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function esc(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncate(text, max) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

module.exports = async (req, res) => {
    const id = String((req.query && req.query.id) || '');
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${proto}://${host}`;

    const validId = /^[A-Za-z0-9_-]{1,64}$/.test(id);
    const target = `/post.html?id=${encodeURIComponent(id)}`;
    const canonical = validId ? `${origin}/p/${encodeURIComponent(id)}` : origin;

    let title = 'منشور على AnonSpace';
    let description = 'منصة مجهولة بالكامل للتعبير عن مشاعرك وأفكارك بدون حساب.';
    let image = `${origin}/icons/og-default.png`;

    if (validId && SUPABASE_ANON_KEY) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ p_post_id: id })
            });
            if (response.ok) {
                const post = await response.json();
                if (post && post.content) {
                    title = `${post.category || 'منشور'} · ${post.user_badge || 'مستخدم مجهول'} على AnonSpace`;
                    description = truncate(post.content, 160);
                    if (post.image_url && String(post.image_url).startsWith(SUPABASE_URL)) {
                        image = post.image_url;
                    }
                }
            }
        } catch (err) {
            // نكتفي بالقيم الافتراضية
        }
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="AnonSpace">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p><a href="${esc(target)}">افتح المنشور</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(html);
};
