'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
	createLolWikiClient,
	normalizeListPost,
	normalizeDetailPost,
	normalizeComment,
	normalizeUser,
	constants
} = require('../../src/server/services/lolwiki/lolwiki-api')

const samplePost = {
	post_seq: 8526228,
	title: '게시글',
	body: '본문',
	author: '작성자',
	author_id: 'user-key',
	author_stack_count: 4410,
	created_at: '2026-07-21T20:59:37',
	likes: 2,
	views: 10,
	comments: 1,
	avatar_url: 'https://img.lolwiki.kr/i/avatar/thumb',
	image_urls: ['https://img.lolwiki.kr/i/image/resize']
}

function unauthorized(message = 'unauthorized') {
	const error = new Error(message)
	error.statusCode = 401
	return error
}

function fakeSocket() {
	const handlers = new Map()
	const emissions = []
	return {
		handlers,
		emissions,
		on(name, handler) {
			handlers.set(name, handler)
		},
		emit(name, payload) {
			emissions.push({ name, payload })
		}
	}
}

function browserAuth(client, source, socket = fakeSocket()) {
	return { auth: client.socketAuth(socket, source), socket }
}

test('current API responses normalize to the legacy browser view model without legacy identity', () => {
	const list = normalizeListPost(samplePost)
	assert.equal(list.post_seq, '8526228')
	assert.equal(list.post_title, '게시글')
	assert.equal(list.reply_cnt, 1)
	assert.deepEqual(list.image_urls, samplePost.image_urls)

	const detail = normalizeDetailPost(samplePost, { local_user_key: 'user-key' })
	assert.equal(detail.post_text, '본문')
	assert.equal(detail.my_post, '1')

	const comment = normalizeComment({ comment_seq: 3, body: '댓글', is_mine: true })
	assert.equal(comment.reply_seq, '3')
	assert.equal(comment.reply_title, '댓글')
	assert.equal(comment.my_post, 1)

	const user = normalizeUser({
		local_user_key: 'modern-user-key',
		nickname: '사용자',
		stack_count: 123
	}, 'fallback-key')
	assert.equal(user.local_user_key, 'modern-user-key')
	assert.equal(user.android_id, 'modern-user-key')
	assert.equal(user.point, 123)
})

test('account ID/password login stores returned tokens in the browser auth object and reads /users/me', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/users/login'))
			return { auth: { access_token: 'access-1', refresh_token: 'refresh-1' } }
		if(options.uri.endsWith('/users/me'))
			return { user: { local_user_key: 'user-1', nickname: '로그인 사용자' } }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const source = { account_id: 'account1', password: 'password1', device_id: 'browser-1' }
	const { auth, socket } = browserAuth(client, source)

	const result = await client.loginSession(auth)

	assert.deepEqual(calls.map(call => call.uri), [
		`${constants.API_BASE_URL}/users/login`,
		`${constants.API_BASE_URL}/users/me`
	])
	assert.deepEqual(calls[0].body, { account_id: 'account1', password: 'password1' })
	assert.equal(calls[0].headers['X-Device-ID'], 'browser-1')
	assert.equal(calls[1].headers.Authorization, 'Bearer access-1')
	assert.equal(result.user.local_user_key, 'user-1')
	assert.equal(result.auth.access_token, 'access-1')
	assert.equal(source.access_token, 'access-1')
	assert.equal(source.refresh_token, 'refresh-1')
	assert.equal(source.user_key, 'user-1')
	assert.ok(socket.emissions.some(event => event.name === 'lol_api_tokens'))
})

test('a valid browser access token restores the session without logging in again', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		return { user: { local_user_key: 'user-2', nickname: '복원 사용자' } }
	})
	const { auth } = browserAuth(client, {
		account_id: 'account2',
		password: 'password2',
		access_token: 'valid-access',
		refresh_token: 'valid-refresh',
		device_id: 'browser-2'
	})

	const result = await client.restoreSession(auth)

	assert.equal(calls.length, 1)
	assert.equal(calls[0].uri, `${constants.API_BASE_URL}/users/me`)
	assert.equal(calls[0].headers.Authorization, 'Bearer valid-access')
	assert.equal(result.user.local_user_key, 'user-2')
})

