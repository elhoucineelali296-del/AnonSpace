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

const LAST_POST_KEY = 'last_post_timestamp';
const COOLDOWN_TIME = 30000;

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

// حالة الخلاصة: بحث + ترتيب + تحميل المزيد
const ONLY_MINE = window.ONLY_MINE === true; // صفحة "منشوراتي"
const PAGE_SIZE = 20;
let currentSearch = '';
let currentSort = 'new';
let loadedCount = 0;
let hasMorePosts = false;
let fetchSeq = 0;
let searchTimer = null;

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
    const now = new Date();
    const past = new Date(dateString);
    const seconds = Math.floor((now - past) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) {
        return `منذ ${formatWesternNumber(Math.floor(interval))} سنوات`;
    }
    interval = seconds / 2592000;
    if (interval > 1) {
        return `منذ ${formatWesternNumber(Math.floor(interval))} أشهر`;
    }
    interval = seconds / 86400;
    if (interval > 1) {
        return `منذ ${formatWesternNumber(Math.floor(interval))} أيام`;
    }
    interval = seconds / 3600;
    if (interval > 1) {
        return `منذ ${formatWesternNumber(Math.floor(interval))} ساعات`;
    }
    interval = seconds / 60;
    if (interval > 1) {
        return `منذ ${formatWesternNumber(Math.floor(interval))} دقائق`;
    }
    return `منذ لحظات`;
}

function filterCategory(category, btnElement) {
    currentCategory = category;
    
    const buttons = document.querySelectorAll('.category-btn');
    buttons.forEach(btn => {
        const isSelected = btn === btnElement || btn.textContent.trim() === category;
        if (isSelected) {
            btn.classList.add('bg-emerald-500', 'text-black', 'font-bold');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.remove('bg-emerald-500', 'text-black', 'font-bold');
            btn.classList.add('text-gray-400');
        }
    });

    loadedCount = 0;
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
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-emerald-400' : type === 'error' ? 'fa-triangle-exclamation text-red-400' : 'fa-bell text-emerald-400'}"></i><span>${escapeHtml(message)}</span>`;
    
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

async function fetchPosts(append = false) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const reqId = ++fetchSeq;

    try {
        const client = getClient();
        if (!client) {
            container.innerHTML = `<div class="text-center py-12 text-red-400 text-xs">خطأ في الاتصال بقاعدة البيانات. تأكد من إعدادات Supabase.</div>`;
            return;
        }

        // عند التحديث (بعد إعجاب مثلاً) نعيد تحميل نفس عدد المنشورات المعروضة حتى لا يضيع مكانك
        const offset = append ? loadedCount : 0;
        const limit = append ? PAGE_SIZE : Math.min(Math.max(loadedCount, PAGE_SIZE), 100);

        const { data, error } = await client.rpc('get_posts', {
            p_category: (currentCategory && currentCategory !== 'الكل') ? currentCategory : null,
            p_token: userToken,
            p_search: currentSearch || null,
            p_sort: currentSort,
            p_limit: limit,
            p_offset: offset,
            p_mine: ONLY_MINE
        });

        if (error) throw error;
        if (reqId !== fetchSeq) return; // وصل رد أقدم من طلب أحدث، نتجاهله

        const posts = (data && data.posts) || [];
        hasMorePosts = !!(data && data.has_more);

        if (append) {
            container.insertAdjacentHTML('beforeend', posts.map(post => renderPostCard(post)).join(''));
            loadedCount += posts.length;
        } else {
            loadedCount = posts.length;
            if (posts.length === 0) {
                const msg = ONLY_MINE
                    ? 'لم تنشر أي منشور من هذا المتصفح بعد.'
                    : currentSearch
                    ? `لا توجد نتائج للبحث عن "${escapeHtml(currentSearch)}"${currentCategory !== 'الكل' ? ` في تصنيف (${escapeHtml(currentCategory)})` : ''}.`
                    : `لا توجد مشاركات ${currentCategory !== 'الكل' ? `في تصنيف (${escapeHtml(currentCategory)})` : ''} حالياً. كن أول من يبوح!`;
                container.innerHTML = `<div class="text-center py-12 text-gray-500 text-xs">${msg}</div>`;
            } else {
                container.innerHTML = posts.map(post => renderPostCard(post)).join('');
            }
        }

        updateLoadMoreButton();
    } catch (err) {
        console.error('Error fetching posts:', err);
        if (!append) {
            container.innerHTML = `<div class="text-center py-12 text-red-400 text-xs">تعذر تحميل المنشورات. يرجى مراجعة Console لمعرفة الخطأ.</div>`;
        } else {
            showToast('تعذر تحميل المزيد من المنشورات', 'error');
        }
    }
}

