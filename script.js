import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc, query, orderBy, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBrgybfKdZnE9AVg5rCvvAA4YU3mm_i_DI",
    authDomain: "suzengblog.firebaseapp.com",
    projectId: "suzengblog",
    storageBucket: "suzengblog.firebasestorage.app",
    messagingSenderId: "851038427795",
    appId: "1:851038427795:web:1ed3b8ebd27ba747514b66",
    measurementId: "G-W5H4E4YBFH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentCategories = [];
let isAdmin = false;
let selectedCategory = null;
let currentPostId = null;
let currentSortMode = 'latest'; // 정렬 상태 변수

const views = {
    home: document.getElementById('view-home'),
    detail: document.getElementById('view-detail'),
    write: document.getElementById('view-write')
};

// [방문수] 규칙과 필드명(count) 일치
async function updateVisitCount() {
    const visitRef = doc(db, "stats", "visits");
    try {
        await updateDoc(visitRef, { count: increment(1) });
    } catch (e) {
        try {
            await setDoc(visitRef, { count: 1 });
        } catch (setErr) {
            console.error("방문수 업데이트 권한 제한:", setErr);
        }
    }

    try {
        const snap = await getDoc(visitRef);
        if (snap.exists()) {
            const countElem = document.getElementById('site-visit-count');
            if (countElem) countElem.textContent = `사이트 방문수: ${snap.data().count || 0}회`;
        }
    } catch (getErr) {
        console.error("데이터 로드 실패:", getErr);
    }
}

updateVisitCount();

function switchView(viewName) {
    Object.keys(views).forEach(key => {
        if (key === viewName) views[key].classList.remove('hidden');
        else views[key].classList.add('hidden');
    });
    window.scrollTo(0, 0);
}

function toggleAdminUI(isAuth) {
    isAdmin = isAuth;
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (isAuth) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    if (isAuth) {
        document.getElementById('btn-login-nav').classList.add('hidden');
        document.getElementById('btn-logout-nav').classList.remove('hidden');
    } else {
        document.getElementById('btn-login-nav').classList.remove('hidden');
        document.getElementById('btn-logout-nav').classList.add('hidden');
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) toggleAdminUI(true);
    else toggleAdminUI(false);
    initBlog();
});

async function initBlog() {
    await loadCategories();
    await loadPosts();
}

async function loadCategories() {
    const q = query(collection(db, "categories"), orderBy("name"));
    const querySnapshot = await getDocs(q);
    currentCategories = [];
    querySnapshot.forEach((doc) => {
        currentCategories.push({ id: doc.id, ...doc.data() });
    });
    renderCategories();
    updateCategoryDropdown();
}

