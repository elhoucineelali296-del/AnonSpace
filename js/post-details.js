const urlParams = new URLSearchParams(window.location.search);
const currentPostId = urlParams.get('id');

let userToken = localStorage.getItem('anon_user_token');
if (!userToken) {
    const rand = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
    userToken = 'token_' + rand;
    localStorage.setItem('anon_user_token', userToken);
}

function getClient() {
    return window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatWesternNumber(num) {
    const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num).replace(/[٠-٩]/g, d => arabicNums.indexOf(d));
}

function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return `منذ ${formatWesternNumber(Math.floor(interval))} سنوات`;
    interval = seconds / 2592000;
    if (interval > 1) return `منذ ${formatWesternNumber(Math.floor(interval))} أشهر`;
    interval = seconds / 86400;
    if (interval > 1) return `منذ ${formatWesternNumber(Math.floor(interval))} أيام`;
    interval = seconds / 3600;
    if (interval > 1) return `منذ ${formatWesternNumber(Math.floor(interval))} ساعات`;
    interval = seconds / 60;
    if (interval > 1) return `منذ ${formatWesternNumber(Math.floor(interval))} دقائق`;
    return `منذ لحظات`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl text-xs font-semibold text-white shadow-2xl backdrop-blur border flex items-center gap-2 transition-all duration-300 transform translate-y-2 ${
        type === 'success' ? 'bg-emerald-900/90 border-emerald-500' :
        type === 'error' ? 'bg-red-900/90 border-red-500' : 'bg-gray-900/90 border-emerald-500'
    }`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-emerald-400' : type === 'error' ? 'fa-triangle-exclamation text-red-400' : 'fa-bell text-emerald-400'}"></i><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function getOrGenerateBadge() {
    let badge = localStorage.getItem('anon_badge');
    if (!badge) {
        const randomId = Math.floor(1000 + Math.random() * 9000);
        badge = `مستخدم #${randomId}`;
        localStorage.setItem('anon_badge', badge);
    }
    return badge;
}

function errMessage(err) {
    return String((err && err.message) || '');
}

async function handleReaction(postId, type) {
    if (localStorage.getItem(`reacted_${postId}`)) {
        return showToast('لقد تفاعلت مع هذه المشاركة سابقاً', 'error');
    }
    const client = getClient();
    if (!client) return;

    try {
        const { error } = await client.rpc('react_post', {
            p_post_id: String(postId),
            p_type: type,
            p_token: userToken
        });
        if (error) throw error;

        localStorage.setItem(`reacted_${postId}`, type);
        showToast(type === 'like' ? 'تم تسجيل إعجابك' : 'تم تسجيل عدم إعجابك', 'success');
        loadPostDetails();
    } catch (err) {
        console.error('Error reacting:', err);
        if (errMessage(err).includes('already_reacted')) {
            localStorage.setItem(`reacted_${postId}`, type);
            return showToast('لقد تفاعلت مع هذه المشاركة سابقاً', 'error');
        }
        showToast('حدث خطأ أثناء تسجيل التفاعل', 'error');
    }
}