function updateLoadMoreButton() {
    const wrap = document.getElementById('load-more-wrap');
    if (wrap) wrap.classList.toggle('hidden', !hasMorePosts);
}

async function loadMorePosts() {
    const btn = document.getElementById('load-more-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'جاري التحميل...';
    }
    await fetchPosts(true);
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'عرض المزيد';
    }
}

function updateSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const active = btn.dataset.sort === currentSort;
        btn.classList.toggle('bg-emerald-500', active);
        btn.classList.toggle('text-black', active);
        btn.classList.toggle('font-bold', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('text-gray-500', !active);
        btn.classList.toggle('border', !active);
        btn.classList.toggle('border-gray-300', !active);
    });
}

function setSort(sort) {
    if (sort === currentSort) return;
    currentSort = sort;
    loadedCount = 0;
    updateSortButtons();
    fetchPosts();
}

function onSearchInput(value) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const q = value.trim();
        if (q === currentSearch) return;
        currentSearch = q;
        loadedCount = 0;
        fetchPosts();
    }, 400);
}

// بعد نشر منشور جديد نعيد البحث والترتيب للوضع الافتراضي ليظهر منشورك في الأعلى
function resetFeedFilters() {
    currentSearch = '';
    currentSort = 'new';
    loadedCount = 0;
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    updateSortButtons();
}

function initFeedControls() {
    const input = document.getElementById('search-input');
    if (input) {
        input.addEventListener('input', e => onSearchInput(e.target.value));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimer);
                const q = input.value.trim();
                if (q !== currentSearch) {
                    currentSearch = q;
                    loadedCount = 0;
                    fetchPosts();
                }
            }
        });
    }

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => setSort(btn.dataset.sort));
    });

    const moreBtn = document.getElementById('load-more-btn');
    if (moreBtn) moreBtn.addEventListener('click', loadMorePosts);

    updateSortButtons();
}

