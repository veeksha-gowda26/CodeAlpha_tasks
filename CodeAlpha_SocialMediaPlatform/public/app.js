const state = { user: null };
const $ = (selector) => document.querySelector(selector);
const authView = $('#authView');
const appView = $('#appView');

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function message(id, text = '') { $(id).textContent = text; }
function showToast(text) { const toast = $('#toast'); toast.textContent = text; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
function initials(username) { return (username || '?').charAt(0).toUpperCase(); }
function formatDate(date) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(`${date}Z`)); }
function setAvatar(id, username) { $(id).textContent = initials(username); }

async function loadSession() {
  try { const data = await api('/api/me'); state.user = data.user; showApp(); }
  catch { showAuth(); }
}
function showAuth() { authView.classList.remove('hidden'); appView.classList.add('hidden'); }
async function showApp() { authView.classList.add('hidden'); appView.classList.remove('hidden'); $('#navUsername').textContent = `@${state.user.username}`; setAvatar('#profileAvatar', state.user.username); setAvatar('#composerAvatar', state.user.username); renderProfile(state.user); await loadFeed(); }
function renderProfile(user) { $('#profileUsername').textContent = user.username; $('#profileBio').textContent = user.bio || 'Finding good things to share.'; $('#postCount').textContent = user.posts || 0; $('#followerCount').textContent = user.followers || 0; $('#followingCount').textContent = user.following || 0; }

function renderPost(post) {
  const comments = post.comments.map((comment) => `<div class="comment"><strong>${escapeHtml(comment.username)}</strong>${escapeHtml(comment.content)} <time>${formatDate(comment.createdAt)}</time></div>`).join('');
  return `<article class="post-card" data-post="${post.id}"><div class="post-head"><div class="avatar">${initials(post.username)}</div><div><strong>${escapeHtml(post.username)}</strong><time>${formatDate(post.createdAt)}</time></div></div><div class="post-content">${escapeHtml(post.content)}</div><div class="post-actions"><button class="action-button ${post.liked ? 'liked' : ''}" data-like="${post.id}">${post.liked ? '♥' : '♡'} <span>${post.likes}</span> likes</button><button class="action-button" data-comments="${post.id}">💬 <span>${post.comments.length}</span> comments</button></div><div class="comments">${comments}<form class="comment-form" data-comment-form="${post.id}"><input maxlength="280" required placeholder="Add a thoughtful comment..."><button type="submit">Post</button></form></div></article>`;
}
async function loadFeed() { const data = await api('/api/posts'); $('#feedList').innerHTML = data.posts.length ? data.posts.map(renderPost).join('') : '<div class="empty-state">No notes yet. Be the first to share something.</div>'; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }

async function submitAuth(form, endpoint, messageId) { message(messageId); try { const data = await api(endpoint, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); state.user = data.user; form.reset(); await showApp(); } catch (error) { message(messageId, error.message); } }
$('.auth-tabs').addEventListener('click', (event) => { const button = event.target.closest('[data-auth]'); if (!button) return; document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button)); $('#loginForm').classList.toggle('hidden', button.dataset.auth !== 'login'); $('#registerForm').classList.toggle('hidden', button.dataset.auth !== 'register'); });
$('#loginForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuth(event.target, '/api/login', '#loginMessage'); });
$('#registerForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuth(event.target, '/api/register', '#registerMessage'); });
$('#logoutButton').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); state.user = null; showAuth(); });
$('#refreshButton').addEventListener('click', loadFeed);
$('#postContent').addEventListener('input', (event) => { $('#charCount').textContent = `${event.target.value.length} / 500`; });
$('#postForm').addEventListener('submit', async (event) => { event.preventDefault(); message('#postMessage'); try { await api('/api/posts', { method: 'POST', body: JSON.stringify({ content: $('#postContent').value }) }); event.target.reset(); $('#charCount').textContent = '0 / 500'; await loadFeed(); } catch (error) { message('#postMessage', error.message); } });
$('#feedList').addEventListener('click', async (event) => { const button = event.target.closest('[data-like]'); if (!button) return; try { const data = await api(`/api/posts/${button.dataset.like}/like`, { method: 'POST' }); button.classList.toggle('liked', data.liked); button.innerHTML = `${data.liked ? '♥' : '♡'} <span>${data.likes}</span> likes`; } catch (error) { showToast(error.message); } });
$('#feedList').addEventListener('submit', async (event) => { const form = event.target.closest('[data-comment-form]'); if (!form) return; event.preventDefault(); try { await api(`/api/posts/${form.dataset.commentForm}/comments`, { method: 'POST', body: JSON.stringify({ content: form.querySelector('input').value }) }); await loadFeed(); } catch (error) { showToast(error.message); } });
let searchTimer;
$('#searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchUsers, 250); });
async function searchUsers() { const query = $('#searchInput').value.trim(); if (!query) { $('#searchResults').innerHTML = ''; return; } try { const data = await api(`/api/search?q=${encodeURIComponent(query)}`); $('#searchResults').innerHTML = data.users.length ? data.users.map((user) => `<div class="search-result"><div class="avatar">${initials(user.username)}</div><p>${escapeHtml(user.username)}<small>${escapeHtml(user.bio || 'No bio yet.')}</small></p><button class="follow-button" data-follow="${user.id}">Follow</button></div>`).join('') : '<p class="form-note">No users found.</p>'; data.users.forEach((user) => updateFollowButton(user)); } catch (error) { showToast(error.message); } }
function updateFollowButton(user) { const button = document.querySelector(`[data-follow="${user.id}"]`); if (!button) return; button.textContent = user.isFollowing ? 'Following' : 'Follow'; button.classList.toggle('following', user.isFollowing); }
$('#searchResults').addEventListener('click', async (event) => { const button = event.target.closest('[data-follow]'); if (!button) return; try { const data = await api(`/api/users/${button.dataset.follow}/follow`, { method: 'POST' }); button.textContent = data.following ? 'Following' : 'Follow'; button.classList.toggle('following', data.following); button.closest('.search-result').dataset.following = data.following; state.user = (await api('/api/me')).user; renderProfile(state.user); } catch (error) { showToast(error.message); } });
loadSession();