test('an expired access token refreshes from the browser refresh token and retries once', async () => {
	const calls = []
	let voteAttempts = 0
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/auth/refresh'))
			return { auth: { access_token: 'refreshed-access', refresh_token: 'refreshed-refresh' } }
		if(options.uri.endsWith('/vote')) {
			voteAttempts++
			if(voteAttempts === 1)
				throw unauthorized()
			return { status: 'OK', vote: 'up' }
		}
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const source = {
		account_id: 'account3',
		password: 'password3',
		access_token: 'expired-access',
		refresh_token: 'refresh-3',
		device_id: 'browser-3',
		user_key: 'user-3'
	}
	const { auth, socket } = browserAuth(client, source)

	assert.equal((await client.votePost('10', 'user-3', auth)).ok, true)
	assert.equal(voteAttempts, 2)
	assert.equal(calls[1].uri, `${constants.API_BASE_URL}/auth/refresh`)
	assert.deepEqual(calls[1].body, { refresh_token: 'refresh-3', device_id: 'browser-3' })
	assert.equal(calls[2].headers.Authorization, 'Bearer refreshed-access')
	assert.equal(source.access_token, 'refreshed-access')
	assert.equal(source.refresh_token, 'refreshed-refresh')
	assert.ok(socket.emissions.some(event => event.name === 'lol_api_tokens' && event.payload.access_token === 'refreshed-access'))
})

test('refresh failure automatically logs in with browser-stored ID/password and retries the request', async () => {
	const calls = []
	let voteAttempts = 0
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/auth/refresh'))
			throw unauthorized('refresh expired')
		if(options.uri.endsWith('/users/login'))
			return { auth: { access_token: 'relogin-access', refresh_token: 'relogin-refresh' } }
		if(options.uri.endsWith('/vote')) {
			voteAttempts++
			if(voteAttempts === 1)
				throw unauthorized('access expired')
			return { status: 'OK', vote_state: 'up' }
		}
		if(options.uri.endsWith('/legacy-read-compat/post'))
			return { status: 'OK', post: { post_seq: 20, likes: 3, vote: 'up' } }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const source = {
		account_id: 'saved-account',
		password: 'saved-password',
		access_token: 'expired-access',
		refresh_token: 'expired-refresh',
		device_id: 'browser-4',
		user_key: 'user-4'
	}
	const { auth } = browserAuth(client, source)

	assert.deepEqual(await client.votePost('20', 'user-4', auth), { ok: true, vote: 'up', likes: 3, post_seq: '20' })
	assert.deepEqual(calls.map(call => call.uri), [
		`${constants.API_BASE_URL}/board/legacy-write/posts/20/vote`,
		`${constants.API_BASE_URL}/auth/refresh`,
		`${constants.API_BASE_URL}/users/login`,
		`${constants.API_BASE_URL}/board/legacy-write/posts/20/vote`,
		`${constants.API_BASE_URL}/legacy-read-compat/post` // 투표 뒤 실제 추천 수·내 표 상태 재조회
	])
	assert.deepEqual(calls[2].body, { account_id: 'saved-account', password: 'saved-password' })
	assert.equal(calls[3].headers.Authorization, 'Bearer relogin-access')
	assert.equal(source.access_token, 'relogin-access')
	assert.equal(source.refresh_token, 'relogin-refresh')
})

test('authenticated writes reject missing browser auth before any external request', async () => {
	let requestCount = 0
	const client = createLolWikiClient(async () => {
		requestCount++
		return {}
	})

	await assert.rejects(
		client.writeReply('10', 'user-1', '댓글', 'image-data', null),
		error => error.code === 'LOLWIKI_AUTH_FAILED'
	)
	assert.equal(requestCount, 0)
})

test('authentication is stateless between browsers and uses each request token', async () => {
	const authorizationHeaders = []
	const client = createLolWikiClient(async options => {
		authorizationHeaders.push(options.headers.Authorization)
		return { status: 'OK', vote: 'up' }
	})
	const first = browserAuth(client, {
		access_token: 'browser-a-token',
		device_id: 'browser-a',
		user_key: 'user-a'
	}).auth
	const second = browserAuth(client, {
		access_token: 'browser-b-token',
		device_id: 'browser-b',
		user_key: 'user-b'
	}).auth

	await client.votePost('11', 'user-a', first)
	await client.votePost('12', 'user-b', second)

	// 투표마다 vote + 상세 재조회 두 번 요청
	assert.deepEqual(authorizationHeaders, ['Bearer browser-a-token', 'Bearer browser-a-token', 'Bearer browser-b-token', 'Bearer browser-b-token'])
})

test('current-user retrieval uses only the latest /users/me API', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		return { user: { local_user_key: 'user-5', nickname: '현재 사용자' } }
	})
	const { auth } = browserAuth(client, { access_token: 'access-5', device_id: 'browser-5' })

	const user = await client.getUserInfo(auth)

	assert.equal(user.local_user_key, 'user-5')
	assert.deepEqual(calls.map(call => call.uri), [`${constants.API_BASE_URL}/users/me`])
	assert.equal(calls.some(call => call.uri.includes('legacy-identity')), false)
})