function renderPostCard(post) {
    const isMyPost = post.is_mine === true;
    const hasReported = localStorage.getItem(`reported_${post.id}`);
    const hasReacted = localStorage.getItem(`reacted_${post.id}`);
    const timeAgoStr = formatTimeAgo(post.created_at);

    return `
        <div id="post-${post.id}" class="glass-card rounded-2xl p-5 space-y-3 shadow-xl relative hover:border-emerald-500/30 transition">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="bg-[#34d399] text-slate-900 px-2.5 py-1 rounded-full text-[10px] font-bold">
                        ${escapeHtml(post.user_badge || 'مستخدم مجهول')}
                    </span>
                    <span class="text-[10px] bg-gray-900/80 text-gray-200 border border-gray-200 px-2 py-0.5 rounded-md">${escapeHtml(post.category || 'عام')}</span>
                    <span class="text-xs text-gray-500">${timeAgoStr}</span>
                    ${(post.reports_count || 0) >= 5 ? '<span class="text-[10px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-md">مخفي بسبب البلاغات</span>' : ''}
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

            <p class="text-sm text-slate-800 leading-relaxed whitespace-pre-line">${escapeHtml(post.content)}</p>

            ${post.image_url ? `
                <div class="rounded-xl overflow-hidden border border-gray-200/80 max-h-80 bg-black/40">
                    <img src="${escapeHtml(post.image_url)}" class="w-full object-cover max-h-80" loading="lazy" alt="مرفق المشاركة">
                </div>
            ` : ''}

            <div class="flex items-center justify-between border-t border-gray-200/60 pt-3 text-xs">
                <div class="flex items-center gap-4">
                    <button onclick="reactPost('${post.id}', 'like')" class="${hasReacted === 'like' ? 'text-emerald-400 font-bold' : 'text-gray-200 hover:text-emerald-400'} flex items-center gap-1.5 transition">
                        <i class="fa-regular fa-thumbs-up"></i>
                        <span>${formatWesternNumber(post.likes_count || 0)}</span>
                    </button>
                    <button onclick="reactPost('${post.id}', 'dislike')" class="${hasReacted === 'dislike' ? 'text-red-400 font-bold' : 'text-gray-200 hover:text-red-400'} flex items-center gap-1.5 transition">
                        <i class="fa-regular fa-thumbs-down"></i>
                        <span>${formatWesternNumber(post.dislikes_count || 0)}</span>
                    </button>
                </div>

                <a href="post.html?id=${post.id}" class="text-emerald-400 hover:underline flex items-center gap-1.5">
                    <i class="fa-regular fa-comment"></i>
                    <span>${formatWesternNumber(post.comments_count || 0)} تعليق</span>
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

    const lastPost = localStorage.getItem(LAST_POST_KEY);
    if (lastPost && (Date.now() - parseInt(lastPost)) < COOLDOWN_TIME) {
        return showToast('يرجى الانتظار 30 ثانية قبل إضافة منشور جديد', 'error');
    }

    const content = contentInput ? contentInput.value.trim() : '';
    if (!content) return showToast('الرجاء كتابة نص المشاركة أولاً', 'error');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'جاري النشر...';
    }

    let imageUrl = null;

    try {
        if (selectedImageFile) {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowedTypes.includes(selectedImageFile.type)) {
                throw new Error('invalid_image_type');
            }
            if (selectedImageFile.size > 5 * 1024 * 1024) {
                throw new Error('image_too_large');
            }
            const fileExt = selectedImageFile.type.split('/')[1];
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

        const categoryValue = categoryInput ? categoryInput.value : 'عام';

        const { data, error } = await client.rpc('create_post', {
            p_content: content,
            p_category: categoryValue,
            p_image_url: imageUrl,
            p_token: userToken
        });

        if (error) throw error;

        if (data && data.id !== undefined) {
            saveMyPostId(data.id);
        }

        localStorage.setItem(LAST_POST_KEY, Date.now().toString());

        if (contentInput) contentInput.value = '';
        removeSelectedImage();
        showToast('تم نشر مشاركتك بنجاح!', 'success');
        resetFeedFilters();
        fetchPosts();

    } catch (err) {
        console.error(err);
        const msg = String(err && err.message || '');
        if (msg.includes('cooldown')) {
            showToast('يرجى الانتظار 30 ثانية قبل إضافة منشور جديد', 'error');
        } else if (msg.includes('invalid_image_type')) {
            showToast('نوع الصورة غير مدعوم (JPG, PNG, WEBP, GIF)', 'error');
        } else if (msg.includes('image_too_large')) {
            showToast('حجم الصورة يجب ألا يتجاوز 5 ميغابايت', 'error');
        } else {
            showToast('حدث خطأ أثناء النشر. أعد المحاولة.', 'error');
        }
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
        const { error } = await client.rpc('react_post', {
            p_post_id: String(postId),
            p_type: type,
            p_token: userToken
        });
        if (error) throw error;

        localStorage.setItem(`reacted_${postId}`, type);
        showToast(type === 'like' ? 'تم تسجيل إعجابك' : 'تم تسجيل عدم إعجابك', 'success');
        checkUnreadNotifications();
        fetchPosts();
    } catch (err) {
        console.error(err);
        if (String(err && err.message || '').includes('already_reacted')) {
            localStorage.setItem(`reacted_${postId}`, type);
            return showToast('لقد تفاعلت مع هذه المشاركة سابقاً', 'error');
        }
        showToast('حدث خطأ أثناء تسجيل التفاعل', 'error');
    }
}

async function deletePost(postId) {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!confirm('هل أنت متأكد من إرادة حذف هذه المشاركة؟')) return;

    try {
        const { data: deleted, error } = await client.rpc('delete_post', {
            p_post_id: String(postId),
            p_token: userToken
        });
        if (error) throw error;
        if (!deleted) throw new Error('not_deleted');

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
        const { data: updatedReports, error } = await client.rpc('report_post', {
            p_post_id: String(postId),
            p_token: userToken
        });
        if (error) throw error;

        localStorage.setItem(`reported_${postId}`, 'true');
        showToast('شكراً لمساعدتنا، تم تسجيل إبلاغك', 'success');

        if (updatedReports >= 5) {
            document.getElementById(`post-${postId}`)?.remove();
        } else {
            fetchPosts();
        }
    } catch (err) {
        if (String(err && err.message || '').includes('already_reported')) {
            localStorage.setItem(`reported_${postId}`, 'true');
            return showToast('لقد قمت بالإبلاغ عن هذا المنشور سابقاً', 'error');
        }
        showToast('حدث خطأ أثناء إرسال الإبلاغ', 'error');
    }
}

let lastUnreadCount = null;

function initRealtimeNotifications() {
    // Realtime مباشر على جدول notifications لم يعد ممكناً بعد تفعيل RLS،
    // لذلك نفحص الإشعارات كل 20 ثانية عبر دالة آمنة.
    setInterval(async () => {
        if (document.hidden) return;
        const count = await checkUnreadNotifications();
        if (count !== null && lastUnreadCount !== null && count > lastUnreadCount) {
            showToast('لديك إشعار جديد', 'info');
            const dropdown = document.getElementById('notif-dropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                loadNotifications();
            }
        }
        if (count !== null) lastUnreadCount = count;
    }, 20000);
}

document.addEventListener('DOMContentLoaded', () => {
    initFeedControls();
    fetchPosts();
    initRealtimeNotifications();
    checkUnreadNotifications().then(c => { if (c !== null) lastUnreadCount = c; });
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

    const { data: notifications, error } = await client.rpc('get_my_notifications', {
        p_token: userToken
    });

    if (error || !notifications || notifications.length === 0) {
        listContainer.innerHTML = `<div class="p-4 text-center text-xs text-gray-500">لا توجد إشعارات حالياً</div>`;
        return;
    }

    listContainer.innerHTML = notifications.map(n => `
        <div onclick="openNotification('${n.id}', '${n.post_id || ''}')"
             class="p-3 cursor-pointer hover:bg-gray-800/40 transition flex items-start gap-3 ${!n.is_read ? 'bg-emerald-950/20' : ''}">
            <div class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <i class="fa-solid fa-heart text-xs"></i>
            </div>
            <div class="flex-1 text-right">
                <p class="text-xs text-gray-200">${escapeHtml(n.message)}</p>
                <span class="text-[10px] text-gray-500">${formatTimeAgo(n.created_at)}</span>
            </div>
        </div>
    `).join('');
}

async function openNotification(notifId, postId) {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) return;

    await client.rpc('mark_notification_read', {
        p_id: String(notifId),
        p_token: userToken
    });

    if (postId) {
        window.location.href = `post.html?id=${postId}`;
    } else {
        checkUnreadNotifications();
        loadNotifications();
    }
}

async function checkUnreadNotifications() {
    const client = getClient();
    if (!client) return null;

    const { data, error } = await client.rpc('count_unread_notifications', {
        p_token: userToken
    });
    const count = (!error && typeof data === 'number') ? data : 0;

    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (!error && count > 0) {
            badge.innerText = count > 9 ? '+9' : formatWesternNumber(count);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    return error ? null : count;
}

async function markAllAsRead() {
    const client = window.db || (typeof db !== 'undefined' ? db : null) || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) return;

    await client.rpc('mark_all_notifications_read', { p_token: userToken });

    const badge = document.getElementById('notif-badge');
    if (badge) badge.classList.add('hidden');
    loadNotifications();
}