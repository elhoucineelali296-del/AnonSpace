(function () {
    'use strict';

    const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
    const MAX_MSG = 500;
    const SEND_COOLDOWN = 1500;

    let myHash = null;
    let myName = 'مجهول';
    let activeRoom = null;
    let roomChannel = null;
    let pollTimer = null;
    let seen = new Set();
    let lastTs = null;
    let lastSend = 0;

    const client = () => window.db || null;
    const toast = (m, t) => (window.showToast ? window.showToast(m, t) : alert(m));
    const $ = id => document.getElementById(id);

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function sha256Hex(text) {
        if (window.crypto && crypto.subtle) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        let h1 = 5381, h2 = 52711;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c;
        }
        return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(16, '0');
    }

    const ready = (async () => {
        let token = null;
        try { token = localStorage.getItem('anon_user_token'); } catch (e) {}
        if (!token) token = 'guest_' + Math.random().toString(36).slice(2);
        myHash = (await sha256Hex('anonspace-chat:' + token)).slice(0, 32);
        myName = 'مجهول #' + (parseInt(myHash.slice(0, 4), 16) % 900 + 100);
    })();

    function timeLeft(expiresAt) {
        const ms = new Date(expiresAt).getTime() - Date.now();
        if (ms <= 0) return 'منتهية';
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `تنتهي بعد ${h} س` : `تنتهي بعد ${m} د`;
    }

    function setAll(selector, html) {
        document.querySelectorAll(selector).forEach(el => { el.innerHTML = html; });
    }

  
    async function fetchChatRooms() {
        const c = client();
        if (!c) {
            setAll('.rooms-list', '<div class="text-center text-xs text-red-500 py-3">خطأ في اتصال قاعدة البيانات</div>');
            return;
        }
        try {
            const { data, error } = await c
                .from('chat_rooms')
                .select('id,title,creator_name,created_at,expires_at')
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(30);
            if (error) throw error;

            document.querySelectorAll('.rooms-count').forEach(el => { el.textContent = (data || []).length; });

            if (!data || data.length === 0) {
                setAll('.rooms-list', '<div class="text-center text-xs text-slate-500 py-3">لا توجد غرف مفتوحة حالياً. أنشئ واحدة!</div>');
                return;
            }

            setAll('.rooms-list', data.map(room => `
                <div class="bg-white border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-sm">
                    <div class="truncate pr-2">
                        <span class="font-bold text-slate-800 block truncate">${esc(room.title)}</span>
                        <span class="text-[10px] text-slate-500">${esc(room.creator_name)} · ${timeLeft(room.expires_at)}</span>
                    </div>
                    <button type="button" data-id="${esc(room.id)}" data-title="${esc(room.title)}"
                        onclick="joinRoom(this.dataset.id, this.dataset.title)"
                        class="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold text-[10px] transition shrink-0">دخول</button>
                </div>`).join(''));
        } catch (err) {
            console.error('fetchChatRooms:', err);
            setAll('.rooms-list', '<div class="text-center text-xs text-red-500 py-3">تعذر جلب الغرف (تأكد من تشغيل ملف SQL الخاص بالدردشة)</div>');
        }
    }


    function openCreateRoomModal() {
        $('create-room-modal').classList.remove('hidden');
        setTimeout(() => $('room-title-input') && $('room-title-input').focus(), 50);
    }

    function closeCreateRoomModal() {
        $('create-room-modal').classList.add('hidden');
        $('room-title-input').value = '';
    }

    async function createRoom() {
        const title = $('room-title-input').value.trim();
        if (!title) return toast('الرجاء إدخال عنوان الغرفة', 'error');
        if (title.length > 60) return toast('عنوان الغرفة طويل (60 حرفاً كحد أقصى)', 'error');

        const c = client();
        if (!c) return toast('اتصال قاعدة البيانات غير متوفر', 'error');
        await ready;

        const btn = $('create-room-btn');
        if (btn) btn.disabled = true;
        try {
            const { data, error } = await c
                .from('chat_rooms')
                .insert([{ title, creator_name: myName, expires_at: new Date(Date.now() + ROOM_TTL_MS).toISOString() }])
                .select('id,title')
                .single();
            if (error) throw error;

            closeCreateRoomModal();
            fetchChatRooms();
            joinRoom(data.id, data.title);
        } catch (err) {
            console.error('createRoom:', err);
            toast('حدث خطأ أثناء إنشاء الغرفة', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function bubble(m) {
        const mine = m.sender_hash === myHash;
        const t = new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="flex ${mine ? 'justify-start' : 'justify-end'}">
                <div class="max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm ${mine ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800 border border-gray-200'}">
                    <div class="text-[10px] font-bold mb-0.5 ${mine ? 'text-emerald-100' : 'text-emerald-600'}">${mine ? 'أنت' : esc(m.sender_name)}</div>
                    <div class="whitespace-pre-line break-words leading-relaxed">${esc(m.content)}</div>
                    <div class="text-[9px] mt-1 opacity-70 text-left">${t}</div>
                </div>
            </div>`;
    }

    function appendMessage(m) {
        if (!m || seen.has(m.id)) return;
        seen.add(m.id);
        lastTs = m.created_at;
        const box = $('chat-messages');
        const empty = $('chat-empty');
        if (empty) empty.remove();
        const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        box.insertAdjacentHTML('beforeend', bubble(m));
        if (nearBottom || m.sender_hash === myHash) box.scrollTop = box.scrollHeight;
    }

    async function loadMessages() {
        const c = client();
        const { data, error } = await c
            .from('chat_messages')
            .select('id,sender_hash,sender_name,content,created_at')
            .eq('room_id', activeRoom.id)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;

        const box = $('chat-messages');
        box.innerHTML = '';
        const list = (data || []).reverse();
        if (list.length === 0) {
            box.innerHTML = '<div id="chat-empty" class="text-center text-xs text-slate-500 py-8">لا رسائل بعد. ابدأ المحادثة!</div>';
        }
        list.forEach(appendMessage);
        box.scrollTop = box.scrollHeight;
    }

    async function pollMessages() {
        if (!activeRoom || document.hidden) return;
        try {
            let q = client().from('chat_messages')
                .select('id,sender_hash,sender_name,content,created_at')
                .eq('room_id', activeRoom.id)
                .order('created_at', { ascending: true })
                .limit(100);
            if (lastTs) q = q.gt('created_at', lastTs);
            const { data, error } = await q;
            if (!error && data) data.forEach(appendMessage);
        } catch (e) { /* نتجاهل أخطاء الشبكة المؤقتة */ }
    }

    function subscribeRoom() {
        const c = client();
        const roomId = activeRoom.id;
        roomChannel = c.channel('chat-room-' + roomId, { config: { presence: { key: myHash } } })
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'room_id=eq.' + roomId },
                payload => appendMessage(payload.new))
            .on('presence', { event: 'sync' }, () => {
                const n = Object.keys(roomChannel.presenceState()).length;
                const el = $('chat-online');
                if (el) el.textContent = n;
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') roomChannel.track({ at: Date.now() });
            });
        pollTimer = setInterval(pollMessages, 5000);
    }

    function teardownRoom() {
        if (roomChannel) { try { client().removeChannel(roomChannel); } catch (e) {} roomChannel = null; }
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        activeRoom = null;
        seen = new Set();
        lastTs = null;
    }

    async function joinRoom(id, title) {
        await ready;
        teardownRoom();
        activeRoom = { id, title };

        $('chat-title').textContent = title || 'غرفة';
        $('chat-online').textContent = '1';
        $('chat-messages').innerHTML = '<div class="text-center text-xs text-slate-500 py-8">جاري التحميل...</div>';
        $('chat-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', fitToViewport);
            window.visualViewport.addEventListener('scroll', fitToViewport);
            fitToViewport();
        }

        try {
            await loadMessages();
            subscribeRoom();
            setTimeout(() => $('chat-input') && $('chat-input').focus(), 50);
        } catch (err) {
            console.error('joinRoom:', err);
            $('chat-messages').innerHTML = '<div class="text-center text-xs text-red-500 py-8">تعذر فتح الغرفة. ربما انتهت صلاحيتها.</div>';
        }
    }

    function fitToViewport() {
        const sheet = $('chat-sheet');
        const vv = window.visualViewport;
        if (!sheet || !vv) return;
        if (window.innerWidth < 640) {
            sheet.style.height = vv.height + 'px';
            sheet.parentElement.style.alignItems = 'flex-start';
            sheet.parentElement.style.transform = 'translateY(' + vv.offsetTop + 'px)';
        } else {
            sheet.style.height = '';
            sheet.parentElement.style.transform = '';
        }
        const box = $('chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
    }

    function closeChat() {
        teardownRoom();
        const m = $('chat-modal');
        if (m) m.classList.add('hidden');
        document.body.style.overflow = '';
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', fitToViewport);
            window.visualViewport.removeEventListener('scroll', fitToViewport);
        }
        const sh = $('chat-sheet');
        if (sh) { sh.style.height = ''; sh.parentElement.style.transform = ''; }
        fetchChatRooms();
    }

    async function sendChatMessage() {
        if (!activeRoom) return;
        const input = $('chat-input');
        const text = input.value.trim();
        if (!text) return;
        if (text.length > MAX_MSG) return toast(`الرسالة طويلة (${MAX_MSG} حرفاً كحد أقصى)`, 'error');
        if (Date.now() - lastSend < SEND_COOLDOWN) return toast('أبطئ قليلاً...', 'error');
        lastSend = Date.now();

        try {
            const { data, error } = await client()
                .from('chat_messages')
                .insert([{ room_id: activeRoom.id, sender_hash: myHash, sender_name: myName, content: text }])
                .select('id,sender_hash,sender_name,content,created_at')
                .single();
            if (error) throw error;
            input.value = '';
            appendMessage(data);
        } catch (err) {
            console.error('sendChatMessage:', err);
            toast('تعذر إرسال الرسالة (قد تكون الغرفة انتهت)', 'error');
        }
    }

    async function initPresence() {
        const c = client();
        if (!c) return;
        await ready;
        const ch = c.channel('anonspace-online', { config: { presence: { key: myHash } } });
        ch.on('presence', { event: 'sync' }, () => {
            const n = Object.keys(ch.presenceState()).length;
            document.querySelectorAll('.online-count').forEach(el => { el.textContent = n; });
        }).subscribe(status => {
            if (status === 'SUBSCRIBED') ch.track({ at: Date.now() });
        });
    }

  
    window.openCreateRoomModal = openCreateRoomModal;
    window.closeCreateRoomModal = closeCreateRoomModal;
    window.createRoom = createRoom;
    window.joinRoom = joinRoom;
    window.closeChat = closeChat;
    window.sendChatMessage = sendChatMessage;
    window.fetchChatRooms = fetchChatRooms;

    document.addEventListener('DOMContentLoaded', () => {
        fetchChatRooms();
        initPresence();
        setInterval(() => { if (!document.hidden) fetchChatRooms(); }, 30000);

        const input = $('chat-input');
        if (input) input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
        const roomInput = $('room-title-input');
        if (roomInput) roomInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); createRoom(); }
        });
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (activeRoom) closeChat();
            else closeCreateRoomModal();
        });
    });
})();