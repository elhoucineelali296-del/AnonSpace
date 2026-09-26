let userToken = localStorage.getItem('anon_user_token');
if (!userToken) {
    userToken = 'token_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('anon_user_token', userToken);
}

function saveMyPostId(postId) {
    let myPosts = JSON.parse(localStorage.getItem('my_posts_ids') || '[]');
    if (!myPosts.includes(postId)) {
        myPosts.push(postId);
        localStorage.setItem('my_posts_ids', JSON.stringify(myPosts));
    }
}

function getMyPostIds() {
    return JSON.parse(localStorage.getItem('my_posts_ids') || '[]');
}

let selectedImageFile = null;
let currentCategory = 'الكل';

function filterCategory(category, btnElement) {
    currentCategory = category;
    
    const buttons = document.querySelectorAll('.category-btn');
    buttons.forEach(btn => {
        btn.classList.remove('bg-emerald-500', 'text-black', 'font-bold');
        btn.classList.add('text-gray-400');
    });

    if (btnElement) {
        btnElement.classList.add('bg-emerald-500', 'text-black', 'font-bold');
        btnElement.classList.remove('text-gray-400');
    }

    fetchPosts();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl text-xs font-semibold text-white shadow-2xl backdrop-blur border flex items-center gap-2 transition-all duration-300 transform translate-y-2 ${
        type === 'success' ? 'bg-emerald-900/90 border-emerald-500' :
        type === 'error' ? 'bg-red-900/90 border-red-500' : 'bg-gray-900/90 border-emerald-500'
    }`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-emerald-400' : type === 'error' ? 'fa-triangle-exclamation text-red-400' : 'fa-bell text-emerald-400'}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewImg = document.getElementById('image-preview');
            const previewContainer = document.getElementById('image-preview-container');
            if (previewImg) previewImg.src = e.target.result;
            if (previewContainer) previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function removeSelectedImage() {
    selectedImageFile = null;
    const input = document.getElementById('post-image-input');
    if (input) input.value = '';
    const container = document.getElementById('image-preview-container');
    if (container) container.classList.add('hidden');
}

async function fetchPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    try {
        const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        if (!client) {
            console.error('لم يتم العثور على كائن الاتصال بقاعدة البيانات db');
            container.innerHTML = `<div class="text-center py-12 text-red-400 text-xs">خطأ في الاتصال بقاعدة البيانات. تأكد من إعدادات Supabase.</div>`;
            return;
        }

        let query = client
            .from('posts')
            .select('*')
            .or('reports_count.lt.5,reports_count.is.null');

        if (currentCategory && currentCategory !== 'الكل') {
            query = query.eq('category', currentCategory);
        }

        const { data: posts, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        if (!posts || posts.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-gray-500 text-xs">لا توجد مشاركات ${currentCategory !== 'الكل' ? `في تصنيف (${currentCategory})` : ''} حالياً. كن أول من يبوح!</div>`;
            return;
        }

        container.innerHTML = posts.map(post => renderPostCard(post)).join('');
    } catch (err) {
        console.error('Error fetching posts:', err);
        container.innerHTML = `<div class="text-center py-12 text-red-400 text-xs">تعذر تحميل المنشورات. يرجى مراجعة Console لمعرفة الخطأ.</div>`;
    }
}