async function loadPostDetails() {
    if (!currentPostId) {
        window.location.href = 'index.html';
        return;
    }

    const container = document.getElementById('single-post-container');
    const client = getClient();
    if (!client || !container) return;

    const { data: post, error } = await client.rpc('get_post', {
        p_post_id: String(currentPostId)
    });

    if (error || !post) {
        if (error) console.error('Error loading post:', error);
        container.innerHTML = '<div class="text-center text-rose-500 py-4">لم يتم العثور على البوست.</div>';
        return;
    }

    const userAction = localStorage.getItem(`reacted_${post.id}`);
    const postIdAttr = escapeHtml(post.id);

    container.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="bg-[#34d399] text-slate-900 px-2.5 py-1 rounded-full text-[10px] font-bold">
                    ${escapeHtml(post.user_badge || 'مستخدم مجهول')}
                </span>
                <span class="text-[10px] bg-gray-900/80 text-gray-200 border border-gray-200 px-2 py-0.5 rounded-md">${escapeHtml(post.category || 'عام')}</span>
                <span class="text-xs text-gray-500">${formatTimeAgo(post.created_at)}</span>
            </div>
        </div>

        <p class="text-sm text-slate-800 leading-relaxed whitespace-pre-line">${escapeHtml(post.content)}</p>

        ${post.image_url ? `
            <div class="rounded-xl overflow-hidden border border-gray-200/80 max-h-80 bg-black/40">
                <img src="${escapeHtml(post.image_url)}" class="w-full object-cover max-h-80" loading="lazy" alt="مرفق المشاركة">
            </div>
        ` : ''}

        <div class="flex items-center justify-between border-t border-gray-200/60 pt-3 text-xs">
            <div class="flex items-center gap-4">
                <button onclick="handleReaction('${postIdAttr}', 'like')" class="${userAction === 'like' ? 'text-emerald-400 font-bold' : 'text-gray-600 hover:text-emerald-500'} flex items-center gap-1.5 transition">
                    <i class="fa-regular fa-thumbs-up"></i>
                    <span>${formatWesternNumber(post.likes_count || 0)}</span>
                </button>
                <button onclick="handleReaction('${postIdAttr}', 'dislike')" class="${userAction === 'dislike' ? 'text-red-400 font-bold' : 'text-gray-600 hover:text-red-400'} flex items-center gap-1.5 transition">
                    <i class="fa-regular fa-thumbs-down"></i>
                    <span>${formatWesternNumber(post.dislikes_count || 0)}</span>
                </button>
            </div>
            <span class="text-emerald-400 flex items-center gap-1.5">
                <i class="fa-regular fa-comment"></i>
                <span>${formatWesternNumber(post.comments_count || 0)} تعليق</span>
            </span>
        </div>
    `;
}

async function loadComments() {
    if (!currentPostId) return;

    const container = document.getElementById('comments-container');
    const client = getClient();
    if (!container || !client) return;

    try {
        const { data: allComments, error } = await client.rpc('get_comments', {
            p_post_id: String(currentPostId)
        });

        if (error) throw error;

        if (!allComments || allComments.length === 0) {
            container.innerHTML = `<div class="text-center py-6 text-gray-500 text-xs">لا توجد تعليقات بعد.</div>`;
            return;
        }

        const mainComments = allComments.filter(c => !c.parent_id);
        const replies = allComments.filter(c => c.parent_id);

        container.innerHTML = mainComments.map(comment => {
            const commentReplies = replies.filter(r => String(r.parent_id) === String(comment.id));
            return renderCommentCard(comment, commentReplies, currentPostId);
        }).join('');

    } catch (err) {
        console.error('Error loading comments:', err);
        container.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">تعذر تحميل التعليقات.</div>`;
    }
}

function commentErrorToast(err, fallback) {
    const msg = errMessage(err);
    if (msg.includes('cooldown')) return showToast('يرجى الانتظار قليلاً قبل التعليق مرة أخرى', 'error');
    if (msg.includes('invalid_content')) return showToast('نص التعليق يجب أن يكون بين 1 و 1000 حرف', 'error');
    if (msg.includes('not_found')) return showToast('المنشور أو التعليق لم يعد موجوداً', 'error');
    showToast(fallback, 'error');
}