function renderCategories() {
    const listContainer = document.getElementById('category-list');
    listContainer.innerHTML = `<li class="${!selectedCategory ? 'active' : ''}" id="cat-all">모든 글 보기</li>`;

    currentCategories.forEach(cat => {
        const li = document.createElement('li');
        li.className = selectedCategory === cat.id ? 'active' : '';
        li.dataset.id = cat.id;
        li.innerHTML = `
            <span>${cat.name}</span>
            <div class="admin-only ${isAdmin ? '' : 'hidden'}">
                <button class="btn-icon btn-edit-cat"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon delete btn-delete-cat"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        listContainer.appendChild(li);
    });
}

function updateCategoryDropdown() {
    const select = document.getElementById('post-category');
    select.innerHTML = '<option value="" disabled selected>선택해 주세요</option>';
    currentCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
}

// [정렬 기능 통합] 정렬 모드에 따른 쿼리
async function loadPosts() {
    const sortField = currentSortMode === 'popular' ? 'views' : 'createdAt';
    const q = query(collection(db, "posts"), orderBy(sortField, "desc"));
    const querySnapshot = await getDocs(q);
    const postListContainer = document.getElementById('post-list');
    postListContainer.innerHTML = '';

    let filteredCount = 0;
    querySnapshot.forEach((docSnap) => {
        const post = docSnap.data();
        const postId = docSnap.id;

        if (selectedCategory && post.categoryId !== selectedCategory) return;
        filteredCount++;

        const firstTextBlock = post.blocks.find(b => b.type === 'text');
        const summary = firstTextBlock ? firstTextBlock.value.substring(0, 120) + '...' : '내용 없음';
        const dateStr = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : '';

        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `
            <h3>${post.title}</h3>
            <p>${summary}</p>
            <div class="meta">
                <span class="badge">${post.categoryName}</span>
                <span>${dateStr}</span>
                <span style="margin-left: auto;">조회수: ${post.views || 0}</span>
            </div>
        `;
        card.addEventListener('click', () => showPostDetail(postId));
        postListContainer.appendChild(card);
    });

    if (filteredCount === 0) {
        postListContainer.innerHTML = '<p style="color:var(--text-muted);">등록된 게시글이 없습니다.</p>';
    }
}

async function showPostDetail(postId) {
    const docRef = doc(db, "posts", postId);

    try {
        await updateDoc(docRef, { views: increment(1) });
    } catch (e) {
        console.error("조회수 증가 실패:", e);
    }

    try {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return alert('존재하지 않는 게시글입니다.');

        const post = docSnap.data();
        currentPostId = postId;

        document.getElementById('detail-title').textContent = post.title;
        document.getElementById('detail-category').textContent = post.categoryName;
        document.getElementById('detail-date').textContent = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : '';
        document.getElementById('detail-views').textContent = `조회수: ${(post.views || 0) + 1}`; // 실시간 반영

        const contentContainer = document.getElementById('detail-content');
        contentContainer.innerHTML = '';

        post.blocks.forEach(block => {
            if (block.type === 'text') {
                const p = document.createElement('p');
                p.textContent = block.value;
                contentContainer.appendChild(p);
            } else if (block.type === 'code') {
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                wrapper.innerHTML = `
                    <button class="btn-copy">복사</button>
                    <pre class="language-javascript"><code class="language-javascript">${escapeHtml(block.value)}</code></pre>
                `;
                wrapper.querySelector('.btn-copy').addEventListener('click', () => copyToClipboard(block.value, wrapper.querySelector('.btn-copy')));
                contentContainer.appendChild(wrapper);
            } else if (block.type === 'image') {
                const img = document.createElement('img');
                img.src = block.value;
                contentContainer.appendChild(img);
            }
        });
        Prism.highlightAll();
        switchView('detail');
    } catch (err) {
        alert('에러 발생: ' + err.message);
    }
}

const editorBlocksContainer = document.getElementById('editor-blocks');
function createBlockElement(type, value = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'block-item';
    wrapper.dataset.type = type;

    if (type === 'image') {
        wrapper.innerHTML = `
            <button type="button" class="btn-remove-block">X</button>
            <span class="badge" style="background:#444; margin-bottom:5px; display:inline-block;">${type.toUpperCase()}</span>
            <div class="image-dropzone" style="border: 2px dashed var(--border-color); padding: 20px; text-align: center; border-radius: 6px; cursor: pointer;">
                <p class="dropzone-text" style="color: var(--text-muted); margin: 0;">사진을 드래그하거나 클릭하여 선택하세요</p>
                <input type="file" accept="image/*" style="display: none;">
                <img src="${value}" style="max-width: 100%; height: auto; margin-top: 10px; ${value ? '' : 'display: none;'}">
            </div>
            <input type="hidden" class="image-data" value="${value}">
        `;

        const dropzone = wrapper.querySelector('.image-dropzone');
        const fileInput = wrapper.querySelector('input[type="file"]');
        const imgPreview = wrapper.querySelector('img');
        const hiddenInput = wrapper.querySelector('.image-data');
        const dropzoneText = wrapper.querySelector('.dropzone-text');

        dropzone.addEventListener('click', () => fileInput.click());

        const handleFile = (file) => {
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imgPreview.src = e.target.result;
                    imgPreview.style.display = 'block';
                    hiddenInput.value = e.target.result;
                    dropzoneText.textContent = '사진이 선택되었습니다 (클릭하여 변경)';
                };
                reader.readAsDataURL(file);
            }
        };

        fileInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--accent-color)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'var(--border-color)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border-color)';
            handleFile(e.dataTransfer.files[0]);
        });

        if (value) {
            dropzoneText.textContent = '사진이 선택되었습니다 (클릭하여 변경)';
        }
    } else {
        wrapper.innerHTML = `
            <button type="button" class="btn-remove-block">X</button>
            <span class="badge" style="background:#444; margin-bottom:5px; display:inline-block;">${type.toUpperCase()}</span>
            <textarea rows="${type === 'text' ? 4 : 6}" style="${type === 'code' ? 'font-family:Consolas, monospace;' : ''}" placeholder="${type === 'text' ? '내용을 입력하세요' : '// 코드를 입력하세요'}">${value}</textarea>
        `;
    }

    wrapper.querySelector('.btn-remove-block').addEventListener('click', () => wrapper.remove());
    editorBlocksContainer.appendChild(wrapper);
}

document.getElementById('btn-add-text-block').addEventListener('click', () => createBlockElement('text'));
document.getElementById('btn-add-code-block').addEventListener('click', () => createBlockElement('code'));
document.getElementById('btn-add-image-block').addEventListener('click', () => createBlockElement('image'));

// 정렬 버튼 이벤트
document.getElementById('btn-sort-latest').addEventListener('click', () => {
    currentSortMode = 'latest';
    document.getElementById('btn-sort-latest').className = 'btn btn-primary';
    document.getElementById('btn-sort-popular').className = 'btn btn-secondary';
    loadPosts();
});

document.getElementById('btn-sort-popular').addEventListener('click', () => {
    currentSortMode = 'popular';
    document.getElementById('btn-sort-popular').className = 'btn btn-primary';
    document.getElementById('btn-sort-latest').className = 'btn btn-secondary';
    loadPosts();
});

// 로고 클릭 시 초기화
document.getElementById('logo').addEventListener('click', () => {
    selectedCategory = null;
    currentSortMode = 'latest';
    document.getElementById('btn-sort-latest').className = 'btn btn-primary';
    document.getElementById('btn-sort-popular').className = 'btn btn-secondary';
    document.getElementById('current-category-title').textContent = '모든 글 보기';
    switchView('home');
    initBlog();
});

// 카테고리 클릭 시 초기화 로직 및 수정/삭제 기능
document.getElementById('category-list').addEventListener('click', async (e) => {
    const li = e.target.closest('li');
    if (!li) return;

    // [추가] 카테고리 수정 기능
    if (e.target.closest('.btn-edit-cat')) {
        e.stopPropagation();
        const catId = li.dataset.id;
        const currentName = currentCategories.find(c => c.id === catId)?.name;
        const newName = prompt('카테고리 이름을 수정하세요:', currentName);
        if (newName && newName !== currentName) {
            await updateDoc(doc(db, "categories", catId), { name: newName });
            initBlog();
        }
        return;
    }

    // [추가] 카테고리 삭제 기능
    if (e.target.closest('.btn-delete-cat')) {
        e.stopPropagation();
        if (!confirm('정말 삭제하시겠습니까? 이 카테고리에 포함된 글은 카테고리 정보가 사라집니다.')) return;
        const catId = li.dataset.id;
        await deleteDoc(doc(db, "categories", catId));
        if (selectedCategory === catId) {
            selectedCategory = null;
            document.getElementById('current-category-title').textContent = '모든 글 보기';
        }
        initBlog();
        return;
    }

    // 기본 카테고리 선택 로직
    if (li.id === 'cat-all') selectedCategory = null;
    else selectedCategory = li.dataset.id;

    currentSortMode = 'latest';
    document.getElementById('btn-sort-latest').className = 'btn btn-primary';
    document.getElementById('btn-sort-popular').className = 'btn btn-secondary';

    document.getElementById('current-category-title').textContent = li.querySelector('span')?.textContent || '모든 글 보기';
    renderCategories();
    loadPosts();
});

document.getElementById('btn-write').addEventListener('click', () => {
    if (currentCategories.length === 0) return alert('카테고리를 최소 1개 이상 생성해야 글 작성이 활성화됩니다.');
    currentPostId = null;
    document.getElementById('post-form').reset();
    editorBlocksContainer.innerHTML = '';
    document.getElementById('write-view-title').textContent = "새 글 작성하기";
    createBlockElement('text');
    switchView('write');
});

document.getElementById('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoryId = document.getElementById('post-category').value;
    const title = document.getElementById('post-title').value;
    const categoryName = currentCategories.find(c => c.id === categoryId)?.name;
    const blockElements = editorBlocksContainer.querySelectorAll('.block-item');
    const blocks = [];

    blockElements.forEach(el => {
        const type = el.dataset.type;
        let value = '';
        if (type === 'image') {
            value = el.querySelector('.image-data').value;
        } else {
            value = el.querySelector('textarea').value;
        }
        if (value.trim()) blocks.push({ type, value });
    });

    if (blocks.length === 0) return alert('최소 하나의 본문 블록 내용을 채워주세요.');
    const postData = { title, categoryId, categoryName, blocks, updatedAt: new Date() };
    try {
        if (currentPostId) {
            await updateDoc(doc(db, "posts", currentPostId), postData);
            alert('성공적으로 수정되었습니다.');
        } else {
            postData.createdAt = new Date();
            postData.views = 0;
            await addDoc(collection(db, "posts"), postData);
            alert('글이 정상적으로 등록되었습니다.');
        }
        switchView('home');
        initBlog();
    } catch (err) { alert('저장 중 에러 발생: ' + err.message); }
});

document.getElementById('btn-edit-post').addEventListener('click', async () => {
    const docRef = doc(db, "posts", currentPostId);
    const docSnap = await getDoc(docRef);
    const post = docSnap.data();
    document.getElementById('write-view-title').textContent = "글 수정하기";
    document.getElementById('post-category').value = post.categoryId;
    document.getElementById('post-title').value = post.title;
    editorBlocksContainer.innerHTML = '';
    post.blocks.forEach(b => createBlockElement(b.type, b.value));
    switchView('write');
});

document.getElementById('btn-delete-post').addEventListener('click', async () => {
    if (!confirm('정말 이 게시글을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, "posts", currentPostId));
    alert('삭제되었습니다.');
    switchView('home');
    initBlog();
});

document.getElementById('btn-add-category').addEventListener('click', async () => {
    const catName = prompt('새로운 카테고리 이름을 입력해 주세요:');
    if (!catName) return;
    await addDoc(collection(db, "categories"), { name: catName });
    initBlog();
});

function escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function copyToClipboard(text, buttonEl) {
    navigator.clipboard.writeText(text).then(() => {
        buttonEl.textContent = '복사 완료!';
        setTimeout(() => buttonEl.textContent = '복사', 2000);
    });
}
const backButtons = document.querySelectorAll('.btn-back');
backButtons.forEach(btn => btn.addEventListener('click', () => switchView('home')));
const modal = document.getElementById('login-modal');
document.getElementById('btn-login-nav').addEventListener('click', () => modal.classList.remove('hidden'));
document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        modal.classList.add('hidden');
        document.getElementById('login-form').reset();
    } catch (err) { alert('인증 실패: ' + err.message); }
});
document.getElementById('btn-logout-nav').addEventListener('click', () => { signOut(auth).then(() => alert('로그아웃 되었습니다.')); });