function renderPostCard(post) {
    const isMyPost = post.author_token === userToken;
    const hasReported = localStorage.getItem(`reported_${post.id}`);
    const hasReacted = localStorage.getItem(`reacted_${post.id}`);

    return `
        <div id="post-${post.id}" class="glass-card rounded-2xl p-5 space-y-3 shadow-xl relative hover:border-emerald-500/30 transition">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 px-2.5 py-1 rounded-full text-[10px] font-bold">
                        ${post.user_badge || 'مستخدم مجهول'}
                    </span>
                    <span class="text-[10px] bg-gray-900/80 text-gray-400 border border-gray-800 px-2 py-0.5 rounded-md">${post.category || 'عام'}</span>
                    <span class="text-xs text-gray-500">${new Date(post.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                
                <div class="flex items-center gap-3">
                    ${isMyPost ? `
                        <button onclick="deletePost('${post.id}')" class="text-gray-500 hover:text-red-400 text-xs transition" title="حذف مشاركتك">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                    <button onclick="reportPost('${post.id}')" class="${hasReported ? 'text-red-500' : 'text-gray-500 hover:text-yellow-500'} text-xs transition" title="إبلاغ عن المحتوى">
                        <i class="fa-solid fa-flag"></i>
                    </button>
                </div>
            </div>

            <p class="text-sm text-gray-200 leading-relaxed whitespace-pre-line">${post.content}</p>

            ${post.image_url ? `
                <div class="rounded-xl overflow-hidden border border-gray-800/80 max-h-80 bg-black/40">
                    <img src="${post.image_url}" class="w-full object-cover max-h-80" loading="lazy" alt="مرفق المشاركة">
                </div>
            ` : ''}

            <div class="flex items-center justify-between border-t border-gray-800/60 pt-3 text-xs">
                <div class="flex items-center gap-4">
                    <button onclick="reactPost('${post.id}', 'like')" class="${hasReacted === 'like' ? 'text-emerald-400 font-bold' : 'text-gray-400 hover:text-emerald-400'} flex items-center gap-1.5 transition">
                        <i class="fa-regular fa-thumbs-up"></i>
                        <span>${post.likes_count || 0}</span>
                    </button>
                    <button onclick="reactPost('${post.id}', 'dislike')" class="${hasReacted === 'dislike' ? 'text-red-400 font-bold' : 'text-gray-400 hover:text-red-400'} flex items-center gap-1.5 transition">
                        <i class="fa-regular fa-thumbs-down"></i>
                        <span>${post.dislikes_count || 0}</span>
                    </button>
                </div>

                <a href="post.html?id=${post.id}" class="text-emerald-400 hover:underline flex items-center gap-1.5">
                    <i class="fa-regular fa-comment"></i>
                    <span>${post.comments_count || 0} تعليق</span>
                </a>
            </div>
        </div>
    `;
}

async function submitPost() {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    const contentInput = document.getElementById('post-content');
    const categoryInput = document.getElementById('post-category');
    const submitBtn = document.getElementById('submit-btn');

    const content = contentInput ? contentInput.value.trim() : '';
    if (!content) return showToast('الرجاء كتابة نص المشاركة أولاً', 'error');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'جاري النشر...';
    }

    let imageUrl = null;

    try {
        if (selectedImageFile) {
            const fileExt = selectedImageFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            
            const { error: uploadError } = await client.storage
                .from('anonspace-images')
                .upload(fileName, selectedImageFile);

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = client.storage
                .from('anonspace-images')
                .getPublicUrl(fileName);

            imageUrl = publicUrlData.publicUrl;
        }

        const randomBadge = `مستخدم #${Math.floor(1000 + Math.random() * 9000)}`;
        const categoryValue = categoryInput ? categoryInput.value : 'عام';

        const { data, error } = await client.from('posts').insert([
            {
                content: content,
                category: categoryValue,
                user_badge: randomBadge,
                image_url: imageUrl,
                author_token: userToken,
                reports_count: 0
            }
        ]).select();

        if (error) throw error;

        if (data && data[0]) {
            saveMyPostId(data[0].id);
        }

        if (contentInput) contentInput.value = '';
        removeSelectedImage();
        showToast('تم نشر مشاركتك بنجاح!', 'success');
        fetchPosts();

    } catch (err) {
        console.error(err);
        showToast('حدث خطأ أثناء النشر. أعد المحاولة.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>بوح الآن</span><i class="fa-solid fa-paper-plane text-xs"></i>`;
        }
    }
}

async function reactPost(postId, type) {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (localStorage.getItem(`reacted_${postId}`)) {
        return showToast('لقد تفاعلت مع هذه المشاركة سابقاً', 'error');
    }

    try {
        const field = type === 'like' ? 'likes_count' : 'dislikes_count';
        const { data: post, error: fetchErr } = await client.from('posts').select(field).eq('id', postId).single();
        if (fetchErr) throw fetchErr;

        const newCount = (post[field] || 0) + 1;
        const updateObj = {};
        updateObj[field] = newCount;

        const { error: updateErr } = await client.from('posts').update(updateObj).eq('id', postId);
        if (updateErr) throw updateErr;

        await client.from('notifications').insert([
            { 
                post_id: postId, 
                message: 'تفاعل أحد الزوار مع بوحك الخفي!' 
            }
        ]);

        localStorage.setItem(`reacted_${postId}`, type);
        showToast(type === 'like' ? 'تم تسجيل إعجابك' : 'تم تسجيل عدم إعجابك', 'success');
        checkUnreadNotifications();
        fetchPosts();
    } catch (err) {
        console.error(err);
        showToast('حدث خطأ أثناء تسجيل التفاعل', 'error');
    }
}

