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
    if (!currentPostId) return;

    const container = document.getElementById('comments-container');
    if (!container) return;

    try {
        const { data: allComments, error } = await db
            .from('comments')
            .select('*')
            .eq('post_id', currentPostId);

        if (error) throw error;

        if (!allComments || allComments.length === 0) {
            container.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">لا توجد تعليقات بعد.</div>`;
            return;
        }

        allComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const mainComments = allComments.filter(c => !c.parent_id);
        const replies = allComments.filter(c => c.parent_id);

        container.innerHTML = mainComments.map(comment => {
            const commentReplies = replies.filter(r => r.parent_id === comment.id);
            return renderCommentCard(comment, commentReplies, currentPostId);
        }).join('');

    } catch (err) {
        console.error('Error loading comments:', err);
        container.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">تعذر تحميل التعليقات.</div>`;
    }
}

async function submitComment() {
    if (!currentPostId) return;

    const input = document.getElementById('comment-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return alert('يرجى كتابة نص التعليق أولاً');

    const badge = getOrGenerateBadge();

    try {
        const { error: commentError } = await db.from('comments').insert([
            { post_id: currentPostId, content: content, user_badge: badge, parent_id: null }
        ]);

        if (commentError) throw commentError;

        const { data: post } = await db.from('posts').select('comments_count').eq('id', currentPostId).single();
        await db.from('posts').update({ comments_count: (post?.comments_count || 0) + 1 }).eq('id', currentPostId);

        input.value = '';
        loadComments();
        loadPostDetails();

    } catch (err) {
        console.error('Error submitting comment:', err);
        alert('حدث خطأ أثناء إضافة التعليق');
    }
}

async function submitReply(postId, parentCommentId) {
    const inputElement = document.getElementById(`reply-input-${parentCommentId}`);
    if (!inputElement) return;

    const content = inputElement.value.trim();
    if (!content) return alert('يرجى كتابة نص الرد أولاً');

    const badge = getOrGenerateBadge();

    try {
        const { error } = await db.from('comments').insert([
            {
                post_id: postId,
                parent_id: parentCommentId,
                content: content,
                user_badge: badge
            }
        ]);

        if (error) throw error;

        const { data: post } = await db.from('posts').select('comments_count').eq('id', postId).single();
        await db.from('posts').update({ comments_count: (post?.comments_count || 0) + 1 }).eq('id', postId);

        inputElement.value = '';
        toggleReplyForm(parentCommentId);
        loadComments();
        loadPostDetails();

    } catch (err) {
        console.error('Error submitting reply:', err);
        alert('حدث خطأ أثناء إرسال الرد');
    }
}

function renderCommentCard(comment, replies = [], postId) {
    return `
        <div class="bg-gray-900/60 border border-gray-800/80 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-accent">${comment.user_badge}</span>
                <span class="text-[10px] text-gray-500">${new Date(comment.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>

            <p class="text-xs text-gray-300 leading-relaxed">${comment.content}</p>

            <div class="flex items-center gap-2 pt-1">
                <button onclick="toggleReplyForm('${comment.id}')" class="text-[11px] text-emerald-400 hover:underline flex items-center gap-1">
                    <i class="fa-solid fa-reply text-[10px]"></i>
                    <span>رد (${replies.length})</span>
                </button>
            </div>

            <div id="reply-form-${comment.id}" class="hidden pt-2 border-t border-gray-800/50 space-y-2">
                <textarea id="reply-input-${comment.id}" rows="2" placeholder="اكتب ردك هنا..." class="w-full bg-gray-950/80 border border-gray-800 rounded-lg p-2 text-xs text-white focus:border-emerald-500 outline-none resize-none"></textarea>
                <div class="flex justify-end gap-2">
                    <button onclick="toggleReplyForm('${comment.id}')" class="px-3 py-1 rounded-md text-[10px] bg-gray-800 text-gray-400">إلغاء</button>
                    <button onclick="submitReply('${postId}', '${comment.id}')" class="px-3 py-1 rounded-md text-[10px] bg-emerald-500 text-black font-bold">إرسال الرد</button>
                </div>
            </div>

            ${replies.length > 0 ? `
                <div class="mr-3 pr-2 border-r-2 border-emerald-500/30 space-y-2 mt-2">
                    ${replies.map(reply => `
                        <div class="bg-gray-950/50 p-2.5 rounded-lg border border-gray-800/40 space-y-1">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-semibold text-accent/80">${reply.user_badge}</span>
                                <span class="text-[9px] text-gray-500">${new Date(reply.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <p class="text-xs text-gray-300">${reply.content}</p>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function toggleReplyForm(commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.classList.toggle('hidden');
    }
}

function openPostDetails(postId) {
    window.location.href = `post.html?id=${postId}`;
}

document.addEventListener('DOMContentLoaded', () => {
    loadPostDetails();
    loadComments();
});