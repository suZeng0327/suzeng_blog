// [요구사항 1, 2] increment 기능 임포트 추가
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc, query, orderBy, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ⚠️ 본인의 Firebase 구성 정보(Config)를 아래에 덮어씌우세요.
const firebaseConfig = {
    apiKey: "AIzaSyBrgybfKdZnE9AVg5rCvvAA4YU3mm_i_DI",
    authDomain: "suzengblog.firebaseapp.com",
    projectId: "suzengblog",
    storageBucket: "suzengblog.firebasestorage.app",
    messagingSenderId: "851038427795",
    appId: "1:851038427795:web:1ed3b8ebd27ba747514b66",
    measurementId: "G-W5H4E4YBFH"
};

// 앱 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 상태 변수 관리
let currentCategories = [];
let isAdmin = false;
let selectedCategory = null;
let currentPostId = null; // 수정 모드 판별용

// DOM 요소 래퍼 캐싱
const views = {
    home: document.getElementById('view-home'),
    detail: document.getElementById('view-detail'),
    write: document.getElementById('view-write')
};

// [요구사항 3] 전체 사이트 방문수 업데이트 함수 수정
async function updateVisitCount() {
    const visitRef = doc(db, "stats", "visits");
    try {
        // 방문수 카운트 1 증가 시도
        await updateDoc(visitRef, { count: increment(1) });
    } catch (e) {
        try {
            // 문서가 없거나 비로그인 차단 시 최초 생성 시도
            await setDoc(visitRef, { count: 1 });
        } catch (setErr) {
            console.error("방문수 업데이트 권한 제한됨:", setErr);
        }
    }
    
    // [요구사항 3] 업데이트 에러 여부와 관계없이 무조건 데이터를 읽어와 표시하도록 보장
    try {
        const snap = await getDoc(visitRef);
        if (snap.exists()) {
            const countElem = document.getElementById('site-visit-count');
            if (countElem) countElem.textContent = `사이트 방문수: ${snap.data().count}회`;
        }
    } catch (getErr) {
        console.error("방문수 데이터 불러오기 실패:", getErr);
    }
}

// 사이트 접속 시 방문수 카운트 실행
updateVisitCount();

// --- 화면 전환 로직 (SPA 구현) ---
function switchView(viewName) {
    Object.keys(views).forEach(key => {
        if (key === viewName) views[key].classList.remove('hidden');
        else views[key].classList.add('hidden');
    });
    window.scrollTo(0, 0);
}

// --- 권한별 UI 가시성 제어 ---
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

// Auth 관찰자 설정
onAuthStateChanged(auth, (user) => {
    if (user) toggleAdminUI(true);
    else toggleAdminUI(false);
    initBlog();
});

// --- 초기화 데이터 가져오기 ---
async function initBlog() {
    await loadCategories();
    await loadPosts();
}

// --- 카테고리 비즈니스 로직 ---
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