async function deletePost(postId) {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!confirm('هل أنت متأكد من إرادة حذف هذه المشاركة؟')) return;

    try {
        const { error } = await client.from('posts').delete().eq('id', postId).eq('author_token', userToken);
        if (error) throw error;

        showToast('تم حذف المنشور بنجاح', 'success');
        document.getElementById(`post-${postId}`)?.remove();
    } catch (err) {
        showToast('تعذر حذف المنشور', 'error');
    }
}

async function reportPost(postId) {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (localStorage.getItem(`reported_${postId}`)) {
        return showToast('لقد قمت بالإبلاغ عن هذا المنشور سابقاً', 'error');
    }

    try {
        const { data: post } = await client.from('posts').select('reports_count').eq('id', postId).single();
        const updatedReports = (post?.reports_count || 0) + 1;

        await client.from('posts').update({ reports_count: updatedReports }).eq('id', postId);

        localStorage.setItem(`reported_${postId}`, 'true');
        showToast('شكراً لمساعدتنا، تم تسجيل إبلاغك', 'success');

        if (updatedReports >= 5) {
            document.getElementById(`post-${postId}`)?.remove();
        } else {
            fetchPosts();
        }
    } catch (err) {
        showToast('حدث خطأ أثناء إرسال الإبلاغ', 'error');
    }
}

function initRealtimeNotifications() {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) return;

    client.channel('my-comments-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, payload => {
            const myPostIds = getMyPostIds();
            const newComment = payload.new;

            if (myPostIds.includes(newComment.post_id) && newComment.author_token !== userToken) {
                showToast('💬 علّق شخص ما على منشورك!', 'info');
                fetchPosts();
            }
        })
        .subscribe();

    client.channel('my-likes-notifications')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, payload => {
            const updatedPost = payload.new;
            const oldPost = payload.old;

            if (updatedPost.author_token === userToken) {
                if (oldPost && updatedPost.likes_count > oldPost.likes_count) {
                    showToast('❤️ حصل منشورك على إعجاب جديد!', 'success');
                    fetchPosts();
                }
            }
        })
        .subscribe();

    client.channel('db-notifications')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
            checkUnreadNotifications();
            const dropdown = document.getElementById('notif-dropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                loadNotifications();
            }
        })
        .subscribe();
}

document.addEventListener('DOMContentLoaded', () => {
    fetchPosts();
    initRealtimeNotifications();
    checkUnreadNotifications();
});

function toggleNotifications() {
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.classList.toggle('hidden');
    
    if (!dropdown.classList.contains('hidden')) {
        loadNotifications();
    }
}

document.addEventListener('click', function(event) {
    const btn = document.getElementById('notif-btn');
    const dropdown = document.getElementById('notif-dropdown');
    if (btn && dropdown && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.add('hidden');
    }
});

async function loadNotifications() {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    const listContainer = document.getElementById('notif-list');
    if (!listContainer || !client) return;
    
    const { data: notifications, error } = await client
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !notifications || notifications.length === 0) {
        listContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500">لا توجد إشعارات حالياً</div>`;
        return;
    }

    listContainer.innerHTML = notifications.map(n => `
        <div class="p-3 hover:bg-gray-800/40 transition flex items-start gap-3 ${!n.is_read ? 'bg-emerald-950/20' : ''}">
            <div class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <i class="fa-solid fa-heart text-xs"></i>
            </div>
            <div class="flex-1 text-right">
                <p class="text-xs text-gray-200">${n.message}</p>
                <span class="text-[10px] text-gray-500">${new Date(n.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        </div>
    `).join('');
}

async function checkUnreadNotifications() {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) return;

    const { count, error } = await client
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (!error && count > 0) {
            badge.innerText = count > 9 ? '+9' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

async function markAllAsRead() {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) return;

    await client
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);

    const badge = document.getElementById('notif-badge');
    if (badge) badge.classList.add('hidden');
    loadNotifications();
}