test('logout revokes the browser access token with the current logout API', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		return { status: 'OK' }
	})
	const source = {
		access_token: 'logout-access',
		refresh_token: 'logout-refresh',
		device_id: 'browser-6'
	}
	const { auth } = browserAuth(client, source)

	await client.logout(auth)

	assert.equal(calls[0].uri, `${constants.API_BASE_URL}/auth/logout`)
	assert.equal(calls[0].method, 'POST')
	assert.equal(calls[0].headers.Authorization, 'Bearer logout-access')
	assert.deepEqual(calls[0].body, { all_devices: false })
	assert.equal(auth.accessToken, '')
	assert.equal(auth.refreshToken, '')
})

test('article list uses the authenticated viewer key and current block API', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/legacy-read-compat/posts'))
			return { results: [samplePost], has_more: false }
		if(options.uri.endsWith('/blocks'))
			return { results: [] }
		if(options.uri.endsWith('/memos'))
			return { results: [], unread_count: 0 }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, {
		access_token: 'list-access',
		device_id: 'browser-7',
		user_key: 'viewer-7'
	})

	const posts = await client.getArticleList(fakeSocket(), 'viewer-7', 0, 30, '', '', false, false, auth)
	await new Promise(resolve => setImmediate(resolve))

	assert.equal(posts.length, 1)
	const listCall = calls.find(call => call.uri.endsWith('/legacy-read-compat/posts'))
	const blocksCall = calls.find(call => call.uri.endsWith('/blocks'))
	assert.equal(listCall.qs.viewer_id, 'viewer-7')
	assert.equal(listCall.headers.Authorization, 'Bearer list-access')
	assert.equal(blocksCall.qs.local_user_key, 'viewer-7')
	assert.equal(calls.some(call => call.uri.includes('legacy-identity')), false)
})

test('article list stays anonymous when only saved identity fields remain', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/legacy-read-compat/posts') && !options.headers.Authorization && !options.qs.viewer_id)
			return { results: [samplePost], has_more: false }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, {
		account_id: 'saved-account-without-session',
		device_id: 'browser-public-list',
		user_key: 'stale-viewer-key'
	})

	const posts = await client.getArticleList(fakeSocket(), constants.GUEST_DEVICE_ID, 0, 30, '', '', false, false, auth)

	assert.equal(posts.length, 1)
	assert.deepEqual(calls.map(call => call.uri), [
		`${constants.API_BASE_URL}/legacy-read-compat/posts`
	])
	assert.equal(calls[0].headers.Authorization, undefined)
	assert.equal(calls[0].qs.viewer_id, undefined)
})

test('article list falls back to a public request when session recovery returns 401', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/users/me'))
			throw unauthorized('AUTH_REQUIRED')
		if(options.uri.endsWith('/legacy-read-compat/posts'))
			return { results: [samplePost], has_more: false }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, {
		access_token: 'expired-list-token',
		device_id: 'browser-expired-list'
	})

	const posts = await client.getArticleList(fakeSocket(), constants.GUEST_DEVICE_ID, 0, 30, '', '', false, false, auth)

	assert.equal(posts.length, 1)
	assert.deepEqual(calls.map(call => call.uri), [
		`${constants.API_BASE_URL}/users/me`,
		`${constants.API_BASE_URL}/legacy-read-compat/posts`
	])
	assert.equal(calls[0].headers.Authorization, 'Bearer expired-list-token')
	assert.equal(calls[1].headers.Authorization, undefined)
})

test('article list retries without stored viewer auth when the posts API returns 401', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(!options.uri.endsWith('/legacy-read-compat/posts'))
			throw new Error(`unexpected request: ${options.uri}`)
		if(options.headers.Authorization)
			throw unauthorized('AUTH_REQUIRED')
		return { results: [samplePost], has_more: false }
	})
	const { auth } = browserAuth(client, {
		access_token: 'expired-stored-viewer-token',
		device_id: 'browser-stored-viewer',
		user_key: 'stored-viewer-key'
	})

	const posts = await client.getArticleList(fakeSocket(), 'stored-viewer-key', 0, 30, '', '', false, false, auth)

	assert.equal(posts.length, 1)
	assert.equal(calls.length, 2)
	assert.equal(calls[0].headers.Authorization, 'Bearer expired-stored-viewer-token')
	assert.equal(calls[0].qs.viewer_id, 'stored-viewer-key')
	assert.equal(calls[1].headers.Authorization, undefined)
	assert.equal(calls[1].qs.viewer_id, undefined)
})

test('mine article list reports authentication failure without downgrading to a public request', async () => {
	const calls = []
	const socket = fakeSocket()
	const client = createLolWikiClient(async options => {
		calls.push(options)
		throw unauthorized('AUTH_REQUIRED')
	})
	const { auth } = browserAuth(client, {
		access_token: 'expired-mine-token',
		device_id: 'browser-mine',
		user_key: 'mine-viewer-key'
	})

	const posts = await client.getArticleList(socket, 'mine-viewer-key', 0, 30, '', '', false, true, auth)

	assert.deepEqual(posts, [])
	assert.equal(calls.length, 1)
	assert.equal(calls[0].headers.Authorization, 'Bearer expired-mine-token')
	const errorEvent = socket.emissions.find(event => event.name === 'lol_api_error')
	assert.equal(errorEvent.payload.code, 'LOLWIKI_REAUTH_REQUIRED')
	assert.equal(errorEvent.payload.status_code, 401)
})