// --- 게시글 데이터 흐름 (조회/렌더링) ---
async function loadPosts() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const postListContainer = document.getElementById('post-list');
    postListContainer.innerHTML = '';

    let filteredCount = 0;
    querySnapshot.forEach((docSnap) => {
        const post = docSnap.data();
        const postId = docSnap.id;

        // 카테고리 필터링 조건 분기
        if (selectedCategory && post.categoryId !== selectedCategory) return;
        filteredCount++;

        // 첫 번째 텍스트 블록을 요약문(Preview)으로 발췌
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
            </div>
        `;
        card.addEventListener('click', () => showPostDetail(postId));
        postListContainer.appendChild(card);
    });

    if (filteredCount === 0) {
        postListContainer.innerHTML = '<p style="color:var(--text-muted);">등록된 게시글이 없습니다.</p>';
    }
}

// 상세 보기 전환 및 조회수 처리 수정
async function showPostDetail(postId) {
    const docRef = doc(db, "posts", postId);

    // [요구사항 1, 2] 개별 글 조회수 1 증가 시도 (비로그인 권한 에러가 나더라도 상세 페이지 이동이 막히지 않도록 완전히 분리)
    try {
        await updateDoc(docRef, { views: increment(1) });
    } catch (e) {
        console.error("조회수 증가 실패 (권한 없음 등):", e);
    }

    // [요구사항 1] 예외 처리로 감싸 에러 발생과 관계없이 글 내용 조회가 가능하도록 보장
    try {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return alert('존재하지 않는 게시글입니다.');

        const post = docSnap.data();
        currentPostId = postId;

        document.getElementById('detail-title').textContent = post.title;
        document.getElementById('detail-category').textContent = post.categoryName;
        document.getElementById('detail-date').textContent = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : '';

        // [요구사항 1] 화면에 조회수 텍스트 안전하게 렌더링
        const viewsCount = post.views || 0;
        document.getElementById('detail-views').textContent = `조회수: ${viewsCount}`;

        const contentContainer = document.getElementById('detail-content');
        contentContainer.innerHTML = '';

        // 블록 순회 정적 HTML 빌드
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
                // 복사 이벤트 바인딩
                wrapper.querySelector('.btn-copy').addEventListener('click', () => copyToClipboard(block.value, wrapper.querySelector('.btn-copy')));
                contentContainer.appendChild(wrapper);
            }
        });

        // Prism 문법 하이라이팅 유발 트리거
        Prism.highlightAll();
        switchView('detail');
    } catch (err) {
        alert('게시글을 불러오는 중 에러가 발생했습니다: ' + err.message);
    }
}

// --- 블록식 유연 에디터 코어 기능 ---
const editorBlocksContainer = document.getElementById('editor-blocks');

function createBlockElement(type, value = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'block-item';
    wrapper.dataset.type = type;

    let inputElement = '';
    if (type === 'text') {
        inputElement = `<textarea rows="4" placeholder="내용을 입력하세요">${value}</textarea>`;
    } else if (type === 'code') {
        inputElement = `<textarea rows="6" style="font-family:Consolas, monospace;" placeholder="// 코드를 입력하세요">${value}</textarea>`;
    }

    wrapper.innerHTML = `
        <button type="button" class="btn-remove-block">X</button>
        <span class="badge" style="background:#444; margin-bottom:5px; display:inline-block;">${type.toUpperCase()}</span>
        ${inputElement}
    `;

    wrapper.querySelector('.btn-remove-block').addEventListener('click', () => wrapper.remove());
    editorBlocksContainer.appendChild(wrapper);
}

// --- 이벤트 바인딩 리스너 모음 ---

// 에디터 제어 버튼
document.getElementById('btn-add-text-block').addEventListener('click', () => createBlockElement('text'));
document.getElementById('btn-add-code-block').addEventListener('click', () => createBlockElement('code'));

// 글쓰기 전환
document.getElementById('btn-write').addEventListener('click', () => {
    if (currentCategories.length === 0) return alert('카테고리를 최소 1개 이상 생성해야 글 작성이 활성화됩니다.');
    currentPostId = null;
    document.getElementById('post-form').reset();
    editorBlocksContainer.innerHTML = '';
    document.getElementById('write-view-title').textContent = "새 글 작성하기";
    createBlockElement('text'); // 기본 블록 배치
    switchView('write');
});

// 글 저장 프로세서 (생성 및 수정 분기제어)
document.getElementById('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoryId = document.getElementById('post-category').value;
    const title = document.getElementById('post-title').value;
    const categoryName = currentCategories.find(c => c.id === categoryId)?.name;

    const blockElements = editorBlocksContainer.querySelectorAll('.block-item');
    const blocks = [];
    blockElements.forEach(el => {
        const type = el.dataset.type;
        const value = el.querySelector('textarea').value;
        if (value.trim()) blocks.push({ type, value });
    });

    if (blocks.length === 0) return alert('최소 하나의 본문 블록 내용을 채워주세요.');

    const postData = {
        title, categoryId, categoryName, blocks,
        updatedAt: new Date()
    };

    try {
        if (currentPostId) {
            // 수정 시나리오
            await updateDoc(doc(db, "posts", currentPostId), postData);
            alert('성공적으로 수정되었습니다.');
        } else {
            // 새 글 생성 시나리오
            postData.createdAt = new Date();
            postData.views = 0; // [요구사항 1] 새 글 생성 시 조회수 초기화
            await addDoc(collection(db, "posts"), postData);
            alert('글이 정상적으로 등록되었습니다.');
        }
        switchView('home');
        initBlog();
    } catch (err) {
        alert('저장 중 에러가 발생했습니다: ' + err.message);
    }
});

// 수정 폼 진입
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

// 게시글 삭제
document.getElementById('btn-delete-post').addEventListener('click', async () => {
    if (!confirm('정말 이 게시글을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, "posts", currentPostId));
    alert('삭제되었습니다.');
    switchView('home');
    initBlog();
});

// 카테고 제어 스크립트 이벤트 위임 기법
document.getElementById('category-list').addEventListener('click', async (e) => {
    const target = e.target;
    const li = target.closest('li');
    if (!li) return;

    if (target.closest('.btn-edit-cat')) {
        e.stopPropagation();
        const newName = prompt('수정할 카테고리명을 입력하세요:', li.querySelector('span').textContent);
        if (newName) {
            await updateDoc(doc(db, "categories", li.dataset.id), { name: newName });
            initBlog();
        }
        return;
    }

    if (target.closest('.btn-delete-cat')) {
        e.stopPropagation();
        if (confirm('카테고리를 삭제하면 하위 글과의 매핑이 해제됩니다. 정말 삭제하시겠습니까?')) {
            await deleteDoc(doc(db, "categories", li.dataset.id));
            selectedCategory = null;
            initBlog();
        }
        return;
    }

    // 필터 처리 선택
    if (li.id === 'cat-all') selectedCategory = null;
    else selectedCategory = li.dataset.id;

    document.getElementById('current-category-title').textContent = li.querySelector('span')?.textContent || '모든 글 보기';
    renderCategories();
    loadPosts();
});

// 신규 카테고리 삽입
document.getElementById('btn-add-category').addEventListener('click', async () => {
    const catName = prompt('새로운 카테고리 이름을 입력해 주세요:');
    if (!catName) return;
    await addDoc(collection(db, "categories"), { name: catName });
    initBlog();
});

// --- 유틸리티성 순수 함수 구성 ---
function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function copyToClipboard(text, buttonEl) {
    navigator.clipboard.writeText(text).then(() => {
        buttonEl.textContent = '복사 완료!';
        setTimeout(() => buttonEl.textContent = '복사', 2000);
    });
}

// 네비게이션 제어 바인딩 수정
document.getElementById('logo').addEventListener('click', () => {
    selectedCategory = null;
    document.getElementById('current-category-title').textContent = '모든 글 보기';
    switchView('home');
    initBlog();
});
const backButtons = document.querySelectorAll('.btn-back');
backButtons.forEach(btn => btn.addEventListener('click', () => switchView('home')));

// --- 인증 모달 및 제어 로직 ---
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
    } catch (err) {
        alert('인증 실패: ' + err.message);
    }
});

document.getElementById('btn-logout-nav').addEventListener('click', () => {
    signOut(auth).then(() => alert('로그아웃 되었습니다.'));
});