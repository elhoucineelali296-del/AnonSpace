const urlParams = new URLSearchParams(window.location.search);
const currentPostId = urlParams.get('id');

function getOrGenerateBadge() {
    let badge = localStorage.getItem('anon_badge');
    if (!badge) {
        const randomId = Math.floor(1000 + Math.random() * 9000);
        badge = `مستخدم #${randomId}`;
        localStorage.setItem('anon_badge', badge);
    }
    return badge;
}


async function loadPostDetails() {
    if (!currentPostId) {
        window.location.href = 'index.html';
        return;
    }

    const container = document.getElementById('single-post-container');

    const { data: post, error } = await db
        .from('posts')
        .select('*')
        .eq('id', currentPostId)
        .single();

    if (error || !post) {
        container.innerHTML = '<div class="text-center text-rose-500 py-4">لم يتم العثور على البوست.</div>';
        return;
    }

    const interactions = JSON.parse(localStorage.getItem('user_interactions') || '{}');
    const userAction = interactions[post.id];

    container.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-accent">
                    <i class="fa-solid fa-mask"></i>
                </span>
                <div>
                    <span class="text-xs font-semibold text-gray-300 block">${post.user_badge}</span>
                    <span class="text-[10px] text-gray-500">${new Date(post.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            </div>
            <span class="bg-gray-800/80 text-gray-400 text-[11px] px-2.5 py-0.5 rounded-full border border-gray-700">${post.category}</span>
        </div>

        <p class="text-sm text-gray-200 leading-relaxed whitespace-pre-line">${post.content}</p>

        <div class="flex items-center justify-between pt-2 border-t border-gray-800/50 text-xs text-gray-400">
            <div class="flex items-center gap-4">
                <button onclick="handleReaction('${post.id}', 'like')" class="flex items-center gap-1.5 transition ${userAction === 'like' ? 'text-emerald-400 font-bold' : 'hover:text-emerald-400'}">
                    <i class="fa-regular fa-thumbs-up"></i>
                    <span>${post.likes_count}</span>
                </button>
                <button onclick="handleReaction('${post.id}', 'dislike')" class="flex items-center gap-1.5 transition ${userAction === 'dislike' ? 'text-rose-400 font-bold' : 'hover:text-rose-400'}">
                    <i class="fa-regular fa-thumbs-down"></i>
                    <span>${post.dislikes_count}</span>
                </button>
            </div>
            <span class="text-gray-500"><i class="fa-regular fa-comment"></i> ${post.comments_count} تعليقات</span>
        </div>
    `;
}


async function loadComments() {
    const container = document.getElementById('comments-container');
    container.innerHTML = '<div class="text-center text-gray-500 py-4 text-xs">جاري تحميل التعليقات...</div>';

    const { data: comments, error } = await db
        .from('comments')
        .select('*')
        .eq('post_id', currentPostId)
        .order('created_at', { ascending: true });

    if (error) {
        container.innerHTML = '<div class="text-center text-rose-500 py-2 text-xs">خطأ في جلب التعليقات.</div>';
        return;
    }

    if (comments.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-6 text-xs">لا توجد تعليقات بعد، كن أول المعلقين!</div>';
        return;
    }

    container.innerHTML = comments.map(comment => `
        <div class="bg-gray-900/60 rounded-xl p-3 border border-gray-800/80 space-y-1.5">
            <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-accent">${comment.user_badge}</span>
                <span class="text-[10px] text-gray-500">${new Date(comment.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <p class="text-xs text-gray-300 leading-relaxed">${comment.content}</p>
        </div>
    `).join('');
}

async function submitComment() {
    const input = document.getElementById('comment-input');
    const content = input.value.trim();
    if (!content) return alert('يرجى كتابة نص التعليق أولاً');

    const badge = getOrGenerateBadge();

    const { error: commentError } = await db.from('comments').insert([
        { post_id: currentPostId, content: content, user_badge: badge }
    ]);

    if (commentError) {
        alert('حدث خطأ أثناء إضافة التعليق');
        return;
    }

    const { data: post } = await db.from('posts').select('comments_count').eq('id', currentPostId).single();
    await db.from('posts').update({ comments_count: (post?.comments_count || 0) + 1 }).eq('id', currentPostId);

    input.value = '';
    loadComments();
    loadPostDetails();
}

function openPostDetails(postId) {
    window.location.href = `post.html?id=${postId}`;
}


document.addEventListener('DOMContentLoaded', () => {
    loadPostDetails();
    loadComments();
});