// 닉네임 우클릭 → 그 유저 글 보기. API 의 mode=mine 은 author_id 를 무시하므로 mode=latest + author_id 여야 한다.
function listClient(calls) {
	return createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/legacy-read-compat/posts'))
			return { results: [samplePost], has_more: false }
		if(options.uri.endsWith('/blocks'))
			return { results: [] }
		if(options.uri.endsWith('/memos'))
			return { results: [], unread_count: 0 }
		throw new Error(`unexpected request: ${options.uri}`)
	})
}

test('guest can list another author\'s posts with mode=latest and author_id', async () => {
	const calls = []
	const client = listClient(calls)
	const posts = await client.getArticleList(fakeSocket(), 'author-key-9', 0, 30, '', '', false, true, null)
	const listCall = calls.find(call => call.uri.endsWith('/legacy-read-compat/posts'))
	assert.equal(posts.length, 1)
	assert.equal(listCall.qs.mode, 'latest')
	assert.equal(listCall.qs.author_id, 'author-key-9')
})

test('logged-in viewer listing another author still uses mode=latest', async () => {
	const calls = []
	const client = listClient(calls)
	const { auth } = browserAuth(client, { access_token: 'acc', device_id: 'browser-x', user_key: 'viewer-1' })
	await client.getArticleList(fakeSocket(), 'author-key-9', 0, 30, '', '', false, true, auth)
	const listCall = calls.find(call => call.uri.endsWith('/legacy-read-compat/posts'))
	assert.equal(listCall.qs.mode, 'latest')
	assert.equal(listCall.qs.author_id, 'author-key-9')
})

test('viewer listing own posts keeps mode=mine', async () => {
	const calls = []
	const client = listClient(calls)
	const { auth } = browserAuth(client, { access_token: 'acc', device_id: 'browser-x', user_key: 'viewer-1' })
	await client.getArticleList(fakeSocket(), 'viewer-1', 0, 30, '', '', false, true, auth)
	const listCall = calls.find(call => call.uri.endsWith('/legacy-read-compat/posts'))
	assert.equal(listCall.qs.mode, 'mine')
	assert.equal(listCall.qs.author_id, 'viewer-1')
})

test('image upload stays unauthenticated and uses the browser device identifier', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		return { data: { id: 'image-1' } }
	})

	const uploaded = await client.uploadImage(Buffer.from('image'), 'browser-8', 'jpg')

	assert.deepEqual(uploaded, { id: 'image-1', format: 'jpg', byteSize: 5 }) // byteSize: 글 첨부(attachments)에 필수
	assert.equal(calls[0].uri, constants.IMAGE_UPLOAD_URL)
	assert.equal(calls[0].headers['X-Device-ID'], 'browser-8')
	assert.equal(calls[0].headers.Authorization, undefined)
	assert.ok(Buffer.isBuffer(calls[0].formData.image.value))
})

test('socket auth handlers return login results and token updates to the same browser', async () => {
	const socket = fakeSocket()
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/users/login'))
			return { auth: { access_token: 'socket-access', refresh_token: 'socket-refresh' } }
		if(options.uri.endsWith('/users/me'))
			return { user: { local_user_key: 'socket-user', nickname: '소켓 사용자' } }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	client.attachSocket(socket)

	assert.ok(socket.handlers.has('lol_api_login'))
	assert.ok(socket.handlers.has('lol_api_restore'))
	assert.ok(socket.handlers.has('lol_api_logout'))
	await socket.handlers.get('lol_api_login')({
		auth: { account_id: 'socket-account', password: 'socket-password', device_id: 'socket-device' }
	})

	const loginResult = socket.emissions.find(event => event.name === 'lol_api_login')
	assert.equal(loginResult.payload.user.local_user_key, 'socket-user')
	assert.ok(socket.emissions.some(event => event.name === 'lol_api_tokens' && event.payload.access_token === 'socket-access'))
})

test('server passes browser auth per request and contains no server-side legacy login cache', () => {
	const source = fs.readFileSync(path.join(__dirname, '../../src/server/legacy/lolwiki-handlers.ts'), 'utf8')
	assert.match(source, /lolwiki\.attachSocket\(socket\)/)
	assert.match(source, /lolwiki\.socketAuth\(socket, data\.auth\)/)
	assert.doesNotMatch(source, /g_lol_auth_dic|lol_auth_request|lol_login_instantly/)
})