async function submitComment() {
    if (!currentPostId) return;

    const input = document.getElementById('comment-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return showToast('يرجى كتابة نص التعليق أولاً', 'error');

    const client = getClient();
    if (!client) return;

    try {
        const { error } = await client.rpc('add_comment', {
            p_post_id: String(currentPostId),
            p_parent_id: null,
            p_content: content,
            p_badge: getOrGenerateBadge(),
            p_token: userToken
        });
        if (error) throw error;

        input.value = '';
        showToast('تم إضافة تعليقك', 'success');
        loadComments();
        loadPostDetails();

    } catch (err) {
        console.error('Error submitting comment:', err);
        commentErrorToast(err, 'حدث خطأ أثناء إضافة التعليق');
    }
}

async function submitReply(postId, parentCommentId) {
    const inputElement = document.getElementById(`reply-input-${parentCommentId}`);
    if (!inputElement) return;

    const content = inputElement.value.trim();
    if (!content) return showToast('يرجى كتابة نص الرد أولاً', 'error');

    const client = getClient();
    if (!client) return;

    try {
        const { error } = await client.rpc('add_comment', {
            p_post_id: String(postId),
            p_parent_id: String(parentCommentId),
            p_content: content,
            p_badge: getOrGenerateBadge(),
            p_token: userToken
        });
        if (error) throw error;

        inputElement.value = '';
        toggleReplyForm(parentCommentId);
        showToast('تم إرسال ردك', 'success');
        loadComments();
        loadPostDetails();

    } catch (err) {
        console.error('Error submitting reply:', err);
        commentErrorToast(err, 'حدث خطأ أثناء إرسال الرد');
    }
}

function renderCommentCard(comment, replies = [], postId) {
    const cid = escapeHtml(comment.id);
    const pid = escapeHtml(postId);

    return `
        <div class="bg-[#fbf2cd] border border-gray-200/80 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
                <span class="bg-[#34d399] text-slate-900 px-2 py-0.5 rounded-full text-[10px] font-bold">${escapeHtml(comment.user_badge || 'مستخدم مجهول')}</span>
                <span class="text-[10px] text-gray-500">${formatTimeAgo(comment.created_at)}</span>
            </div>

            <p class="text-xs text-slate-800 leading-relaxed whitespace-pre-line">${escapeHtml(comment.content)}</p>

            <div class="flex items-center gap-2 pt-1">
                <button onclick="toggleReplyForm('${cid}')" class="text-[11px] text-emerald-600 hover:underline flex items-center gap-1">
                    <i class="fa-solid fa-reply text-[10px]"></i>
                    <span>رد (${formatWesternNumber(replies.length)})</span>
                </button>
            </div>

            <div id="reply-form-${cid}" class="hidden pt-2 border-t border-gray-200/60 space-y-2">
                <textarea id="reply-input-${cid}" rows="2" maxlength="1000" placeholder="اكتب ردك هنا..." class="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs text-slate-800 focus:border-emerald-500 outline-none resize-none"></textarea>
                <div class="flex justify-end gap-2">
                    <button onclick="toggleReplyForm('${cid}')" class="px-3 py-1 rounded-md text-[10px] bg-gray-200 text-gray-700">إلغاء</button>
                    <button onclick="submitReply('${pid}', '${cid}')" class="px-3 py-1 rounded-md text-[10px] bg-emerald-500 text-black font-bold">إرسال الرد</button>
                </div>
            </div>

            ${replies.length > 0 ? `
                <div class="mr-3 pr-2 border-r-2 border-emerald-500/40 space-y-2 mt-2">
                    ${replies.map(reply => `
                        <div class="bg-white/60 p-2.5 rounded-lg border border-gray-200/70 space-y-1">
                            <div class="flex items-center justify-between">
                                <span class="bg-[#34d399] text-slate-900 px-2 py-0.5 rounded-full text-[9px] font-bold">${escapeHtml(reply.user_badge || 'مستخدم مجهول')}</span>
                                <span class="text-[9px] text-gray-500">${formatTimeAgo(reply.created_at)}</span>
                            </div>
                            <p class="text-xs text-slate-800 whitespace-pre-line">${escapeHtml(reply.content)}</p>
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
    window.location.href = `post.html?id=${encodeURIComponent(postId)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    loadPostDetails();
    loadComments();
});