test('browser code owns ID/password/tokens and attaches them to community requests', () => {
	const lolSource = fs.readFileSync(path.join(__dirname, '../../public/static/index_lol.js'), 'utf8')
	const socketSource = fs.readFileSync(path.join(__dirname, '../../public/static/index_socket.js'), 'utf8')
	const indexSource = fs.readFileSync(path.join(__dirname, '../../public/static/index.js'), 'utf8')

	for(const storageKey of [
		'lolwiki_api_account_id',
		'lolwiki_api_password',
		'lolwiki_api_access_token',
		'lolwiki_api_refresh_token',
		'lolwiki_api_device_id',
		'lolwiki_api_user_key'
	])
		assert.match(lolSource, new RegExp(storageKey))

	assert.match(lolSource, /function lol_get_api_auth\(\)/)
	assert.match(lolSource, /function lol_add_api_auth\(data\)/)
	assert.match(lolSource, /socket\.emit\('lol_api_restore', \{ auth: lol_get_api_auth\(\) \}\)/)
	assert.match(socketSource, /socket\.on\('lol_api_tokens'/)
	assert.match(socketSource, /lol_store_api_tokens\(auth\)/)
	assert.doesNotMatch(lolSource + socketSource + indexSource, /g_storage_lol_key|lol_login_instantly|계정 코드|lol_encode_account_code|lol_decode_account_code/)
})

test('concurrent post and comment requests share one token refresh when both get 401', async () => {
	let refreshCalls = 0
	const client = createLolWikiClient(async options => {
		await Promise.resolve() // 두 요청이 함께 401을 받도록 한 박자 늦춘다
		if(options.uri.endsWith('/auth/refresh')) {
			refreshCalls++
			if(options.body.refresh_token !== 'refresh-1')
				throw unauthorized('refresh token already used')
			return { auth: { access_token: 'fresh-access', refresh_token: 'refresh-2' } }
		}
		if(options.headers.Authorization !== 'Bearer fresh-access')
			throw unauthorized()
		if(options.uri.endsWith('/legacy-read-compat/post'))
			return { post: samplePost }
		if(options.uri.endsWith('/legacy-read-compat/comments'))
			return { results: [{ comment_seq: 1, body: '댓글', author_id: 'other' }] }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const source = { access_token: 'expired-access', refresh_token: 'refresh-1', device_id: 'browser-1', user_key: 'user-1' }
	const { auth } = browserAuth(client, source)

	const [post, replies] = await Promise.all([
		client.getArticleDetail('user-1', '8526228', auth),
		client.getArticleReplies('user-1', '8526228', auth)
	])
	assert.equal(post.post_seq, '8526228')
	assert.equal(replies.length, 1)
	assert.equal(refreshCalls, 1)
	assert.equal(source.access_token, 'fresh-access')
	assert.equal(source.refresh_token, 'refresh-2')
})

test('article author id comes from posts already fetched, since posts are never edited', async () => {
	let postRequests = 0
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/legacy-read-compat/post')) {
			postRequests++
			return { post: samplePost }
		}
		throw new Error(`unexpected request: ${options.uri}`)
	})

	assert.equal(await client.getArticleAuthorId('999'), 'user-key') // 처음 보는 글은 요청한다
	assert.equal(postRequests, 1)

	await client.getArticleDetail('LoLWikiDJ_Guest', '8526228', null)
	assert.equal(postRequests, 2)
	assert.equal(await client.getArticleAuthorId('8526228'), 'user-key')
	assert.equal(postRequests, 2) // 상세에서 받아 둔 작성자를 그대로 쓴다
})

test('dates are sent as plain Korea time whether or not the API attaches a time zone', () => {
	assert.equal(normalizeComment({ created_at: '2026-07-21T15:47:26+09:00' }).reply_date, '2026-07-21 15:47:26')
	assert.equal(normalizeComment({ created_at: '2026-07-21T06:47:26Z' }).reply_date, '2026-07-21 15:47:26')
	assert.equal(normalizeListPost({ created_at: '2026-07-21T15:44:15' }).post_date, '2026-07-21 15:44:15')
	assert.equal(normalizeListPost({ created_at: '2026-07-21T15:44:15.123456' }).post_date, '2026-07-21 15:44:15')
	assert.equal(normalizeComment({ created_at: '' }).reply_date, '')
})

test('a dislike sends action=down and reports the refreshed like count and my vote state', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/vote'))
			return { status: 'OK', vote: 'down' }
		if(options.uri.endsWith('/legacy-read-compat/post'))
			return { status: 'OK', post: { post_seq: 30, likes: 4, vote: 'down' } }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-8', user_key: 'user-8' })

	const result = await client.votePost('30', 'user-8', auth, 'down')

	assert.deepEqual(calls[0].body, { action: 'down' })
	assert.equal(calls[1].qs.post_seq, '30')
	assert.equal(calls[1].qs.local_user_key, 'user-8') // 내 표 상태(vote)를 받기 위한 키
	assert.deepEqual(result, { ok: true, vote: 'down', likes: 4, post_seq: '30' })
})

test('nickname change returns the server reason instead of throwing when the API rejects it', async () => {
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/users/me'))
			return { user: { local_user_key: 'user-7', nickname: '옛닉' } }
		if(options.uri.endsWith('/users')) {
			const error = new Error('422 - rejected')
			error.statusCode = 422
			error.error = { detail: [{ msg: 'Value error, NICKNAME_CHANGE_COOLDOWN' }] } // FastAPI 형식
			throw error
		}
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-7', user_key: 'user-7' })

	const result = await client.changeNickname('user-7', '새닉', auth)

	assert.equal(result.ok, false)
	assert.equal(result.status_code, 422)
	assert.equal(result.message, 'Value error, NICKNAME_CHANGE_COOLDOWN')
})

test('nickname change reports the nickname the server saved', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/users/me'))
			return { user: { local_user_key: 'user-7', nickname: '옛닉', motto: '모토', avatar_image_id: 'avatar-1' } }
		if(options.uri.endsWith('/users'))
			return { status: 'OK', user: { nickname: '새닉' } }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-7', user_key: 'user-7' })

	const result = await client.changeNickname('user-7', '새닉', auth)

	assert.deepEqual(result, { ok: true, nickname: '새닉', message: '' })
	assert.equal(calls[1].body.nickname, '새닉')
	assert.equal(calls[1].body.motto, '모토') // /users 는 프로필 전체를 덮어쓰므로 기존 값을 함께 보낸다
	assert.equal(calls[1].body.avatar_image_id, 'avatar-1')
})

test('GIF and WebP attachments are uploaded in their original format instead of JPEG', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri === constants.IMAGE_UPLOAD_URL)
			return { data: { id: `img-${calls.length}` } }
		return { status: 'OK' }
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-9', user_key: 'user-9' })

	await client.writePost('user-9', '제목', '본문', '', [{ image: 'QUJD', image_format: 'webp' }], auth)
	await client.writeReply('10', 'user-9', '댓글', 'QUJD', auth, { imageFormat: 'gif' })
	await client.writeReply('10', 'user-9', '댓글', 'QUJD', auth, { imageFormat: 'bmp' }) // 모르는 형식은 JPEG 로

	const uploads = calls.filter(call => call.uri === constants.IMAGE_UPLOAD_URL)
	assert.deepEqual(uploads.map(call => call.formData.image.options.contentType), ['image/webp', 'image/gif', 'image/jpeg'])
	assert.ok(uploads[0].formData.image.options.filename.endsWith('.webp'))
	assert.equal(uploads[0].headers.Authorization, undefined) // 이미지 서버는 Authorization 이 붙으면 거부한다

	const post = calls.find(call => call.uri.endsWith('/board/legacy-write/posts'))
	assert.equal(post.body.image_format, 'webp')
	const replies = calls.filter(call => call.uri.endsWith('/posts/10/comments'))
	assert.deepEqual(replies.map(call => call.body.image_format), ['gif', 'jpg'])
	const pending = calls.filter(call => call.uri.endsWith('/images/pending'))
	assert.deepEqual(pending.map(call => call.body.image_format), ['webp', 'gif', 'jpg'])
})

test('detail posts expose my vote state for the vote buttons', () => {
	assert.equal(normalizeDetailPost(Object.assign({}, samplePost, { vote: 'up' }), null).my_vote, 'up')
	assert.equal(normalizeDetailPost(samplePost, null).my_vote, 'neutral')
})

test('posts with several photos send attachments with byte sizes, in the order given', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri === constants.IMAGE_UPLOAD_URL)
			return { data: { id: `img-${options.formData.image.options.contentType}` } }
		return { status: 'OK' }
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-10', user_key: 'user-10' })

	const result = await client.writePost('user-10', '제목', '본문', '', [
		{ image: 'QUJD', image_format: 'jpg' },
		{ image: 'QUJDRA==', image_format: 'webp' }
	], auth)

	const post = calls.find(call => call.uri.endsWith('/board/legacy-write/posts'))
	assert.deepEqual(post.body.attachments, [
		{ image_id: 'img-image/jpeg', image_format: 'jpg', byte_size: 3 },
		{ image_id: 'img-image/webp', image_format: 'webp', byte_size: 4 }
	])
	assert.equal(post.body.image_id, undefined) // 2장 이상은 attachments 만
	const pending = calls.filter(call => call.uri.endsWith('/images/pending'))
	assert.deepEqual(pending.map(call => call.body.byte_size), [3, 4])
	assert.deepEqual(result, { attached: 2, total: 2, image_error: '' })
})

test('if the server rejects attachments the post is retried with one photo and the same request id', async () => {
	const posts = []
	const client = createLolWikiClient(async options => {
		if(options.uri === constants.IMAGE_UPLOAD_URL)
			return { data: { id: 'img' } }
		if(options.uri.endsWith('/board/legacy-write/posts')) {
			posts.push(options.body)
			if(options.body.attachments) {
				const error = new Error('422')
				error.statusCode = 422
				error.error = { detail: [{ msg: 'Value error, IMAGE_SIZE_REQUIRED' }] }
				throw error
			}
		}
		return { status: 'OK' }
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-11', user_key: 'user-11' })

	const result = await client.writePost('user-11', '제목', '본문', '', [{ image: 'QUJD' }, { image: 'QUJD' }], auth)

	assert.equal(posts.length, 2)
	assert.equal(posts[1].image_id, 'img')
	assert.equal(posts[1].attachments, undefined)
	assert.equal(posts[1].request_id, posts[0].request_id)
	assert.equal(result.attached, 1)
	assert.equal(result.total, 2)
	assert.match(result.image_error, /IMAGE_SIZE_REQUIRED/)
})

test('a reply to a comment carries its parent id', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		return { status: 'OK' }
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-12', user_key: 'user-12' })

	await client.writeReply('10', 'user-12', '@누군가 답글', '', auth, { parentId: '55' })

	assert.equal(calls[0].body.parent_id, 55)
	assert.equal(calls[0].body.image_id, '')
})

test('blocking resolves the numeric author id from the new post id and clears the block cache', async () => {
	const calls = []
	const client = createLolWikiClient(async options => {
		calls.push(options)
		if(options.uri.endsWith('/legacy-read-compat/post'))
			return { post: Object.assign({}, samplePost, { post_seq: 8526228, author_id: 'legacy-author' }) }
		if(options.uri.endsWith('/board/posts'))
			return { results: [{ id: 1000, legacy_post_seq: 8526300 }] } // offset 7526300
		if(options.uri.endsWith('/board/posts/928'))
			return { post: { id: 928, legacy_post_seq: 8526228, author: { id: 77, nickname: '작성자' } } }
		if(options.uri.endsWith('/blocks'))
			return { status: 'OK' }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-13', user_key: 'user-13' })

	const result = await client.blockUser('8526228', auth)

	assert.deepEqual(result, { ok: true, nickname: '작성자', blocked_user_id: 77 })
	const block = calls.find(call => call.uri.endsWith('/blocks') && call.method === 'POST')
	assert.deepEqual(block.body, { blocker_local_user_key: 'user-13', blocked_user_id: 77, blocked: true })
	assert.equal(block.headers.Authorization, 'Bearer token')
})

test('the block list is normalized and unblocking all removes every entry', async () => {
	const posted = []
	let listed = 0
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/blocks') && options.method === 'GET') {
			listed++
			return listed === 1
				? { results: [{ id: 5, nickname: '갑', avatar_url: 'https://img.lolwiki.kr/i/a/thumb', created_at: '2026-07-21T15:47:26+09:00' }, { id: 6, nickname: '을' }], block_limit: 50 }
				: { results: [], block_limit: 50 }
		}
		if(options.uri.endsWith('/blocks') && options.method === 'POST') {
			posted.push(options.body)
			return { status: 'OK' }
		}
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-14', user_key: 'user-14' })

	const after = await client.unblock(auth, 'all')

	assert.deepEqual(posted, [
		{ blocker_local_user_key: 'user-14', blocked_user_id: 5, blocked: false },
		{ blocker_local_user_key: 'user-14', blocked_user_id: 6, blocked: false }
	])
	assert.deepEqual(after, { results: [], block_limit: 50 })

	listed = 0
	const list = await client.listBlocks(auth)
	assert.equal(list.results[0].created_at, '2026-07-21 15:47:26')
	assert.equal(list.results[1].avatar_url, '')
})

test('setting and clearing the fixed image keeps the rest of the profile', async () => {
	const users = []
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/users/me'))
			return { user: { local_user_key: 'user-15', nickname: '닉', motto: '모토', avatar_image_id: 'avatar', fixed_image_id: 'old-fixed' } }
		if(options.uri === constants.IMAGE_UPLOAD_URL)
			return { data: { id: 'new-fixed' } }
		if(options.uri.endsWith('/users')) {
			users.push(options.body)
			return { status: 'OK' }
		}
		return { status: 'OK' }
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-15', user_key: 'user-15' })

	await client.setFixedImage('QUJD', auth)
	await client.clearFixedImage(auth)

	assert.deepEqual(users[0], { local_user_key: 'user-15', nickname: '닉', motto: '모토', avatar_image_id: 'avatar', fixed_image_id: 'new-fixed' })
	assert.deepEqual(users[1], { local_user_key: 'user-15', nickname: '닉', motto: '모토', avatar_image_id: 'avatar', clear_fixed_image: true })
})

test('a post is mine when its author id matches any identifier of my profile (legacy accounts use legacy_id)', async () => {
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/users/me'))
			return { user: { id: 1011, local_user_key: 'legacy:abc', legacy_id: 'CD19-UUID', nickname: '나' } }
		if(options.uri.endsWith('/legacy-read-compat/post'))
			return { post: Object.assign({}, samplePost, { author_id: 'CD19-UUID' }) }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-16' })

	await client.getUserInfo(auth) // 로그인·복원 때 받아 두는 프로필
	const detail = await client.getArticleDetail('legacy:abc', '8526228', auth)

	assert.equal(detail.my_post, '1')
	assert.equal(normalizeDetailPost(samplePost, { local_user_key: 'legacy:abc' }).my_post, '0') // 남의 글
})

test('notifications and memo threads are normalized for the notification center', async () => {
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/users/me'))
			return { user: { id: 1011, local_user_key: 'legacy:abc', nickname: '나' } }
		if(options.uri.endsWith('/push/notifications'))
			return { unread_count: 2, results: [
				{ id: 7, title: '새 댓글', body: '누가 댓글을 달았습니다', created_at: '2026-07-21T15:47:26+09:00', read: false, deep_link: 'lolwiki://post/8526228?comment=5' },
				{ id: 8, title: '공지', body: '', created_at: '2026-07-21T15:00:00', read: true }
			] }
		if(options.uri.endsWith('/memos'))
			return { results: [
				{ id: 'th-1', other_nickname: '친구', other_avatar_url: 'https://img.lolwiki.kr/i/a/thumb', last_body: '', last_image_id: 'img', last_message_at: '2026-07-21T15:47:26+09:00', unread_count: 3 },
				{ id: 'th-2', other_nickname: '둘', last_body: '안녕', updated_at: '2026-07-20T10:00:00', unread_count: 0 }
			] }
		if(options.uri.endsWith('/memos/th-1'))
			return { results: [
				{ id: 1, sender_user_id: 1011, body: '내가 보냄', created_at: '2026-07-21T15:47:26+09:00' },
				{ id: 2, sender_id: 2022, body: '', image_id: 'pic', created_at: '2026-07-21T15:48:00+09:00' }
			] }
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-17', user_key: 'legacy:abc' })

	const notifs = await client.listNotifications(auth)
	assert.equal(notifs.unread_count, 2)
	assert.deepEqual(notifs.results[0], { id: 7, title: '새 댓글', body: '누가 댓글을 달았습니다', created_at: '2026-07-21 15:47:26', read: false, post_seq: '8526228' })
	assert.equal(notifs.results[1].post_seq, '')

	const threads = await client.listMemoThreads(auth)
	assert.equal(threads.unread_count, 3)
	assert.equal(threads.results[0].last_body, '[이미지]')
	assert.equal(threads.results[1].last_message_at, '2026-07-20 10:00:00')

	const thread = await client.getMemoThread(auth, 'th-1')
	assert.deepEqual(thread.messages.map(m => [m.mine, m.body, m.image_url]), [[true, '내가 보냄', ''], [false, '', 'https://img.lolwiki.kr/i/pic/resize']])

	assert.deepEqual(await client.unreadCounts(auth), { notifications: 2, memos: 3, total: 5 })
})

test('sending a memo posts the body with my key and nickname, then returns the refreshed thread', async () => {
	const posts = []
	const client = createLolWikiClient(async options => {
		if(options.uri.endsWith('/users/me'))
			return { user: { id: 1011, local_user_key: 'legacy:abc', nickname: '나' } }
		if(options.uri.endsWith('/memos/th-1/messages')) {
			posts.push(options.body)
			return { status: 'OK' }
		}
		if(options.uri.endsWith('/memos/th-1'))
			return { messages: [{ id: 1, sender_user_id: 1011, body: '보낸 글', created_at: '2026-07-21T15:47:26' }] }
		if(options.uri.endsWith('/push/notifications/read')) {
			posts.push(options.body)
			return { status: 'OK' }
		}
		throw new Error(`unexpected request: ${options.uri}`)
	})
	const { auth } = browserAuth(client, { access_token: 'token', device_id: 'browser-18', user_key: 'legacy:abc' })

	const thread = await client.sendMemo(auth, 'th-1', '보낸 글')
	await client.readNotification(auth, 7)
	await client.readNotification(auth)

	assert.deepEqual(posts[0], { sender_local_user_key: 'legacy:abc', sender_nickname: '나', body: '보낸 글' })
	assert.equal(thread.messages[0].mine, true)
	assert.deepEqual(posts[1], { local_user_key: 'legacy:abc', notification_id: 7 })
	assert.deepEqual(posts[2], { local_user_key: 'legacy:abc' })
})
